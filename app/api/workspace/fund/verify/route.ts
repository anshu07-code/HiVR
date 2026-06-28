import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyWorkspaceParties } from "@/lib/notifications/helpers";
import crypto from "crypto";

/**
 * POST /api/workspace/fund/verify
 *
 * Called by the FundEscrowModal AFTER the user completes payment in
 * the Razorpay checkout UI. Razorpay returns:
 *   - razorpay_order_id
 *   - razorpay_payment_id
 *   - razorpay_signature
 *
 * Flow (HiVR wallet-first policy):
 *   1. Verify the signature.
 *   2. Look up the workspace and the assigned employee.
 *   3. Compute the platform fee using the employee's trust tier.
 *   4. Credit the buyer's HiVR wallet with (escrow_amount - platform_fee).
 *      This is the net amount that lands in the wallet — the platform
 *      fee is recognized as HiVR's revenue at this point.
 *   5. Auto-debit the wallet to fund the workspace escrow.
 *   6. Mark the workspace as funded.
 *   7. Notify both parties.
 *
 * The end result: every rupee that comes in from Razorpay first lands
 * in the buyer's wallet (net of platform fee), then is debited into
 * the workspace escrow. The wallet is the single source of truth for
 * "money the buyer controls".
 *
 * Body: {
 *   workspaceId: string,
 *   razorpay_order_id: string,
 *   razorpay_payment_id: string,
 *   razorpay_signature: string
 * }
 */

export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const workspaceId = String(body.workspaceId ?? "");
  const orderId = String(body.razorpay_order_id ?? "");
  const paymentId = String(body.razorpay_payment_id ?? "");
  const signature = String(body.razorpay_signature ?? "");

  if (!workspaceId || !orderId || !paymentId || !signature) {
    return NextResponse.json({ ok: false, error: "Missing payment fields" }, { status: 400 });
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET ?? "";
  if (!keySecret || keySecret.includes("...")) {
    return NextResponse.json({ ok: false, error: "Razorpay key secret not configured" }, { status: 503 });
  }

  // 1. Verify signature
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  const sigBuf = Buffer.from(signature, "hex");
  const expBuf = Buffer.from(expected, "hex");
  const sigValid = sigBuf.length === expBuf.length &&
    crypto.timingSafeEqual(sigBuf, expBuf);

  if (!sigValid) {
    return NextResponse.json({
      ok: false,
      error: "Payment signature invalid — refusing to credit escrow.",
      code: "SIGNATURE_INVALID",
    }, { status: 400 });
  }

  const admin = createAdminClient();

  // 2. Load the workspace and the contract (to find the employee and
  //    determine the platform fee from their trust tier).
  const { data: ws } = await admin
    .from("workspaces")
    .select("id, status, escrow_amount_paise, escrow_funded, buyer_id, employee_id, contract_id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (!ws) return NextResponse.json({ ok: false, error: "Workspace not found" }, { status: 404 });
  const w = ws as any;
  if (w.buyer_id !== user.id) {
    return NextResponse.json({ ok: false, error: "Only the buyer can fund this workspace" }, { status: 403 });
  }
  if (w.escrow_funded) {
    return NextResponse.json({ ok: false, error: "Escrow is already funded" }, { status: 400 });
  }
  if (w.status === "cancelled" || w.status === "frozen") {
    return NextResponse.json({ ok: false, error: `Cannot fund a ${w.status} workspace` }, { status: 400 });
  }

  // 3. Compute the platform fee from the employee's trust tier
  const { data: feePct } = await admin.rpc("get_platform_fee_pct" as any, { p_user_id: w.employee_id } as any);
  const feeDecimal = Number(feePct ?? 0.15);
  const grossPaise = Number(w.escrow_amount_paise);
  const platformFeePaise = Math.floor(grossPaise * feeDecimal);
  const netWalletCreditPaise = grossPaise - platformFeePaise;

  // 4. Credit the buyer's wallet (net of platform fee)
  const { data: walletRes } = await admin.rpc("wallet_credit" as any, {
    p_user_id: user.id,
    p_amount_paise: netWalletCreditPaise,
    p_kind: "add_funds",
    p_description: `Razorpay top-up for workspace ${workspaceId} (net of ${(feeDecimal * 100).toFixed(0)}% platform fee)`,
    p_ref_type: "razorpay_payment",
    p_ref_id: paymentId,
    p_metadata: {
      workspace_id: workspaceId,
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      gross_paise: grossPaise,
      platform_fee_paise: platformFeePaise,
      platform_fee_pct: feeDecimal,
    },
  } as any);
  const wRes = walletRes as any;
  if (!wRes || !wRes.ok) {
    return NextResponse.json({
      ok: false,
      error: wRes?.error ?? "Failed to credit wallet",
    }, { status: 500 });
  }

  // 5. Auto-debit the wallet to fund the workspace escrow
  const { data: debitRes } = await admin.rpc("wallet_debit_for_escrow" as any, {
    p_workspace_id: workspaceId,
    p_amount_paise: netWalletCreditPaise,
    p_user_id: user.id,
    p_description: `Funded workspace escrow (after platform fee of ${platformFeePaise} paise)`,
  } as any);
  const dRes = debitRes as any;
  if (!dRes || !dRes.ok) {
    return NextResponse.json({
      ok: false,
      error: dRes?.error ?? "Failed to debit wallet for escrow",
    }, { status: 500 });
  }

  // 6. Record the gross payment + platform fee in the payments table
  //    (for accounting and future release logic).
  const { data: contract } = await admin
    .from("contracts")
    .select("id, agreed_price")
    .eq("id", w.contract_id)
    .maybeSingle();
  await admin.from("payments").insert({
    contract_id: w.contract_id,
    amount: grossPaise,
    platform_fee_amount: platformFeePaise,
    razorpay_payment_id: paymentId,
    razorpay_order_id: orderId,
    status: "in_escrow",
    escrow_released: false,
    created_at: new Date().toISOString(),
    metadata: {
      gross_paise: grossPaise,
      platform_fee_paise: platformFeePaise,
      platform_fee_pct: feeDecimal,
      buyer_id: user.id,
      workspace_id: workspaceId,
      via: "razorpay_via_wallet",
    },
  } as any);

  // 7. Mark the workspace as funded
  await admin.rpc("fund_workspace_escrow" as any, {
    p_workspace_id: workspaceId,
    p_provider: "razorpay_via_wallet",
    p_payment_id: paymentId,
  } as any);

  // 8. Notify both parties
  await notifyWorkspaceParties(workspaceId, {
    kind: "workspace_funded",
    title: "Escrow funded ✓",
    body: "The buyer has funded the escrow. The workspace is now active — the employee can start work.",
    link: `/dashboard/workspaces/${workspaceId}`,
  });

  return NextResponse.json({
    ok: true,
    workspaceId,
    paymentId,
    orderId,
    gross_paise: grossPaise,
    platform_fee_paise: platformFeePaise,
    wallet_credit_paise: netWalletCreditPaise,
    new_balance_paise: wRes.balance,
  });
}
