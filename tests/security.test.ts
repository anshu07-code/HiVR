import { describe, it, expect, beforeEach } from "vitest";
import {
  SecurityError,
  identifyFileFormat,
  validateUploadedFile,
  sanitizeFilename,
  requireUuid,
  requirePositiveInt,
  requirePaiseAmount,
  MAX_CONTRACT_AMOUNT_PAISE,
  enforceRateLimit,
  _resetRateLimits,
  secureToken,
  timingSafeEqual,
} from "@/lib/security";

// Build a minimal File-like object for validateUploadedFile.
function makeFile(name: string, bytes: Uint8Array, type = ""): File {
  // File constructor isn't in node by default; we mock the API.
  return {
    name,
    size: bytes.byteLength,
    type,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as unknown as File;
}

// =============================================================================
// identifyFileFormat
// =============================================================================

describe("identifyFileFormat", () => {
  it("detects JPEG (multiple SOI variants)", () => {
    expect(identifyFileFormat(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]))?.ext).toBe("jpg");
    expect(identifyFileFormat(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 0]))?.ext).toBe("jpg");
    expect(identifyFileFormat(new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0, 0]))?.ext).toBe("jpg");
  });
  it("detects PNG", () => {
    const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(identifyFileFormat(sig)?.ext).toBe("png");
  });
  it("detects WebP (RIFF + WEBP at offset 8)", () => {
    // RIFF<size>WEBPVP8...
    const sig = new Uint8Array(16);
    sig.set([0x52, 0x49, 0x46, 0x46], 0);   // RIFF
    sig.set([0x00, 0x00, 0x00, 0x00], 4);   // size (4 bytes)
    sig.set([0x57, 0x45, 0x42, 0x50], 8);   // WEBP
    expect(identifyFileFormat(sig)?.ext).toBe("webp");
  });
  it("detects WAV (RIFF + WAVE at offset 8)", () => {
    const sig = new Uint8Array(16);
    sig.set([0x52, 0x49, 0x46, 0x46], 0);
    sig.set([0x00, 0x00, 0x00, 0x00], 4);
    sig.set([0x57, 0x41, 0x56, 0x45], 8);
    expect(identifyFileFormat(sig)?.ext).toBe("wav");
  });
  it("detects MP4 (ftyp + mp42 brand)", () => {
    const sig = new Uint8Array(16);
    sig.set([0x00, 0x00, 0x00, 0x18], 0); // box size
    sig.set([0x66, 0x74, 0x79, 0x70], 4); // ftyp
    sig.set([0x6d, 0x70, 0x34, 0x32], 8); // mp42
    expect(identifyFileFormat(sig)?.ext).toBe("mp4");
  });
  it("detects MOV (ftyp + qt brand)", () => {
    const sig = new Uint8Array(16);
    sig.set([0x00, 0x00, 0x00, 0x14], 0);
    sig.set([0x66, 0x74, 0x79, 0x70], 4);
    sig.set([0x71, 0x74, 0x20, 0x20], 8); // qt
    expect(identifyFileFormat(sig)?.ext).toBe("mov");
  });
  it("detects PDF", () => {
    const sig = new Uint8Array("%PDF-1.7\nrest of file".split("").map(c => c.charCodeAt(0)));
    expect(identifyFileFormat(sig)?.ext).toBe("pdf");
  });
  it("rejects SVG (XSS risk)", () => {
    const svg = new Uint8Array("<svg><script>alert(1)</script></svg>".split("").map(c => c.charCodeAt(0)));
    expect(identifyFileFormat(svg)).toBeNull();
  });
  it("rejects plain text disguised as image", () => {
    const txt = new Uint8Array("hello world this is just text".split("").map(c => c.charCodeAt(0)));
    expect(identifyFileFormat(txt)).toBeNull();
  });
  it("rejects empty buffer", () => {
    expect(identifyFileFormat(new Uint8Array(0))).toBeNull();
  });
  it("rejects truncated signature", () => {
    expect(identifyFileFormat(new Uint8Array([0x89]))).toBeNull();
  });
  it("rejects HTML file even if disguised", () => {
    const html = new Uint8Array("<html><body>not an image</body></html>".split("").map(c => c.charCodeAt(0)));
    expect(identifyFileFormat(html)).toBeNull();
  });
});

// =============================================================================
// validateUploadedFile
// =============================================================================

describe("validateUploadedFile", () => {
  it("accepts a valid JPEG for image group", async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
    const fmt = await validateUploadedFile(makeFile("test.jpg", jpeg, "image/jpeg"), "image", 1024);
    expect(fmt.ext).toBe("jpg");
    expect(fmt.mime).toBe("image/jpeg");
  });
  it("rejects JPEG when group is video", async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
    await expect(
      validateUploadedFile(makeFile("test.jpg", jpeg, "image/jpeg"), "video", 1024),
    ).rejects.toThrow(SecurityError);
  });
  it("rejects files larger than maxBytes", async () => {
    const big = new Uint8Array(2000); // not a real image
    big.set([0xff, 0xd8, 0xff, 0xe0], 0);
    await expect(
      validateUploadedFile(makeFile("big.jpg", big, "image/jpeg"), "image", 1000),
    ).rejects.toThrow(/File too large/);
  });
  it("rejects empty files", async () => {
    await expect(
      validateUploadedFile(makeFile("empty.jpg", new Uint8Array(0), "image/jpeg"), "image", 1024),
    ).rejects.toThrow(/empty/);
  });
  it("rejects SVG even with image/svg+xml mime", async () => {
    const svg = new Uint8Array("<svg></svg>".split("").map(c => c.charCodeAt(0)));
    await expect(
      validateUploadedFile(makeFile("evil.svg", svg, "image/svg+xml"), "image", 1024),
    ).rejects.toThrow();
  });
  it("rejects HTML disguised as JPG (mime lies, content is HTML)", async () => {
    const html = new Uint8Array("<html><body>x</body></html>".split("").map(c => c.charCodeAt(0)));
    await expect(
      validateUploadedFile(makeFile("disguise.html", html, "image/jpeg"), "image", 1024),
    ).rejects.toThrow();
  });
});

