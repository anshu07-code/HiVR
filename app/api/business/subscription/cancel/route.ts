/**
 * POST /api/business/subscription/cancel
 * Marks the business's current active subscription as cancel_at=now so
 * it ends at the next period_end. Also calls Razorpay to schedule the
 * cancellation server-side.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cancelRazorpaySubscription, isRazorpaySubBypassed } from "@/lib/razorpay-subscriptions";

export async function POST(_req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: bp } = await sb.from("business_profiles").select("id").eq("owner_user_id", user.id).maybeSingle();
  if (!bp) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const { data: sub } = await sb.from("business_subscriptions")
    .select("id, status, razorpay_subscription_id, current_period_end")
    .eq("business_id", bp.id).in("status", ["active", "trialing", "past_due"]).maybeSingle();
  if (!sub) return NextResponse.json({ error: "No active subscription to cancel" }, { status: 404 });

  // If it's a real Razorpay subscription, schedule the cancellation server-side.
  if ((sub as any).razorpay_subscription_id && !isRazorpaySubBypassed()) {
    try {
      await cancelRazorpaySubscription((sub as any).razorpay_subscription_id, true);
    } catch (e: any) {
      return NextResponse.json({ error: `Razorpay cancel failed: ${e?.message}` }, { status: 502 });
    }
  }

  // Local: schedule the cancellation. Status stays "active" but cancel_at is set;
  // the business keeps their features until current_period_end. After that, a
  // cron (or the webhook) flips status to "cancelled" and the free trial kicks in.
  const { error } = await sb.from("business_subscriptions").update({
    cancel_at: (sub as any).current_period_end,
  } as any).eq("id", sub.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, cancelAt: (sub as any).current_period_end });
}
