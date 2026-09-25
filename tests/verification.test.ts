import { describe, it, expect } from "vitest";
import {
  detectAge,
  validateAadhaar,
  validatePAN,
  validatePassport,
  validateDL,
  validateFAMPayHandle,
  levenshtein,
  fuzzyNameMatch,
  hammingDistance,
  hashSimilarity,
  extractDOBFromText,
  extractNameFromText,
} from "@/lib/verification";

// ============================================================
// 1. Age detection
// ============================================================
describe("detectAge", () => {
  it("classifies an adult (over 18)", () => {
    const r = detectAge(new Date("2000-06-15"));
    expect(r.isMinor).toBe(false);
    expect(r.years).toBeGreaterThanOrEqual(25);
  });

  it("classifies a minor (under 18)", () => {
    const r = detectAge(new Date("2015-06-15"));
    expect(r.isMinor).toBe(true);
    expect(r.minorNoConsent).toBe(false);
  });

  it("classifies 15+ minor (no consent required)", () => {
    const r = detectAge(new Date("2010-06-15"));
    expect(r.isMinor).toBe(true);
    expect(r.minorNoConsent).toBe(true);
  });
});

// ============================================================
// 2. Document validators
// ============================================================
describe("validateAadhaar", () => {
  it("accepts a valid Aadhaar number (passes Verhoeff)", () => {
    // Known valid Aadhaar (passes Verhoeff): 999999999999 → check-digit = 0? No.
    // Using a VBA-generated valid Aadhaar: 234567891238 (per Verhoeff)
    expect(validateAadhaar("234567891238")).toBe(true);
  });

  it("rejects invalid Aadhaar", () => {
    expect(validateAadhaar("123456789012")).toBe(false);
  });

  it("rejects non-12-digit strings", () => {
    expect(validateAadhaar("1234")).toBe(false);
    expect(validateAadhaar("")).toBe(false);
  });
});

describe("validatePAN", () => {
  it("accepts valid PAN format", () => {
    expect(validatePAN("ABCDE1234F")).toBe(true);
  });

  it("accepts lowercase PAN (normalises)", () => {
    expect(validatePAN("abcde1234f")).toBe(true);
  });

  it("rejects invalid PAN", () => {
    expect(validatePAN("ABCDE12345")).toBe(false);
    expect(validatePAN("")).toBe(false);
  });
});

describe("validatePassport", () => {
  it("accepts valid passport format", () => {
    expect(validatePassport("A1234567")).toBe(true);
  });

  it("rejects invalid passport", () => {
    expect(validatePassport("")).toBe(false);
  });
});

describe("validateDL", () => {
  it("accepts valid DL format", () => {
    expect(validateDL("KA0120240000001")).toBe(true);
  });

  it("rejects invalid DL", () => {
    expect(validateDL("")).toBe(false);
  });
});

describe("validateFAMPayHandle", () => {
  it("accepts valid FAMPay handle", () => {
    expect(validateFAMPayHandle("john.doe@fampay")).toBe(true);
  });

  it("rejects invalid handle", () => {
    expect(validateFAMPayHandle("john@gmail.com")).toBe(false);
    expect(validateFAMPayHandle("")).toBe(false);
  });
});

// ============================================================
// 3. Levenshtein distance
// ============================================================
describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("hello", "hello")).toBe(0);
  });

  it("returns length for empty inputs", () => {
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
  });

  it("computes correct distance", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
  });
});

// ============================================================
// 4. Fuzzy name match
// ============================================================
describe("fuzzyNameMatch", () => {
  it("matches identical names", () => {
    const r = fuzzyNameMatch("Rahul Kumar", "Rahul Kumar");
    expect(r.isMatch).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(85);
  });

  it("matches names with minor typos", () => {
    const r = fuzzyNameMatch("Rahul Kumr", "Rahul Kumar");
    expect(r.isMatch).toBe(true);
  });

  it("rejects completely different names", () => {
    const r = fuzzyNameMatch("John Doe", "Rahul Kumar");
    expect(r.isMatch).toBe(false);
  });

  it("handles empty inputs", () => {
    const r = fuzzyNameMatch("", "Rahul");
    expect(r.isMatch).toBe(false);
    expect(r.score).toBe(0);
  });
});

// ============================================================
// 5. Perceptual hash helpers
// ============================================================
describe("hammingDistance", () => {
  it("returns 0 for identical hashes", () => {
    expect(hammingDistance("abcdef12", "abcdef12")).toBe(0);
  });

  it("returns 64 for mismatched length", () => {
    expect(hammingDistance("abc", "def1234567890abc")).toBe(64);
  });

  it("returns 64 for empty input", () => {
    expect(hammingDistance("", "abcdef1234567890")).toBe(64);
  });
});

describe("hashSimilarity", () => {
  it("returns 100 for identical hashes", () => {
    expect(hashSimilarity("aaaaaaaaaaaaaaaa", "aaaaaaaaaaaaaaaa")).toBe(100);
  });

  it("returns 0 for completely different hashes", () => {
    // FFFFFFFF... vs 0000000...
    expect(hashSimilarity("ffffffffffffffff", "0000000000000000")).toBe(0);
  });

  it("returns partial for slightly different hashes", () => {
    const sim = hashSimilarity("aaaaaaaaaaaaaaaa", "aaaaaaaabaaaaaaa");
    expect(sim).toBeGreaterThan(80);
    expect(sim).toBeLessThan(100);
  });

  it("returns 0 for empty input", () => {
    expect(hashSimilarity("", "abcdef1234567890")).toBe(0);
  });
});

// ============================================================
// 6. OCR helpers
// ============================================================
describe("extractDOBFromText", () => {
  it("extracts DD/MM/YYYY format", () => {
    const d = extractDOBFromText("Date of Birth: 15/08/1990");
    expect(d).not.toBeNull();
    expect(d!.getUTCFullYear()).toBe(1990);
    expect(d!.getUTCMonth()).toBe(7);  // August is 7 (0-indexed)
    expect(d!.getUTCDate()).toBe(15);
  });

  it("extracts YYYY-MM-DD format", () => {
    const d = extractDOBFromText("1990-08-15");
    expect(d).not.toBeNull();
    expect(d!.getUTCFullYear()).toBe(1990);
    expect(d!.getUTCMonth()).toBe(7);
    expect(d!.getUTCDate()).toBe(15);
  });

  it("returns null for no match", () => {
    expect(extractDOBFromText("no date here")).toBeNull();
  });
});

describe("extractNameFromText", () => {
  it("picks the longest valid name line", () => {
    const name = extractNameFromText(
      "some ocr result\nRAHUL KUMAR\nmore text",
      ["some ocr result", "RAHUL KUMAR", "more text"],
    );
    expect(name).toBe("RAHUL KUMAR");
  });

  it("returns null for no valid name", () => {
    const name = extractNameFromText("abc 123", ["abc 123"]);
    expect(name).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(extractNameFromText("", [])).toBeNull();
  });
});
