import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyWorkspaceParties } from "@/lib/notifications/helpers";
import { SecurityError, requireUuid, enforceRateLimit } from "@/lib/security";
import { createRazorpayOrder, isRazorpayConfigured } from "@/lib/razorpay";

/**
 * POST /api/workspace/fund/direct-razorpay-escrow
 *
 * Creates a Razorpay order for funding the workspace escrow DIRECTLY
 * (no wallet top-up). The money flows:
 *
 *   buyer's bank → Razorpay → Razorpay's escrow account
 *
 * On completion of the contract (`mark_workspace_done`):
 *   - The employee's wallet gets `pending_paise` (NOT `balance_paise`)
 *     because the money is still in Razorpay's escrow, not in HiVR's pool.
 *   - The HiVR Revenue wallet gets `pending_paise` for the same reason.
 *   - When Razorpay's `transfer.processed` webhook fires (money
 *     settled to HiVR's pooled account), both wallets get
 *     pending_paise → balance_paise.
 *
 * This is the "Direct Razorpay" path in the FundEscrowModal. The
 * alternative paths are:
 *   - `/api/workspace/fund-from-wallet` — pay from existing wallet
 *   - `/api/workspace/fund/create-order` + `/api/workspace/fund/verify`
 *     — Razorpay top-up to wallet, then auto-debit to escrow
 *
 * Body (create-order phase): { workspaceId, step: "create" }
 * Response: { orderId, amount, currency, keyId, ... }
 *
 * Body (verify phase): {
 *   workspaceId, step: "verify",
 *   razorpay_order_id, razorpay_payment_id, razorpay_signature
 * }
 * Response: { ok: true, paymentId }
 */

