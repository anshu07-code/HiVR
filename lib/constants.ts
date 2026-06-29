/**
 * lib/constants.ts — single source of truth for business constants that aren't
 * admin-tunable. Anything an admin might reasonably want to change at runtime
 * lives in `platform_settings` (see lib/settings.ts) and is read from there.
 */

import type { PricingModel, CategoryTier } from "./supabase/types";

/** Pricing models allowed for Tier A (micro-tasks). */
export const TIER_A_PRICING_MODELS: PricingModel[] = [
  "hourly",
  "fixed",
];

/** Pricing models allowed for Tier B (role engagements). */
export const TIER_B_PRICING_MODELS: PricingModel[] = [
  "hourly",
  "fixed",
  "daily_rate",
  "weekly_rate",
];

/** Returns the allowed pricing models for a category tier. */
export function allowedPricingModels(tier: CategoryTier): PricingModel[] {
  return tier === "role_engagement" ? TIER_B_PRICING_MODELS : TIER_A_PRICING_MODELS;
}

/** User-friendly labels for the pricing models used in the post-task UI. */
export const PRICING_MODEL_LABELS: Record<PricingModel, string> = {
  hourly: "Per hour",
  daily: "Per day",
  monthly: "Per month",
  fixed: "Per task",
  daily_rate: "Per day",
  fixed_milestone: "Fixed per milestone",
  weekly_rate: "Per week",
};

/** Wage bands (₹) for the launch categories. Tweak in admin settings later. */
export const WAGE_BANDS_INR: Record<string, { min: number; max: number }> = {
  // Tier A
  "spreadsheet-data-work":          { min: 150,  max: 800  },
  "tech-micro-tasks":               { min: 400,  max: 2500 },
  "mentoring-live-doubt-solving":   { min: 200,  max: 1500 },
  // Tier B (per day, not per hour)
  "fullstack-dev":                  { min: 2500, max: 12000 },
  "ai-ml-engineering":              { min: 3500, max: 15000 },
  "nlp-data-science":               { min: 3000, max: 12000 },
};

/** Anti-circumvention thresholds (admin-editable in production). */
export const CONTACT_SHARE_WARN_BEFORE_SUSPEND = 3;

/** Skills retake cooldown (days) on a failed test. */
export const SKILL_RETAKE_COOLDOWN_DAYS = 7;

/** Tier B interview reapply cooldown (days) on a fail. */
export const TIER_B_REAPPLY_COOLDOWN_DAYS = 30;

/** Auto-release window (days) — if buyer doesn't approve/dispute, escrow auto-releases. */
export const AUTO_RELEASE_HOURS = 12;
