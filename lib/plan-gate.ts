/**
 * lib/plan-gate.ts — single source of truth for business plan limits.
 *
 * Used by:
 *   - /business/dashboard (KPI tiles)
 *   - /business/jobs (post-job button)
 *   - /business/jobs/new (plan-limit banner)
 *   - /api/business/applicants/[id]/status (offer action gate)
 *   - /api/business/contracts/[id]/pay-advance (block upgrades on unpaid)
 *   - /business/contracts (plan-limit banner)
 *   - /business/subscription (UI)
 *
 * Reads the plan from the active business_subscriptions row. Falls back
 * to Free if no row is found (which can happen for businesses created
 * before the trigger that creates the free trial).
 */
import { createClient } from "@/lib/supabase/server";

export type PlanKey = "business_free" | "business_pro" | "business_enterprise";

export type PlanLimits = {
  planKey: PlanKey;
  /** -1 = unlimited */
  maxActiveJobs: number;
  /** -1 = unlimited */
  maxActiveContracts: number;
  /** -1 = unlimited */
  maxSeats: number;
  /** Used for display only */
  planName: string;
  monthlyPaise: number;
  status: "active" | "trialing" | "past_due" | "cancelled" | "paused";
  currentPeriodEnd: string;
  /** True if the business can still create new jobs/contracts */
  canCreate: boolean;
};

const DEFAULT_PLAN: PlanLimits = {
  planKey: "business_free",
  planName: "Free",
  monthlyPaise: 0,
  maxActiveJobs: 1,
  maxActiveContracts: 1,
  maxSeats: 1,
  status: "active",
  currentPeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  canCreate: true,
};

const PLAN_LIMITS: Record<PlanKey, { name: string; monthlyPaise: number; jobs: number; contracts: number; seats: number }> = {
  business_free:       { name: "Free",       monthlyPaise: 0,     jobs: 1,  contracts: 1,  seats: 1 },
  business_pro:        { name: "Pro",        monthlyPaise: 99900, jobs: 10, contracts: 10, seats: 5 },
  business_enterprise: { name: "Enterprise", monthlyPaise: 999900, jobs: -1, contracts: -1, seats: -1 },
};

export async function getBusinessPlan(businessId: string): Promise<PlanLimits> {
  const sb = createClient();
  const { data } = await sb.from("business_subscriptions")
    .select("plan_key, status, current_period_end, active_jobs_count, active_contracts_count")
    .eq("business_id", businessId)
    .in("status", ["active", "trialing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return DEFAULT_PLAN;

  const key = (data as any).plan_key as PlanKey;
  const limits = PLAN_LIMITS[key] ?? PLAN_LIMITS.business_free;
  return {
    planKey: key,
    planName: limits.name,
    monthlyPaise: limits.monthlyPaise,
    maxActiveJobs: limits.jobs,
    maxActiveContracts: limits.contracts,
    maxSeats: limits.seats,
    status: (data as any).status,
    currentPeriodEnd: (data as any).current_period_end,
    canCreate: true, // canCreate is computed per-action by checking usage vs limit
  };
}

/**
 * Check if a business can perform an action given current plan + usage.
 * Returns { allowed: true } or { allowed: false, reason, upgradeRequired }.
 */
export type GateResult =
  | { allowed: true }
  | { allowed: false; reason: string; upgradeRequired: boolean; currentPlan: PlanKey; limit: number; usage: number };

export async function checkBusinessLimit(
  businessId: string,
  action: "post_job" | "send_offer" | "add_member",
): Promise<GateResult> {
  const plan = await getBusinessPlan(businessId);
  const sb = createClient();
  let usage = 0;
  let limit = -1;
  let label = "";

  if (action === "post_job") {
    const { count } = await sb.from("business_jobs").select("id", { count: "exact", head: true })
      .eq("business_id", businessId).eq("status", "open");
    usage = count ?? 0;
    limit = plan.maxActiveJobs;
    label = "active job";
  } else if (action === "send_offer") {
    const { count } = await sb.from("contracts").select("id", { count: "exact", head: true })
      .eq("business_id", businessId).in("status", ["active", "pending"]);
    usage = count ?? 0;
    limit = plan.maxActiveContracts;
    label = "active contract";
  } else if (action === "add_member") {
    const { count } = await sb.from("business_members").select("id", { count: "exact", head: true })
      .eq("business_id", businessId).eq("status", "active");
    usage = count ?? 0;
    limit = plan.maxSeats;
    label = "seat";
  }

  if (limit === -1) return { allowed: true };
  if (usage < limit) return { allowed: true };
  return {
    allowed: false,
    reason: `You've reached the ${plan.planName} plan limit of ${limit} ${label}${limit === 1 ? "" : "s"}. Upgrade your subscription to continue.`,
    upgradeRequired: true,
    currentPlan: plan.planKey,
    limit,
    usage,
  };
}

/** Helper for the UI — returns human plan name. */
export function planName(key: string): string {
  return PLAN_LIMITS[key as PlanKey]?.name ?? "Free";
}
