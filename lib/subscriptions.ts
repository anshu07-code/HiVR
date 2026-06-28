import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type Plan = Database["public"]["Tables"]["subscription_plans"]["Row"];
type Sub = Database["public"]["Tables"]["user_subscriptions"]["Row"];

export type ProFeatures = {
  featured_listing?: boolean;
  featured_profile?: boolean;
  priority_in_search?: boolean;
  priority_support?: boolean;
  points_multiplier?: number;     // default 1
  platform_fee_pct?: number;     // default 0.20
  unlimited_drafts?: boolean;
  advanced_filters?: boolean;
  analytics_dashboard?: boolean;
  skill_test_retake_free?: boolean;
  verified_badge_boost?: boolean;
  bulk_posting?: boolean;
  team_seats?: number;
  gstin_invoicing?: boolean;
  dedicated_account_manager?: boolean;
  api_access?: boolean;
  custom_integrations?: boolean;
  sso?: boolean;
};

const DEFAULTS: Required<ProFeatures> = {
  featured_listing: false,
  featured_profile: false,
  priority_in_search: false,
  priority_support: false,
  points_multiplier: 1,
  platform_fee_pct: 0.20,
  unlimited_drafts: false,
  advanced_filters: false,
  analytics_dashboard: false,
  skill_test_retake_free: false,
  verified_badge_boost: false,
  bulk_posting: false,
  team_seats: 1,
  gstin_invoicing: false,
  dedicated_account_manager: false,
  api_access: false,
  custom_integrations: false,
  sso: false,
};

/** Returns the merged feature set for the user's currently-active sub (or defaults). */
export async function getUserFeatures(userId: string): Promise<ProFeatures> {
  const sb = createClient();
  const { data } = await sb
    .from("user_subscriptions")
    .select("plan:subscription_plans(features)")
    .eq("user_id", userId)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.plan?.features) return DEFAULTS;
  const f = data.plan.features as Partial<ProFeatures>;
  return { ...DEFAULTS, ...f };
}

/** True if the user has any active subscription. */
export async function hasActiveSubscription(userId: string): Promise<boolean> {
  const sb = createClient();
  const { count } = await sb
    .from("user_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString());
  return (count ?? 0) > 0;
}

/** Compute platform fee using the user's subscription discount (if any). */
export async function getEffectivePlatformFeePct(userId: string, defaultPct = 0.20): Promise<number> {
  const f = await getUserFeatures(userId);
  if (typeof f.platform_fee_pct === "number") return f.platform_fee_pct;
  return defaultPct;
}

/** Compute points multiplier. */
export async function getPointsMultiplier(userId: string): Promise<number> {
  const f = await getUserFeatures(userId);
  return f.points_multiplier ?? 1;
}

/** All public plans, grouped by audience. */
export async function listPublicPlans() {
  const sb = createClient();
  const { data } = await sb.from("subscription_plans").select("*").eq("is_active", true).order("sort_order");
  const plans = (data ?? []) as Plan[];
  const by: Record<string, Plan[]> = { individual_buyer: [], individual_employee: [], business: [] };
  for (const p of plans) (by[p.audience] ??= []).push(p);
  return by;
}
