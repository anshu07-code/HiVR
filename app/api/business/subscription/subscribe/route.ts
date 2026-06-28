/**
 * POST /api/business/subscription/subscribe
 * Body: { businessId, planKey: "business_pro", interval: "monthly"|"yearly" }
 *
 * Creates a Razorpay subscription. The webhook will set the
 * business_subscriptions row to status=active once payment is captured.
 *
 * In sandbox, returns a synthetic subscription id and the route handler
 * ALSO immediately mutates the local subscription row so the UI updates
 * without waiting for a webhook.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createRazorpaySubscription, isRazorpaySubBypassed, cancelRazorpaySubscription, RAZORPAY_PLANS } from "@/lib/razorpay-subscriptions";

export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    businessId?: string;
    planKey?: "business_pro" | "business_enterprise";
    interval?: "monthly" | "yearly";
  };
  const { businessId, planKey, interval } = body;
  if (!businessId || !planKey || !interval) {
    return NextResponse.json({ error: "Missing businessId / planKey / interval" }, { status: 400 });
  }
  if (planKey !== "business_pro" && planKey !== "business_enterprise") {
    return NextResponse.json({ error: "Invalid planKey" }, { status: 400 });
  }

  // Verify the caller owns the business
  const { data: bp } = await sb.from("business_profiles").select("id, is_suspended, brand_name, legal_name")
    .eq("id", businessId).eq("owner_user_id", user.id).maybeSingle();
  if (!bp) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  if ((bp as any).is_suspended) return NextResponse.json({ error: "Business is suspended" }, { status: 403 });

  // Cancel any existing Razorpay subscription before creating a new one.
  // The local row will be updated by the new subscription's webhook.
  const { data: existing } = await sb.from("business_subscriptions")
    .select("id, razorpay_subscription_id, status")
    .eq("business_id", businessId).in("status", ["active", "trialing", "past_due"]).maybeSingle();
  if (existing && (existing as any).razorpay_subscription_id) {
    try {
      await cancelRazorpaySubscription((existing as any).razorpay_subscription_id, true);
    } catch {
      // Best-effort. The new sub will still be created.
    }
  }

  // Create the new subscription
  let sub;
  try {
    sub = await createRazorpaySubscription({
      planCode: planKey === "business_pro" ? "pro" : "enterprise",
      interval,
      businessId,
      customerEmail: user.email ?? "",
      customerName: (bp as any).brand_name || (bp as any).legal_name,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Razorpay error" }, { status: 502 });
  }

  // Pre-record the subscription row so the UI can find it. Webhook will
  // update status to 'active' on payment.captured.
  const now = new Date();
  const periodEnd = new Date(now);
  if (interval === "yearly") periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  else periodEnd.setMonth(periodEnd.getMonth() + 1);

  await sb.from("business_subscriptions")
    .update({
      status: sub.bypassed ? "active" : "created",
      cancel_at: null,
      cancelled_at: null,
    } as any)
    .eq("business_id", businessId)
    .in("status", ["active", "trialing", "past_due", "cancelled", "paused"]);

  // If there was no prior row, upsert one.
  const { error: insErr } = await sb.from("business_subscriptions").upsert({
    business_id: businessId,
    plan_key: `business_${planKey === "business_pro" ? "pro" : "enterprise"}`,
    status: sub.bypassed ? "active" : "created",
    started_at: now.toISOString(),
    current_period_start: now.toISOString(),
    current_period_end: periodEnd.toISOString(),
    razorpay_subscription_id: sub.id,
    razorpay_customer_id: sub.id,
  } as any, { onConflict: "business_id" });
  if (insErr) {
    // Not fatal — webhook will sync.
  }

  return NextResponse.json({
    ok: true,
    subscriptionId: sub.id,
    planId: sub.plan_id,
    keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? process.env.RAZORPAY_KEY_ID ?? "",
    bypassed: sub.bypassed,
    shortUrl: sub.short_url,
  });
}
