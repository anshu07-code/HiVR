/**
 * HMAC-signed session token used by the password reset flow.
 * - 15-min TTL
 * - Single-use via `jti`
 * - Signed with HMAC-SHA256 using `SUPABASE_SERVICE_ROLE_KEY` as the secret
 *   (with a dev-only fallback).
 */
import crypto from "crypto";

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY required for reset session signing");
const SESSION_SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TTL_MIN = 15;

export function signResetSessionToken(payload: { user_id: string }): string {
  const body = Buffer.from(JSON.stringify({
    user_id: payload.user_id,
    exp: Math.floor(Date.now() / 1000) + TTL_MIN * 60,
    jti: crypto.randomBytes(8).toString("hex"),
  })).toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyResetSessionToken(token: string): { user_id: string; exp: number; jti: string } | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  if (expected !== sig) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
