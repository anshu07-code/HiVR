/**
 * Dev-only: in sandbox / when RAZORPAY is bypassed, the client posts here
 * to "complete" the payment. We forward the event to the same code path
 * the real Razorpay webhook uses.
 *
 * Never use this in production. Guarded by BYPASS_RAZORPAY_PAYOUTS.
 */
import { NextRequest, NextResponse } from "next/server";
import { isRazorpayPayoutBypassed } from "@/lib/razorpay-payouts";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!isRazorpayPayoutBypassed()) {
    return NextResponse.json({ error: "Dev simulator is disabled (Razorpay is live)." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { orderId, paymentId, amountPaise, contractId, event } = body as {
    orderId?: string;
    paymentId?: string;
    amountPaise?: number;
    contractId?: string;
    event?: string;
  };
  if (!orderId || !paymentId || !contractId) {
    return NextResponse.json({ error: "Missing orderId/paymentId/contractId" }, { status: 400 });
  }

  const sb = createClient();

  // Idempotency: skip if we've seen this payment_id
  const { data: existing } = await sb.from("webhook_events")
    .select("id").eq("provider", "razorpay_dev").eq("event_id", paymentId).maybeSingle();
  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true });
  }
  await sb.from("webhook_events").insert({
    provider: "razorpay_dev",
    event_id: paymentId,
    event_type: event ?? "payment.captured",
    payload: body as any,
  } as any);

  // Pull the contract by the orderId we stashed earlier
  const { data: contract } = await sb.from("contracts")
    .select("id, business_id, status, advance_paise, advance_paid_at")
    .eq("id", contractId).maybeSingle();
  if (!contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });

  if (!(contract as any).advance_paid_at) {
    await sb.from("contracts").update({
      advance_paid_at: new Date().toISOString(),
      advance_payment_id: paymentId,
      status: (contract as any).status === "pending" ? "active" : (contract as any).status,
    } as any).eq("id", contractId);

    // Bump active_contracts_count on the subscription
    const { count } = await sb.from("contracts").select("id", { count: "exact", head: true })
      .eq("business_id", (contract as any).business_id).in("status", ["active", "pending"]);
    await sb.from("business_subscriptions").update({ active_contracts_count: count ?? 0 } as any)
      .eq("business_id", (contract as any).business_id).in("status", ["active", "trialing"]);
  }

  return NextResponse.json({ ok: true, amountPaise, paymentId });
}
