import { describe, it, expect } from "vitest";
import { detectContactInfoRegex, detectContactInfoWordNumbers } from "@/lib/contact-detect";

describe("contact-info detector — regex layer", () => {
  it("catches standard 10-digit Indian numbers", () => {
    const r = detectContactInfoRegex("Call me at 9876543210 please");
    expect(r.flagged).toBe(true);
  });
  it("catches spaced-out digits", () => {
    const r = detectContactInfoRegex("My number is 9 8 7 6 5 4 3 2 1 0");
    expect(r.flagged).toBe(true);
  });
  it("catches dotted digits", () => {
    const r = detectContactInfoRegex("Reach me 98.76.543.210");
    expect(r.flagged).toBe(true);
  });
  it("catches obfuscated email (gmail dot com)", () => {
    const r = detectContactInfoRegex("ping me at foo dot bar at gmail dot com");
    expect(r.flagged).toBe(true);
  });
  it("catches external urls", () => {
    const r = detectContactInfoRegex("see https://my-portfolio.example.com");
    expect(r.flagged).toBe(true);
  });
  it("catches social handles", () => {
    const r = detectContactInfoRegex("DM me on telegram @someuser");
    expect(r.flagged).toBe(true);
  });
  it("does NOT flag clean HiVR conversation", () => {
    const r = detectContactInfoRegex("Hi! I've started on the task and will share the deliverable here tomorrow.");
    expect(r.flagged).toBe(false);
  });
});

describe("contact-info detector — word-numbers layer", () => {
  it("catches phone numbers spelled in words", () => {
    const r = detectContactInfoWordNumbers("call me nine eight seven six five four three two one zero");
    expect(r.flagged).toBe(true);
  });
  it("catches mixed word+number sequences", () => {
    const r = detectContactInfoWordNumbers("my digits are nine 8 seven 6 five 4 three 2 one 0");
    expect(r.flagged).toBe(true);
  });
  it("does NOT flag short numeric sequences", () => {
    const r = detectContactInfoWordNumbers("I have two ideas for the design");
    expect(r.flagged).toBe(false);
  });
  it("does NOT flag scattered number words", () => {
    const r = detectContactInfoWordNumbers("I worked on three projects last year, all great");
    expect(r.flagged).toBe(false);
  });
});
