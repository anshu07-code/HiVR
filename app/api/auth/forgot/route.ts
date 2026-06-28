/**
 * POST /api/auth/forgot
 * Body: { email, next? }
 *
 * 1. Calls the SECURITY DEFINER RPC `create_password_reset_token` which
 *    rate-limits to 5 codes/email/hour and generates a 6-digit code (10-min
 *    TTL).
 * 2. Sends the code via Resend (or logs to console in dev if no API key).
 *
 * Always returns { ok: true } (even if the email doesn't exist) to avoid
 * user-enumeration attacks. The actual OTP delivery status is logged
 * server-side, never returned to the client.
 *
 * CSRF protection (L2): rejects requests whose Origin does not match the
 * expected app origin. This blocks the "spam a user with password-reset
 * emails" cross-site attack without requiring a CSRF token round-trip.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendOtpEmail } from "@/lib/email";
import { checkSameOrigin } from "@/lib/security";

export async function POST(req: NextRequest) {
  // CSRF / cross-site guard. Browsers always send Origin for fetch POSTs.
  const sameOriginError = checkSameOrigin(req);
  if (sameOriginError) return sameOriginError;

  let body: { email?: string; next?: string };
  try { body = await req.json(); } catch { body = {}; }
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: true });
  }

  const sb = createClient();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = req.headers.get("user-agent") ?? null;

  const { data, error } = await sb.rpc("create_password_reset_token" as any, {
    p_email: email,
    p_ip: ip,
    p_user_agent: ua,
  } as any);

  if (error) {
    console.error(`[forgot-password] create_password_reset_token error: ${error.message}`);
    return NextResponse.json({ ok: true });
  }

  const row = Array.isArray(data) ? data[0] : data;
  const code: string | null = (row as any)?.code ?? null;
  const rateLimited: boolean = (row as any)?.rate_limited === true;

  if (code && !rateLimited) {
    const result = await sendOtpEmail(email, code);
    if (!result.ok) {
      console.error(`[forgot-password] Failed to deliver OTP for rate-limited=0: ${result.error}`);
    }
  } else if (rateLimited) {
    console.warn(`[forgot-password] Rate-limited OTP request`);
  }

  return NextResponse.json({ ok: true });
}
