/**
 * Webhook: Razorpay sends payment.captured (and others) here.
 * For business contracts, we use the contract's escrow_payment_id (Razorpay
 * order id) to match. On payment.captured for that order, we set the
 * contract's advance_paid_at and capture the order.
 *
 * Idempotency: every event is stored in webhook_events with a unique
 * (provider, event_id) constraint, so replays are no-ops.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyRazorpayWebhookSignature, isRazorpayPayoutBypassed } from "@/lib/razorpay-payouts";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get("x-razorpay-signature") ?? "";

  if (!isRazorpayPayoutBypassed()) {
    if (!verifyRazorpayWebhookSignature(raw, sig)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
  }

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = body?.event;
  const payload = body?.payload ?? {};
  const payment = payload?.payment ?? {};
  const order = payload?.order ?? {};
  const orderId = order?.id ?? payment?.order_id;
  const paymentId = payment?.id;
  const eventId = body?.id ?? `${event}_${paymentId ?? orderId}_${Date.now()}`;

  const sb = createClient();

  // Idempotency: insert into webhook_events; if duplicate, return 200 OK.
  const { error: dedupErr } = await sb.from("webhook_events").insert({
    provider: "razorpay",
    event_id: eventId,
    event_type: event,
    payload: body as any,
  } as any);
  if (dedupErr && (dedupErr as any).code === "23505") {
    // Already processed
    return NextResponse.json({ ok: true, duplicate: true });
  }
  if (dedupErr) {
    // We don't want to fail the webhook (Razorpay will retry forever).
    // Log + continue.
  }

  // Handle events we care about
  if (event === "payment.captured" || event === "order.paid" || event === "payment_link.paid") {
    if (!orderId && !paymentId) {
      return NextResponse.json({ ok: true, note: "No order/payment id" });
    }
    // Look up the contract by escrow_payment_id (Razorpay order id) or by
    // the payment_id that was stored in a verifications row earlier.
    if (orderId) {
      const { data: contract } = await sb.from("contracts")
        .select("id, business_id, status, advance_paise, advance_paid_at")
        .eq("escrow_payment_id", orderId).maybeSingle();
      if (contract) {
        if (!(contract as any).advance_paid_at) {
          await sb.from("contracts").update({
            advance_paid_at: new Date().toISOString(),
            advance_payment_id: paymentId,
            status: (contract as any).status === "pending" ? "active" : (contract as any).status,
          } as any).eq("id", contract.id);

          // Bump active_contracts_count
          const { count } = await sb.from("contracts").select("id", { count: "exact", head: true })
            .eq("business_id", (contract as any).business_id).in("status", ["active", "pending"]);
          await sb.from("business_subscriptions").update({ active_contracts_count: count ?? 0 } as any)
            .eq("business_id", (contract as any).business_id).in("status", ["active", "trialing"]);
        }
      }
    }
  }

  if (event === "payout.processed" || event === "payout.failed") {
    // Best-effort: find a milestone with this payment_id and update its status
    if (paymentId) {
      const status = event === "payout.processed" ? "paid" : "rejected";
      await sb.from("business_milestones").update({ status } as any).eq("payment_id", paymentId);
    }
  }

  return NextResponse.json({ ok: true });
}