export async function POST(req: NextRequest) {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    enforceRateLimit(`workspace_fund_direct_rzp:${user.id}`, { max: 10, windowMs: 60_000 });

    const body = await req.json().catch(() => ({}));
    const step = String(body.step ?? "create");
    const workspaceId = String(body.workspaceId ?? "");

    try {
      requireUuid(workspaceId, "workspaceId");
    } catch (e) {
      if (e instanceof SecurityError) {
        return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
      }
      throw e;
    }

    if (step === "create") {
      return await handleCreate(sb, user.id, workspaceId);
    } else if (step === "verify") {
      return await handleVerify(req, workspaceId, user.id);
    } else {
      return NextResponse.json({ ok: false, error: "step must be 'create' or 'verify'" }, { status: 400 });
    }
  } catch (e) {
    if (e instanceof SecurityError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

async function handleCreate(sb: ReturnType<typeof createClient>, userId: string, workspaceId: string) {
  if (!isRazorpayConfigured()) {
    return NextResponse.json({
      ok: false,
      error: "Razorpay keys not configured. Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, and NEXT_PUBLIC_RAZORPAY_KEY_ID in .env.local, then restart `next dev`.",
      needsKeys: true,
    }, { status: 503 });
  }

  const admin = createAdminClient();
  const { data: ws } = await admin
    .from("workspaces")
    .select("id, status, escrow_amount_paise, escrow_funded, buyer_id, employee_id, contract_id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (!ws) return NextResponse.json({ ok: false, error: "Workspace not found" }, { status: 404 });
  const w = ws as any;
  if (w.buyer_id !== userId) {
    return NextResponse.json({ ok: false, error: "Only the buyer can fund this workspace" }, { status: 403 });
  }
  if (w.escrow_funded) {
    return NextResponse.json({ ok: false, error: "Escrow is already funded" }, { status: 400 });
  }
  if (w.status === "cancelled" || w.status === "frozen") {
    return NextResponse.json({ ok: false, error: `Cannot fund a ${w.status} workspace` }, { status: 400 });
  }

  const { data: profile } = await sb
    .from("users")
    .select("full_name, email, phone")
    .eq("id", userId)
    .maybeSingle();

  // Compute the platform fee so we can record it on the payment row
  const { data: feePct } = await admin.rpc("get_platform_fee_pct" as any, { p_user_id: w.employee_id } as any);
  const feeDecimal = Number(feePct ?? 0.15);
  const grossPaise = Number(w.escrow_amount_paise);
  const platformFeePaise = Math.floor(grossPaise * feeDecimal);

  try {
    const order = await createRazorpayOrder(
      grossPaise,
      `wsd_${workspaceId.replace(/-/g, "").slice(0, 16)}_${Date.now()}`,
      {
        workspace_id: workspaceId,
        buyer_id: userId,
        purpose: "workspace_escrow_direct",  // marks this as direct-escrow, not via-wallet
        contract_id: w.contract_id,
        employee_id: w.employee_id,
        platform_fee_paise: String(platformFeePaise),
      }
    );
    return NextResponse.json({
      ok: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? process.env.RAZORPAY_KEY_ID,
      workspaceId,
      user: {
        name: (profile as any)?.full_name ?? "HiVR User",
        email: (profile as any)?.email ?? "",
        contact: (profile as any)?.phone ?? "",
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message ?? "Could not create Razorpay order" }, { status: 502 });
  }
}

async function handleVerify(req: NextRequest, workspaceId: string, userId: string) {
  const body = await req.json().catch(() => ({}));
  const orderId = String(body.razorpay_order_id ?? "");
  const paymentId = String(body.razorpay_payment_id ?? "");
  const signature = String(body.razorpay_signature ?? "");

  if (!orderId || !paymentId || !signature) {
    return NextResponse.json({ ok: false, error: "Missing payment fields" }, { status: 400 });
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET ?? "";
  if (!keySecret || keySecret.includes("...")) {
    return NextResponse.json({ ok: false, error: "Razorpay key secret not configured" }, { status: 503 });
  }

  // Verify signature
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
  const { data: ws } = await admin
    .from("workspaces")
    .select("id, status, escrow_amount_paise, escrow_funded, buyer_id, employee_id, contract_id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (!ws) return NextResponse.json({ ok: false, error: "Workspace not found" }, { status: 404 });
  const w = ws as any;
  if (w.buyer_id !== userId) {
    return NextResponse.json({ ok: false, error: "Only the buyer can fund this workspace" }, { status: 403 });
  }
  if (w.escrow_funded) {
    return NextResponse.json({ ok: false, error: "Escrow is already funded" }, { status: 400 });
  }

  // Compute the platform fee for this contract
  const { data: feePct } = await admin.rpc("get_platform_fee_pct" as any, { p_user_id: w.employee_id } as any);
  const feeDecimal = Number(feePct ?? 0.15);
  const grossPaise = Number(w.escrow_amount_paise);
  const platformFeePaise = Math.floor(grossPaise * feeDecimal);

  // Record the payment row with status='in_escrow' (Razorpay is
  // holding the money, NOT our pooled account).
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
      buyer_id: userId,
      workspace_id: workspaceId,
      via: "direct_razorpay_escrow",  // marks this as direct-escrow path
    },
  } as any);

  // Mark the workspace as funded. The money is in Razorpay's
  // escrow, not in our pool — but the workspace is now officially
  // funded and the employee can start work.
  await admin.rpc("fund_workspace_escrow" as any, {
    p_workspace_id: workspaceId,
    p_provider: "razorpay_direct",
    p_payment_id: paymentId,
  } as any);

  // Notify both parties
  await notifyWorkspaceParties(workspaceId, {
    kind: "workspace_funded",
    title: "Escrow funded ✓ (Razorpay direct)",
    body: "The buyer has funded the escrow via direct Razorpay payment. The money is held by Razorpay until the work is approved, then HiVR releases it to the employee's wallet.",
    link: `/dashboard/workspaces/${workspaceId}`,
  });

  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/workspaces", "page");
  revalidatePath("/dashboard/contracts", "page");
  revalidatePath("/dashboard/earnings", "page");

  return NextResponse.json({
    ok: true,
    workspaceId,
    paymentId,
    orderId,
    gross_paise: grossPaise,
    platform_fee_paise: platformFeePaise,
    via: "direct_razorpay_escrow",
  });
}
