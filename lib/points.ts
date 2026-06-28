/**
 * lib/points.ts — loyalty-points ledger helpers.
 *
 * IMPORTANT LEGAL CONSTRAINT (Section 8):
 * Points are NON-CASH-CONVERTIBLE. There is no `points → cash` path anywhere
 * in this codebase, by design. Redeemable only for:
 *   - platform-fee discounts
 *   - platform perks (priority listing, profile boost)
 *
 * The points_ledger table is the only place balances are ever written from.
 * The `loyalty_points.points_balance` field is updated by a Postgres trigger
 * based on ledger inserts — application code MUST NOT write to it directly.
 */

import type { Database } from "./supabase/types";

export const DEFAULT_POINTS_PER_100_INR = 1;     // 1 point per ₹100 earned on a contract
export const DEFAULT_SIGNUP_BONUS = 50;
export const DEFAULT_REVIEW_BONUS = 5;

export type PointsReason = Database["public"]["Tables"]["points_ledger"]["Row"]["reason"];

export function pointsForContract(contractAmount: number): number {
  return Math.floor((contractAmount / 100) * DEFAULT_POINTS_PER_100_INR);
}

export function canRedeem(balance: number, cost: number): boolean {
  return balance >= cost;
}

/**
 * Apply a points discount to a price in paise. Returns:
 *   - discountedFee:  the price after the points are deducted, in paise
 *   - pointsDeducted: the actual number of points to write to the ledger
 *                     (capped so the discount is at most maxRedeemablePct%
 *                     of the pointsUsed, AND capped to the price itself
 *                     so we never go below 0)
 *
 * The caller is responsible for also writing the ledger row to actually
 * deduct the points.
 *
 * Note: 1 point = 1 paise. The platform's points-to-cash conversion is
 * intentionally weak — points are a perk, not a currency. See the
 * "non-cash by design" test for the boundary check.
 */
export function applyPointsDiscount(
  pricePaise: number,
  pointsUsed: number,
  maxRedeemablePct = 25,
): { discountedFee: number; pointsDeducted: number } {
  if (pointsUsed <= 0 || pricePaise <= 0) {
    return { discountedFee: pricePaise, pointsDeducted: 0 };
  }
  // Cap the points the user can actually redeem in this transaction to
  // maxRedeemablePct% of the points they're trying to use. Then cap
  // that to the price (so we never go below 0).
  const pctCap = Math.floor((pointsUsed * maxRedeemablePct) / 100);
  const pointsDeducted = Math.max(0, Math.min(pctCap, pointsUsed, pricePaise));
  const discountPaise = pointsDeducted;
  return { discountedFee: Math.max(pricePaise - discountPaise, 0), pointsDeducted };
}
