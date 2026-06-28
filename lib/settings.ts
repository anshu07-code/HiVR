/**
 * lib/settings.ts — typed reader for the `platform_settings` key/value table.
 * Use this instead of hardcoding fee %, threshold, and rate values.
 */

import { createAdminClient } from "./supabase/admin";

export type PlatformSettings = {
  // Fees
  platform_fee_pct_by_tier: {
    provisional: number;
    verified: number;
    track_record: number;
    top_rated: number;
  };
  repeat_client_fee_pct: number;
  tip_platform_cut_pct: number;
  // Verification thresholds
  pan_required_above_earnings: number;        // ₹
  kyc_required_above_spend: number;           // ₹ (buyer side)
  // Auto-release
  auto_release_days: number;
  // Skill tests
  skill_test_pass_pct_default: number;        // 0..1
  skill_retake_cooldown_days: number;
  tier_b_reapply_cooldown_days: number;
  // Anti-circumvention
  contact_warn_before_suspend: number;
  // Points
  points_per_100_inr: number;
  signup_bonus_points: number;
  review_bonus_points: number;
  // Tier thresholds
  tier_thresholds: {
    track_record: { min_contracts: number; min_rating: number; min_completion: number };
    top_rated: { min_contracts: number; min_rating: number; min_completion: number };
    demotion_rating: number;
  };
  // Tier-B interview rubric (per category)
  tier_b_rubric_by_category: Record<string, string[]>;
};

export const DEFAULT_SETTINGS: PlatformSettings = {
  platform_fee_pct_by_tier: { provisional: 0.22, verified: 0.20, track_record: 0.18, top_rated: 0.15 },
  repeat_client_fee_pct: 0.09,
  tip_platform_cut_pct: 0.05,
  pan_required_above_earnings: 20_000,
  kyc_required_above_spend: 50_000,
  auto_release_days: 5,
  skill_test_pass_pct_default: 0.7,
  skill_retake_cooldown_days: 7,
  tier_b_reapply_cooldown_days: 30,
  contact_warn_before_suspend: 3,
  points_per_100_inr: 1,
  signup_bonus_points: 50,
  review_bonus_points: 5,
  tier_thresholds: {
    track_record: { min_contracts: 10, min_rating: 4.5, min_completion: 0.9 },
    top_rated: { min_contracts: 50, min_rating: 4.8, min_completion: 0.95 },
    demotion_rating: 3.5,
  },
  tier_b_rubric_by_category: {
    "fullstack-dev": ["system design", "real debugging", "code quality", "communication"],
    "ai-ml-engineering": ["system design", "ML fundamentals", "production thinking", "communication"],
    "nlp-data-science": ["data intuition", "modeling choices", "evaluation", "communication"],
  },
};

export async function loadSettings(): Promise<PlatformSettings> {
  try {
    const sb = createAdminClient();
    const { data } = await sb.from("platform_settings").select("key, value");
    if (!data) return DEFAULT_SETTINGS;
    const merged: Record<string, unknown> = {};
    for (const row of data) {
      if (row.value && typeof row.value === "object" && "value" in (row.value as object)) {
        merged[row.key] = (row.value as { value: unknown }).value;
      } else {
        merged[row.key] = row.value;
      }
    }
    return { ...DEFAULT_SETTINGS, ...(merged as Partial<PlatformSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