// =============================================================================
// sanitizeFilename
// =============================================================================

describe("sanitizeFilename", () => {
  it("strips path traversal", () => {
    expect(sanitizeFilename("../../etc/passwd")).not.toContain("/");
    expect(sanitizeFilename("..\\..\\windows\\system32")).not.toContain("\\");
  });
  it("removes control characters", () => {
    expect(sanitizeFilename("file\u0000name\u0007.txt")).not.toMatch(/[\x00-\x1f]/);
  });
  it("removes leading dots (hidden files)", () => {
    expect(sanitizeFilename(".env")).not.toMatch(/^\./);
  });
  it("caps length", () => {
    const long = "a".repeat(500) + ".pdf";
    expect(sanitizeFilename(long).length).toBeLessThanOrEqual(120);
  });
  it("returns 'file' for empty or non-string input", () => {
    expect(sanitizeFilename("")).toBe("file");
    expect(sanitizeFilename("...")).toBe("file");
  });
});

// =============================================================================
// UUID / number validation
// =============================================================================

describe("requireUuid", () => {
  it("accepts a valid UUID and lowercases it", () => {
    expect(requireUuid("ABCDEF12-3456-7890-ABCD-EF1234567890")).toBe(
      "abcdef12-3456-7890-abcd-ef1234567890",
    );
  });
  it("rejects a non-UUID string", () => {
    expect(() => requireUuid("not-a-uuid")).toThrow(SecurityError);
  });
  it("rejects a SQL-injection attempt", () => {
    expect(() => requireUuid("' OR 1=1; --")).toThrow(SecurityError);
  });
  it("rejects a non-string", () => {
    expect(() => requireUuid(123 as any)).toThrow(SecurityError);
    expect(() => requireUuid(null as any)).toThrow(SecurityError);
  });
});

describe("requirePositiveInt", () => {
  it("accepts valid integers in range", () => {
    expect(requirePositiveInt(5, { min: 1, max: 10 })).toBe(5);
    expect(requirePositiveInt("5", { min: 1, max: 10 })).toBe(5);
  });
  it("rejects below min", () => {
    expect(() => requirePositiveInt(0, { min: 1 })).toThrow();
  });
  it("rejects above max", () => {
    expect(() => requirePositiveInt(100, { max: 50 })).toThrow();
  });
  it("rejects non-integers", () => {
    expect(() => requirePositiveInt(1.5 as any)).toThrow();
    expect(() => requirePositiveInt("abc" as any)).toThrow();
  });
});

describe("requirePaiseAmount", () => {
  it("accepts positive paise", () => {
    expect(requirePaiseAmount(100)).toBe(100);
  });
  it("rejects zero / negative", () => {
    expect(() => requirePaiseAmount(0)).toThrow();
    expect(() => requirePaiseAmount(-1)).toThrow();
  });
  it("rejects fractional", () => {
    expect(() => requirePaiseAmount(1.5 as any)).toThrow();
  });
  it("exposes the cap constant", () => {
    expect(MAX_CONTRACT_AMOUNT_PAISE).toBe(5_000_000_00);
  });
});

// =============================================================================
// Rate limiting
// =============================================================================

describe("enforceRateLimit", () => {
  beforeEach(() => _resetRateLimits());

  it("allows up to max calls in the window", () => {
    for (let i = 0; i < 3; i++) {
      expect(() => enforceRateLimit("k1", { max: 3, windowMs: 60_000 })).not.toThrow();
    }
    expect(() => enforceRateLimit("k1", { max: 3, windowMs: 60_000 })).toThrow(/Rate limit/);
  });
  it("isolates buckets per key", () => {
    for (let i = 0; i < 3; i++) {
      enforceRateLimit("user-A", { max: 3, windowMs: 60_000 });
    }
    // user-B still has full quota
    expect(() => enforceRateLimit("user-B", { max: 3, windowMs: 60_000 })).not.toThrow();
  });
  it("resets after the window expires", async () => {
    enforceRateLimit("k2", { max: 1, windowMs: 1 });
    expect(() => enforceRateLimit("k2", { max: 1, windowMs: 1 })).toThrow();
    await new Promise((r) => setTimeout(r, 5));
    expect(() => enforceRateLimit("k2", { max: 1, windowMs: 1 })).not.toThrow();
  });
});

// =============================================================================
// Tokens
// =============================================================================

describe("secureToken", () => {
  it("returns a non-empty base64url string of the requested size", () => {
    const t = secureToken(32);
    expect(t.length).toBeGreaterThan(40); // base64url of 32 bytes ~ 43 chars
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it("returns unique values across calls", () => {
    const a = secureToken(16);
    const b = secureToken(16);
    expect(a).not.toBe(b);
  });
});

describe("timingSafeEqual", () => {
  it("returns true for equal strings", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
  });
  it("returns false for different strings of the same length", () => {
    expect(timingSafeEqual("abc", "abd")).toBe(false);
  });
  it("returns false for different lengths", () => {
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });
  it("handles empty strings", () => {
    expect(timingSafeEqual("", "")).toBe(true);
    expect(timingSafeEqual("", "x")).toBe(false);
  });
});
