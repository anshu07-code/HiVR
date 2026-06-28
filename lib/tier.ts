/**
 * lib/tier.ts — wage and trust-tier logic.
 *
 * Tiers are stored as enums on the database; the per-tier wage band multipliers
 * and threshold counts (e.g. "10 contracts to reach Track-Record") are stored
 * in `platform_settings` so admins can tune them without redeploys.
 *
 * Defaults here match the spec (Section 6). They are read from platform_settings
 * at call time; these constants are used as fallbacks.
 */

import type { Database } from "./supabase/types";

export type TrustTier = "provisional" | "verified" | "track_record" | "top_rated";

export const DEFAULT_TIER_THRESHOLDS = {
  track_record: { min_contracts: 10, min_rating: 4.5, min_completion: 0.9 },
  top_rated: { min_contracts: 50, min_rating: 4.8, min_completion: 0.95 },
  demotion_rating: 3.5,        // average drops below this → demote one tier
  re_test_cooldown_days: 180,  // periodic re-test interval
};

export const DEFAULT_PLATFORM_FEE_PCT: Record<TrustTier, number> = {
  provisional: 0.22,
  verified: 0.20,
  track_record: 0.18,
  top_rated: 0.15,
};

export const REPEAT_CLIENT_FEE_PCT = 0.09;   // same buyer ↔ same employee, return engagement

export function computeTier(args: {
  contracts: number;
  avg_rating: number;
  completion_rate: number;
  current_tier: TrustTier;
}): TrustTier {
  const { contracts, avg_rating, completion_rate, current_tier } = args;
  const t = DEFAULT_TIER_THRESHOLDS;
  if (
    contracts >= t.top_rated.min_contracts &&
    avg_rating >= t.top_rated.min_rating &&
    completion_rate >= t.top_rated.min_completion
  ) return "top_rated";
  if (
    contracts >= t.track_record.min_contracts &&
    avg_rating >= t.track_record.min_rating &&
    completion_rate >= t.track_record.min_completion
  ) return "track_record";
  if (avg_rating < t.demotion_rating) {
    // demote one tier (but never below provisional)
    const order: TrustTier[] = ["provisional", "verified", "track_record", "top_rated"];
    const idx = order.indexOf(current_tier);
    return order[Math.max(0, idx - 1)];
  }
  return current_tier === "provisional" ? "verified" : current_tier;
}

export function platformFeePct(tier: TrustTier, opts?: { repeatClient?: boolean }): number {
  if (opts?.repeatClient) return REPEAT_CLIENT_FEE_PCT;
  return DEFAULT_PLATFORM_FEE_PCT[tier];
}

export function computePlatformFee(amount: number, tier: TrustTier, opts?: { repeatClient?: boolean }): number {
  return Math.round(amount * platformFeePct(tier, opts));
}

export function computeEmployeePayout(amount: number, tier: TrustTier, opts?: { repeatClient?: boolean }): number {
  return amount - computePlatformFee(amount, tier, opts);
}

export type Skill = Database["public"]["Tables"]["employee_skills"]["Row"];
export type Profile = Database["public"]["Tables"]["employee_profiles"]["Row"];

export function wageBandMin(skill: Skill): number { return skill.current_wage_band_min; }
export function wageBandMax(skill: Skill): number { return skill.current_wage_band_max; }
