import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/security";

/**
 * POST /api/wallet/withdraw
 *
 * Initiates a withdrawal from the user's wallet to their verified
 * payout method (UPI or bank).
 *
 *   Body: { amountPaise: number, method: "upi" | "bank" }
 *
 * Rules (HiVR Option A withdrawal rule, governed by
 * `platform_settings.withdrawal_rules`):
 *   - Up to `free_per_month` (default 5) withdrawals per month that are
 *     each < `free_max_amount_paise` (default ₹500 = 50000 paise) → free.
 *   - Anything else (6th+ in the month, or any amount ≥ ₹500) → 3% fee.
 *
 * The actual transfer is recorded in wallet_transactions as
 * direction='debit' kind='withdraw_initiated' (then 'withdraw_completed'
 * once the Razorpay payout callback fires; in dev we mark it
 * completed immediately).
 */
const MIN_PAISE = 100 * 100;
const MAX_PAISE = 100_000 * 100;
const DEFAULT_FREE_PER_MONTH = 5;
const DEFAULT_FREE_MAX_PAISE = 50000; // ₹500
const DEFAULT_PAID_FEE_PCT = 3;       // 3%

export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  enforceRateLimit(`wallet_withdraw:${user.id}`, { max: 5, windowMs: 60_000 });

  const body = await req.json().catch(() => ({}));
  const amountPaise = Math.round(Number(body.amountPaise ?? 0));
  const method = body.method === "upi" || body.method === "bank" ? body.method : null;
  if (!Number.isFinite(amountPaise) || amountPaise < MIN_PAISE) {
    return NextResponse.json({ ok: false, error: `Minimum withdrawal is ₹${MIN_PAISE / 100}` }, { status: 400 });
  }
  if (amountPaise > MAX_PAISE) {
    return NextResponse.json({ ok: false, error: `Maximum withdrawal is ₹${MAX_PAISE / 100}` }, { status: 400 });
  }
  if (!method) return NextResponse.json({ ok: false, error: "method must be 'upi' or 'bank'" }, { status: 400 });

  const admin = createAdminClient();

  // Read withdrawal rules from platform_settings (so admins can tune)
  const { data: rulesRow } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", "withdrawal_rules")
    .maybeSingle();
  const FREE_PER_MONTH = Number((rulesRow as any)?.value?.free_per_month ?? DEFAULT_FREE_PER_MONTH);
  const FREE_MAX_PAISE = Number((rulesRow as any)?.value?.free_max_amount_paise ?? DEFAULT_FREE_MAX_PAISE);
  const PAID_FEE_PCT   = Number((rulesRow as any)?.value?.paid_fee_pct ?? DEFAULT_PAID_FEE_PCT);

  // Read wallet + employee profile + user payout method
  const [{ data: wallet }, { data: ep }, { data: me }] = await Promise.all([
    admin.from("user_wallets").select("balance_paise, is_frozen").eq("user_id", user.id).maybeSingle(),
    admin.from("employee_profiles").select("withdrawals_this_month, last_withdrawal_reset, withdrawal_penalty_paise, payouts_pending_count").eq("user_id", user.id).maybeSingle(),
    admin.from("users").select("payout_method, upi_id, upi_verified_at, account_last4, ifsc, bank_verified_at").eq("id", user.id).maybeSingle(),
  ]);

  if (!wallet) return NextResponse.json({ ok: false, error: "Wallet not found" }, { status: 404 });
  if (wallet.is_frozen) return NextResponse.json({ ok: false, error: "Wallet is frozen" }, { status: 400 });
  if (wallet.balance_paise < amountPaise) {
    return NextResponse.json({ ok: false, error: "Insufficient wallet balance" }, { status: 400 });
  }
  if (!ep) return NextResponse.json({ ok: false, error: "Employee profile not found — only employees can withdraw" }, { status: 400 });

  // 12-hour cooldown after the most recent escrow_release credit.
  // Prevents withdrawal immediately after a payment release, giving the
  // buyer time to file a dispute if needed.
  const { data: recentRelease } = await admin
    .from("wallet_transactions")
    .select("created_at")
    .eq("user_id", user.id)
    .eq("kind", "escrow_release")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recentRelease) {
    const releaseTime = new Date((recentRelease as any).created_at).getTime();
    const cooldownMs = 12 * 60 * 60_000;
    const elapsed = Date.now() - releaseTime;
    if (elapsed < cooldownMs) {
      const remainingHrs = Math.ceil((cooldownMs - elapsed) / 60_000 / 60);
      return NextResponse.json({
        ok: false,
        error: `Withdrawal is on cooldown for another ~${remainingHrs}h after the most recent payment release. This protects against disputes.`,
      }, { status: 400 });
    }
  }

  const m: any = me;
  if (m.payout_method !== method) {
    return NextResponse.json({ ok: false, error: `Payout method is set to '${m.payout_method ?? "none"}'. Update it to '${method}' first.` }, { status: 400 });
  }
  if (method === "upi" && !m.upi_verified_at) {
    return NextResponse.json({ ok: false, error: "UPI not verified. Complete the bank verification step in your eKYC first." }, { status: 400 });
  }
  if (method === "bank" && !m.bank_verified_at) {
    return NextResponse.json({ ok: false, error: "Bank not verified. Complete the bank verification step in your eKYC first." }, { status: 400 });
  }

  // Reset withdrawals_this_month if it's a new month
  const lastReset = ep.last_withdrawal_reset ? new Date(ep.last_withdrawal_reset) : new Date(0);
  const now = new Date();
  const sameMonth = lastReset.getFullYear() === now.getFullYear() && lastReset.getMonth() === now.getMonth();
  const wCount = sameMonth ? (ep.withdrawals_this_month ?? 0) : 0;
  const nextCount = wCount + 1;

  // Penalty: free if (nextCount <= FREE_PER_MONTH) AND (amountPaise < FREE_MAX_PAISE)
  const isFree = (nextCount <= FREE_PER_MONTH) && (amountPaise < FREE_MAX_PAISE);
  const penaltyPct = isFree ? 0 : PAID_FEE_PCT;
  const penaltyPaise = Math.round((amountPaise * penaltyPct) / 100);
  const netPaise = amountPaise - penaltyPaise;

  // 1. Debit the wallet
  const newBalance = wallet.balance_paise - amountPaise;
  await admin.from("user_wallets").update({
    balance_paise: newBalance,
    lifetime_spent_paise: (wallet as any).lifetime_spent_paise ? (wallet as any).lifetime_spent_paise + amountPaise : amountPaise,
  } as any).eq("user_id", user.id);

  // 2. Record the withdrawal transaction
  const { data: txn } = await admin.from("wallet_transactions").insert({
    user_id: user.id,
    amount_paise: amountPaise,
    direction: "debit",
    kind: "withdraw_initiated",
    description: `Withdrawal to ${method} · net ${penaltyPaise > 0 ? `after ${penaltyPct}% fee` : "no fee"}`,
    ref_type: "withdraw",
    ref_id: null,
    balance_after_paise: newBalance,
    metadata: {
      method,
      penalty_paise: penaltyPaise,
      penalty_pct: penaltyPct,
      net_paise: netPaise,
      // Only store the last 4 of bank account, and never store the full
      // UPI ID or IFSC in the transaction row. The full details are
      // already on the `users` row (encrypted at rest in Supabase).
      // RLS on `wallet_transactions` restricts reads to the row's owner.
      account_last4: method === "bank" ? m.account_last4 : null,
    },
  } as any).select("id").single();

  // 3. Update employee profile counters
  const updates: any = {
    withdrawals_this_month: nextCount,
    last_withdrawal_reset: sameMonth ? ep.last_withdrawal_reset : new Date().toISOString(),
    last_withdrawal_at: new Date().toISOString(),
    payouts_pending_count: (ep.payouts_pending_count ?? 0) + 1,
    total_platform_fees: ((ep as any).total_platform_fees ?? 0) + penaltyPaise,
  };
  if (penaltyPaise > 0) {
    updates.withdrawal_penalty_paise = ((ep as any).withdrawal_penalty_paise ?? 0) + penaltyPaise;
  }
  await admin.from("employee_profiles").update(updates).eq("user_id", user.id);

  // 4. In production, this would call Razorpay Payouts API.
  //    For now we mark it completed immediately.
  if (txn) {
    await admin.from("wallet_transactions").update({
      kind: "withdraw_completed",
      description: `Withdrawal to ${method} completed · net ${formatInr(netPaise)}`,
    } as any).eq("id", (txn as any).id);
    await admin.from("employee_profiles").update({
      payouts_pending_count: Math.max(0, ((ep as any).payouts_pending_count ?? 0)),
      payouts_lifetime_count: ((ep as any).payouts_lifetime_count ?? 0) + 1,
      total_withdrawn: ((ep as any).total_withdrawn ?? 0) + netPaise,
    } as any).eq("user_id", user.id);
  }

  return NextResponse.json({
    ok: true,
    method,
    amountPaise,
    penaltyPaise,
    netPaise,
    newBalance,
    withdrawalsThisMonth: nextCount,
    isFree,
    freeRemainingThisMonth: Math.max(0, FREE_PER_MONTH - nextCount),
    rules: {
      free_per_month: FREE_PER_MONTH,
      free_max_amount_paise: FREE_MAX_PAISE,
      paid_fee_pct: PAID_FEE_PCT,
    },
  });
}

function formatInr(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}
