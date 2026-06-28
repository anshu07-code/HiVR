/**
 * tests/check-same-origin.test.ts
 *
 * Tests for the `checkSameOrigin` CSRF helper. This runs in a vitest
 * env so we need to stub the env vars it consults.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("checkSameOrigin", () => {
  const origEnv = process.env.NEXT_PUBLIC_APP_URL;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.hivr.in";
  });
  afterEach(() => {
    if (origEnv == null) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = origEnv;
  });

  it("returns null when no origin or referer headers are present (server actions, etc)", async () => {
    const { checkSameOrigin } = await import("../lib/security");
    const req = new Request("https://app.hivr.in/api/test", { method: "POST" });
    expect(checkSameOrigin(req)).toBeNull();
  });

  it("returns null when origin matches expected app URL", async () => {
    const { checkSameOrigin } = await import("../lib/security");
    const req = new Request("https://app.hivr.in/api/test", {
      method: "POST",
      headers: { origin: "https://app.hivr.in" },
    });
    expect(checkSameOrigin(req)).toBeNull();
  });

  it("returns 403 when origin is cross-site", async () => {
    const { checkSameOrigin } = await import("../lib/security");
    const req = new Request("https://app.hivr.in/api/test", {
      method: "POST",
      headers: { origin: "https://attacker.example" },
    });
    const res = checkSameOrigin(req);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });

  it("returns 403 when only referer is provided and is cross-site", async () => {
    const { checkSameOrigin } = await import("../lib/security");
    const req = new Request("https://app.hivr.in/api/test", {
      method: "POST",
      headers: { referer: "https://attacker.example/page" },
    });
    const res = checkSameOrigin(req);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });

  it("returns null when referer matches expected origin (even without origin header)", async () => {
    const { checkSameOrigin } = await import("../lib/security");
    const req = new Request("https://app.hivr.in/api/test", {
      method: "POST",
      headers: { referer: "https://app.hivr.in/dashboard" },
    });
    expect(checkSameOrigin(req)).toBeNull();
  });
});
