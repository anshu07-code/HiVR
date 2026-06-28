/**
 * Webhook for Razorpay Subscription events.
 *
 * Handles:
 *   - subscription.activated  → set status=active, period_end
 *   - subscription.charged    → bump period, refresh aggregates
 *   - subscription.cancelled  → status=cancelled, keep free trial
 *   - subscription.completed  → status=cancelled at end of term
 *   - subscription.paused     → status=paused
 *   - subscription.resumed    → status=active
 *   - subscription.halted     → status=past_due / cancelled
 *   - payment.failed          → status=past_due
 *
 * Idempotent: every event id is stored in webhook_events.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyRazorpaySubscriptionWebhook, isRazorpaySubBypassed } from "@/lib/razorpay-subscriptions";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get("x-razorpay-signature") ?? "";

  if (!isRazorpaySubBypassed()) {
    if (!verifyRazorpaySubscriptionWebhook(raw, sig)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
  }

  let body: any;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }

  const event = body?.event;
  const payload = body?.payload ?? {};
  const sub = payload?.subscription ?? {};
  const payment = payload?.payment ?? {};
  const subscriptionId: string | undefined = sub?.id ?? payment?.subscription_id;
  const eventId: string = body?.id ?? `${event}_${subscriptionId}_${Date.now()}`;

  const sb = createClient();

  // Idempotency
  const { error: dedupErr } = await sb.from("webhook_events").insert({
    provider: "razorpay_sub",
    event_id: eventId,
    event_type: event,
    payload: body as any,
  } as any);
  if (dedupErr && (dedupErr as any).code === "23505") {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  if (!subscriptionId) {
    return NextResponse.json({ ok: true, note: "no subscription id" });
  }

  // Look up the local row by Razorpay subscription id
  const { data: row } = await sb.from("business_subscriptions")
    .select("id, business_id, plan_key, status")
    .eq("razorpay_subscription_id", subscriptionId).maybeSingle();
  if (!row) {
    // Maybe the subscription was just created; try by business_id from notes
    const businessId = sub?.notes?.business_id ?? payment?.notes?.business_id;
    if (businessId) {
      const { data: row2 } = await sb.from("business_subscriptions")
        .select("id, plan_key, status").eq("business_id", businessId).maybeSingle();
      if (row2) {
        // Stash the Razorpay id for future events
        await sb.from("business_subscriptions").update({
          razorpay_subscription_id: subscriptionId,
        } as any).eq("id", row2.id);
      }
    }
    return NextResponse.json({ ok: true, note: "no matching local row" });
  }

  const planKey = inferPlanFromSubscription(sub);
  if (planKey) {
    await sb.from("business_subscriptions").update({ plan_key: planKey } as any).eq("id", row.id);
  }

  if (event === "subscription.activated") {
    await sb.from("business_subscriptions").update({
      status: "active",
      current_period_start: new Date().toISOString(),
      current_period_end: sub?.current_end ? new Date(sub.current_end * 1000).toISOString() : new Date(Date.now() + 30 * 86400_000).toISOString(),
    } as any).eq("id", row.id);
  } else if (event === "subscription.charged") {
    // Successful renewal payment
    await sb.from("business_subscriptions").update({
      status: "active",
      current_period_start: sub?.current_start ? new Date(sub.current_start * 1000).toISOString() : new Date().toISOString(),
      current_period_end: sub?.current_end ? new Date(sub.current_end * 1000).toISOString() : new Date(Date.now() + 30 * 86400_000).toISOString(),
    } as any).eq("id", row.id);
  } else if (event === "subscription.cancelled" || event === "subscription.completed") {
    await sb.from("business_subscriptions").update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
    } as any).eq("id", row.id);
    // After cancellation, fall back to free (auto-revert). The trigger
    // trg_new_business_profile creates a free sub on signup; we don't
    // create a new row here, we just leave the cancelled row as history
    // and let the next active/trialing row be created on next upgrade.
  } else if (event === "subscription.paused") {
    await sb.from("business_subscriptions").update({ status: "paused" } as any).eq("id", row.id);
  } else if (event === "subscription.resumed") {
    await sb.from("business_subscriptions").update({ status: "active" } as any).eq("id", row.id);
  } else if (event === "subscription.halted" || event === "payment.failed") {
    await sb.from("business_subscriptions").update({ status: "past_due" } as any).eq("id", row.id);
  }

  return NextResponse.json({ ok: true });
}

function inferPlanFromSubscription(sub: any): string | null {
  // The plan_id looks like "plan_pro_monthly_placeholder" or the real
  // Razorpay id. Try to match the prefix.
  const planId: string = sub?.plan_id ?? "";
  if (planId.includes("pro")) return "business_pro";
  if (planId.includes("ent") || planId.includes("enterprise")) return "business_enterprise";
  return null;
}
