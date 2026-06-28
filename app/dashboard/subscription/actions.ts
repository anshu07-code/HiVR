"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notifications";

export async function subscribeToPlan(planId: string) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: plan } = await sb.from("subscription_plans").select("id, period, price_inr, name").eq("id", planId).single();
  if (!plan) return { error: "Plan not found" };

  // Compute expiry from the plan period.
  const now = new Date();
  const expires = new Date(now);
  if (plan.period === "monthly") expires.setMonth(expires.getMonth() + 1);
  else if (plan.period === "quarterly") expires.setMonth(expires.getMonth() + 3);
  else if (plan.period === "yearly") expires.setFullYear(expires.getFullYear() + 1);
  else expires.setFullYear(expires.getFullYear() + 100);

  // Cancel any other active subs for this user, then insert the new one.
  await sb.from("user_subscriptions").update({ status: "cancelled" }).eq("user_id", user.id).eq("status", "active");
  const { error } = await sb.from("user_subscriptions").insert({
    user_id: user.id,
    plan_id: planId,
    status: "active",
    started_at: now.toISOString(),
    expires_at: expires.toISOString(),
    auto_renew: true,
    amount_paid_inr: plan.price_inr,
  });
  if (error) return { error: error.message };

  await notify({
    userId: user.id,
    type: "tier_promoted",
    title: "Subscription active",
    body: `You're now on the ${plan.name}. Your Pro features are active.`,
    link: "/dashboard/subscription",
  });

  revalidatePath("/dashboard/subscription");
  revalidatePath("/pricing");
  return { ok: true };
}

export async function cancelSubscription() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { error } = await sb.from("user_subscriptions")
    .update({ status: "cancelled", auto_renew: false })
    .eq("user_id", user.id)
    .eq("status", "active");
  if (error) return { error: error.message };

  await notify({
    userId: user.id,
    type: "system",
    title: "Subscription cancelled",
    body: "Your Pro features will remain active until the end of the current period.",
    link: "/dashboard/subscription",
  });

  revalidatePath("/dashboard/subscription");
  return { ok: true };
}
