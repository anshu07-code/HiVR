import { describe, it, expect } from "vitest";
import { computePlatformFee, computeEmployeePayout, computeTier, platformFeePct, REPEAT_CLIENT_FEE_PCT } from "@/lib/tier";

describe("tier logic", () => {
  it("computes platform fee at standard 20% for verified tier", () => {
    expect(computePlatformFee(10000, "verified")).toBe(2000);
  });
  it("computes lower fee for top_rated (15%)", () => {
    expect(computePlatformFee(10000, "top_rated")).toBe(1500);
  });
  it("computes higher fee for provisional (22%)", () => {
    expect(computePlatformFee(10000, "provisional")).toBe(2200);
  });
  it("applies repeat-client fee when explicitly opted in", () => {
    expect(platformFeePct("verified", { repeatClient: true })).toBe(REPEAT_CLIENT_FEE_PCT);
  });
  it("computes employee payout as amount - fee", () => {
    expect(computeEmployeePayout(10000, "verified")).toBe(8000);
  });
  it("promotes to top_rated at 50+ contracts and 4.8+ rating", () => {
    expect(computeTier({ contracts: 60, avg_rating: 4.9, completion_rate: 0.97, current_tier: "track_record" })).toBe("top_rated");
  });
  it("promotes to track_record at 10+ contracts and 4.5+ rating", () => {
    expect(computeTier({ contracts: 15, avg_rating: 4.7, completion_rate: 0.92, current_tier: "verified" })).toBe("track_record");
  });
  it("demotes when rating falls below threshold", () => {
    expect(computeTier({ contracts: 80, avg_rating: 3.0, completion_rate: 0.95, current_tier: "top_rated" })).toBe("track_record");
  });
  it("never demotes below provisional", () => {
    expect(computeTier({ contracts: 80, avg_rating: 3.0, completion_rate: 0.95, current_tier: "provisional" })).toBe("provisional");
  });
});
