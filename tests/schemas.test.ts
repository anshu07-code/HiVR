import { describe, it, expect } from "vitest";
import { TaskPostSchema } from "@/lib/schemas";

describe("task post schema", () => {
  it("requires title and description", () => {
    const r = TaskPostSchema.safeParse({ category_id: "abc", title: "hi", description: "short" });
    expect(r.success).toBe(false);
  });
  it("rejects when budget_max < budget_min", () => {
    const r = TaskPostSchema.safeParse({
      category_id: "abc",
      title: "This is a valid title here",
      description: "A description that is at least forty characters long for sure yes.",
      pricing_model: "hourly",
      budget_min: 5000,
      budget_max: 1000,
    });
    expect(r.success).toBe(false);
  });
  it("accepts a valid post", () => {
    const r = TaskPostSchema.safeParse({
      category_id: "00000000-0000-0000-0000-000000000000",
      title: "Reconcile 3 vendor CSVs",
      description: "I have three exported vendor lists that I need merged into one clean sheet.",
      pricing_model: "hourly",
      budget_min: 1000,
      budget_max: 5000,
    });
    expect(r.success).toBe(true);
  });
});
