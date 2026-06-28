import { describe, it, expect } from "vitest";
import { pointsForContract, applyPointsDiscount, canRedeem } from "@/lib/points";

describe("loyalty points (non-cash by design)", () => {
  it("earns 1 point per ₹100", () => {
    expect(pointsForContract(5000)).toBe(50);
  });
  it("rounds down for sub-₹100 amounts", () => {
    expect(pointsForContract(199)).toBe(1);
  });
  it("can redeem when balance sufficient", () => {
    expect(canRedeem(100, 50)).toBe(true);
  });
  it("cannot redeem when balance insufficient", () => {
    expect(canRedeem(10, 50)).toBe(false);
  });
  it("discount is capped at the fee amount", () => {
    const r = applyPointsDiscount(100, 500, 500);
    expect(r.discountedFee).toBe(0);
    expect(r.pointsDeducted).toBe(100);
  });
  it("discount respects balance", () => {
    const r = applyPointsDiscount(500, 100, 30);
    expect(r.discountedFee).toBe(470);
    expect(r.pointsDeducted).toBe(30);
  });
});
