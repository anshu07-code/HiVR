import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  generateOtpCode,
  hashOtpCode,
  constantTimeEqual,
  anonymousDisplayId,
  CryptoError,
} from "@/lib/crypto";

describe("hashPassword / verifyPassword", () => {
  it("hashes and verifies a password", async () => {
    const password = "my-secure-password-123!";
    const hash = await hashPassword(password);
    expect(hash).toBeTruthy();
    expect(typeof hash).toBe("string");

    const valid = await verifyPassword(password, hash);
    expect(valid).toBe(true);
  });

  it("rejects wrong password", async () => {
    const hash = await hashPassword("correct-password");
    const valid = await verifyPassword("wrong-password", hash);
    expect(valid).toBe(false);
  });

  it("rejects tampered hash", async () => {
    const hash = await hashPassword("test-password");
    const tampered = hash.slice(0, -1) + (hash.at(-1) === "A" ? "B" : "A");
    const valid = await verifyPassword("test-password", tampered);
    expect(valid).toBe(false);
  });

  it("rejects empty hash buffer", async () => {
    const valid = await verifyPassword("test", "");
    expect(valid).toBe(false);
  });

  it("rejects garbage hash string", async () => {
    const valid = await verifyPassword("test", "!!!not-base64url!!!");
    expect(valid).toBe(false);
  });

  it("rejects hash that is too short", async () => {
    const short = Buffer.from([0, 0, 0, 1, 2, 3, 4]).toString("base64url");
    const valid = await verifyPassword("test", short);
    expect(valid).toBe(false);
  });

  it("rejects wrong password with custom cost factor", async () => {
    const hash = await hashPassword("strong-pw", 8192);
    const valid = await verifyPassword("wrong-pw", hash);
    expect(valid).toBe(false);
  });

  it("produces different hashes for same password (different salt)", async () => {
    const h1 = await hashPassword("same-pw");
    const h2 = await hashPassword("same-pw");
    expect(h1).not.toBe(h2);
  });
});

describe("generateOtpCode", () => {
  it("generates a 6-digit string", () => {
    const code = generateOtpCode();
    expect(code).toMatch(/^\d{6}$/);
  });

  it("generates different codes on successive calls", () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateOtpCode()));
    expect(codes.size).toBeGreaterThan(90);
  });

  it("pads with leading zeros", () => {
    // Run many times; at least some should have leading zeros
    const hasLeadingZero = Array.from({ length: 1000 }, () => generateOtpCode())
      .some((c) => c.startsWith("0"));
    expect(hasLeadingZero).toBe(true);
  });
});

describe("hashOtpCode", () => {
  it("returns a hex string", () => {
    const hash = hashOtpCode("123456");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns consistent hashes for same code", () => {
    expect(hashOtpCode("000000")).toBe(hashOtpCode("000000"));
    expect(hashOtpCode("000000")).not.toBe(hashOtpCode("000001"));
  });
});

describe("constantTimeEqual", () => {
  it("returns true for equal strings", () => {
    expect(constantTimeEqual("hello", "hello")).toBe(true);
  });

  it("returns false for different strings", () => {
    expect(constantTimeEqual("hello", "world")).toBe(false);
  });

  it("returns false for different-length strings", () => {
    expect(constantTimeEqual("hi", "hello")).toBe(false);
  });

  it("handles empty strings", () => {
    expect(constantTimeEqual("", "")).toBe(true);
    expect(constantTimeEqual("", "a")).toBe(false);
  });
});

describe("anonymousDisplayId", () => {
  it("generates IDs in the format 'Top Pro #...'", () => {
    const id = anonymousDisplayId(1000);
    expect(id).toMatch(/^Top Pro #[A-Z0-9]+$/);
  });

  it("produces different IDs for different sequences", () => {
    const id1 = anonymousDisplayId(1000);
    const id2 = anonymousDisplayId(1001);
    expect(id1).not.toBe(id2);
  });

  it("handles seq=0 gracefully", () => {
    const id = anonymousDisplayId(0);
    expect(id).toBe("Top Pro #A");
  });

  it("handles large sequence numbers", () => {
    const id = anonymousDisplayId(999999);
    expect(id).toMatch(/^Top Pro #[A-Z0-9]+$/);
  });
});
