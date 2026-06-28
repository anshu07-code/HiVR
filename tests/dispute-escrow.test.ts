import { describe, it, expect } from "vitest";

/**
 * Mirrors `public.compute_dispute_split` from
 * supabase/migrations/0101_dispute_escrow_release.sql.
 * If the SQL function changes, update this to match.
 */
function computeDisputeSplit(
  disputedAmountPaise: number,
  platformFeePaise: number,
  resolution: "in_favor_of_buyer" | "in_favor_of_employee" | "split" | "no_action",
  employeeSharePct = 50,
): { refund_paise: number; payout_paise: number; platform_retained_paise: number } {
  if (!disputedAmountPaise || disputedAmountPaise <= 0) {
    return { refund_paise: 0, payout_paise: 0, platform_retained_paise: 0 };
  }
  const net = Math.max(0, disputedAmountPaise - (platformFeePaise ?? 0));
  const retained = platformFeePaise ?? 0;
  if (resolution === "in_favor_of_buyer") {
    return { refund_paise: net, payout_paise: 0, platform_retained_paise: retained };
  }
  if (resolution === "in_favor_of_employee") {
    return { refund_paise: 0, payout_paise: net, platform_retained_paise: retained };
  }
  if (resolution === "split") {
    const emp = Math.max(0, Math.min(100, employeeSharePct ?? 50));
    const buy = 100 - emp;
    return {
      refund_paise: Math.round((net * buy) / 100),
      payout_paise: Math.round((net * emp) / 100),
      platform_retained_paise: retained,
    };
  }
  // no_action / closed: refund the net
  return { refund_paise: net, payout_paise: 0, platform_retained_paise: retained };
}

describe("compute_dispute_split", () => {
  it("returns 0/0/0 for empty amounts", () => {
    expect(computeDisputeSplit(0, 0, "in_favor_of_buyer")).toEqual({ refund_paise: 0, payout_paise: 0, platform_retained_paise: 0 });
  });

  it("in_favor_of_buyer: 100% net goes to buyer, fee is retained", () => {
    // ₹1000 contract, ₹200 fee → ₹800 net, refund 800, payout 0, retained 200
    const r = computeDisputeSplit(100000, 20000, "in_favor_of_buyer");
    expect(r).toEqual({ refund_paise: 80000, payout_paise: 0, platform_retained_paise: 20000 });
  });

  it("in_favor_of_employee: 100% net goes to employee, fee is retained", () => {
    const r = computeDisputeSplit(100000, 20000, "in_favor_of_employee");
    expect(r).toEqual({ refund_paise: 0, payout_paise: 80000, platform_retained_paise: 20000 });
  });

  it("split 50/50: half to each side", () => {
    const r = computeDisputeSplit(100000, 20000, "split", 50);
    expect(r.payout_paise).toBe(40000);
    expect(r.refund_paise).toBe(40000);
    expect(r.platform_retained_paise).toBe(20000);
    // Nothing is lost: payout + refund + retained = disputed amount
    expect(r.payout_paise + r.refund_paise + r.platform_retained_paise).toBe(100000);
  });

  it("split 70/30: 70% to employee, 30% to buyer", () => {
    const r = computeDisputeSplit(100000, 20000, "split", 70);
    expect(r.payout_paise).toBe(56000);  // 70% of 80000
    expect(r.refund_paise).toBe(24000);  // 30% of 80000
    expect(r.platform_retained_paise).toBe(20000);
  });

  it("split 0/100: all to buyer", () => {
    const r = computeDisputeSplit(100000, 20000, "split", 0);
    expect(r).toEqual({ refund_paise: 80000, payout_paise: 0, platform_retained_paise: 20000 });
  });

  it("split 100/0: all to employee", () => {
    const r = computeDisputeSplit(100000, 20000, "split", 100);
    expect(r).toEqual({ refund_paise: 0, payout_paise: 80000, platform_retained_paise: 20000 });
  });

  it("clamps out-of-range share pct to 0-100", () => {
    const r1 = computeDisputeSplit(100000, 20000, "split", 150);
    expect(r1.payout_paise).toBe(80000);
    const r2 = computeDisputeSplit(100000, 20000, "split", -10);
    expect(r2.payout_paise).toBe(0);
  });

  it("handles zero platform fee", () => {
    const r = computeDisputeSplit(100000, 0, "in_favor_of_buyer");
    expect(r).toEqual({ refund_paise: 100000, payout_paise: 0, platform_retained_paise: 0 });
  });

  it("handles platform fee larger than disputed amount (net=0)", () => {
    // Edge case: fee was 100%, all money was already retained at capture time
    const r = computeDisputeSplit(100000, 100000, "in_favor_of_buyer");
    expect(r).toEqual({ refund_paise: 0, payout_paise: 0, platform_retained_paise: 100000 });
  });

  it("no_action: refunds the net (same as in_favor_of_buyer)", () => {
    const r = computeDisputeSplit(100000, 20000, "no_action");
    expect(r).toEqual({ refund_paise: 80000, payout_paise: 0, platform_retained_paise: 20000 });
  });

  it("conservation: payout + refund + retained always equals disputed amount", () => {
    const cases: Array<[number, number, "in_favor_of_buyer" | "in_favor_of_employee" | "split" | "no_action", number]> = [
      [100000, 20000, "in_favor_of_buyer", 50],
      [100000, 20000, "in_favor_of_employee", 50],
      [100000, 20000, "split", 50],
      [100000, 20000, "split", 33],
      [100000, 0, "split", 50],
      [1000, 200, "in_favor_of_buyer", 50],   // fee > amount → net = 0
      [1, 1, "split", 50],                     // 1 paise
    ];
    for (const [amt, fee, res, pct] of cases) {
      const r = computeDisputeSplit(amt, fee, res, pct);
      expect(r.payout_paise + r.refund_paise + r.platform_retained_paise).toBe(amt);
    }
  });
});
