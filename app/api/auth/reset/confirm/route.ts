/**
 * POST /api/auth/reset/confirm
 * Body: { email, code, password, session_token }
 *
 * Verifies the one-time HMAC session token, then resets the password via
 * the SECURITY DEFINER RPC `reset_user_password` (which bcrypts the new
 * password and updates auth.users).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyResetSessionToken } from "@/lib/reset-session";

export async function POST(req: NextRequest) {
  let body: { email?: string; code?: string; password?: string; session_token?: string };
  try { body = await req.json(); } catch { body = {}; }
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const code = String(body.code ?? "").trim();
  const sessionToken = String(body.session_token ?? "");

  if (!email || password.length < 8 || !sessionToken) {
    return NextResponse.json({ error: "Missing fields or password too short (min 8 chars)" }, { status: 400 });
  }

  const payload = verifyResetSessionToken(sessionToken);
  if (!payload) {
    return NextResponse.json({ error: "Session expired. Please start over." }, { status: 401 });
  }

  const sb = createClient();
  const { data: ok, error: rpcErr } = await sb.rpc("reset_user_password" as any, {
    p_email: email,
    p_new_password: password,
    p_code: code,
  } as any);

  if (rpcErr) {
    console.error(`[forgot-password] reset_user_password error: ${rpcErr.message}`);
    return NextResponse.json({ error: rpcErr.message }, { status: 400 });
  }

  if (ok !== true) {
    return NextResponse.json({ error: "Password reset failed. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Password updated. Please sign in." });
}
