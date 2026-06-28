/**
 * POST /api/auth/reset/verify
 * Body: { email, code }
 *
 * Verifies the 6-digit OTP via the SECURITY DEFINER RPC
 * `verify_password_reset_code`. On success, returns a one-time HMAC-signed
 * session token (15-min TTL) that the client uses in /confirm to set the
 * new password.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signResetSessionToken } from "@/lib/reset-session";

export async function POST(req: NextRequest) {
  let body: { email?: string; code?: string };
  try { body = await req.json(); } catch { body = {}; }
  const email = String(body.email ?? "").trim().toLowerCase();
  const code = String(body.code ?? "").trim();
  if (!email || code.length !== 6) {
    return NextResponse.json({ error: "Invalid email or code" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("verify_password_reset_code" as any, {
    p_email: email,
    p_code: code,
  } as any);

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Invalid or expired code" }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    session_token: signResetSessionToken({ user_id: data as string }),
  });
}
