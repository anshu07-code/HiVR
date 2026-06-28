import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { buildAuthorizeUrl, digilockerConfig, generateState, simulateEaadhaar } from "@/lib/digilocker";

/**
 * GET /api/verification/digilocker/start?purpose=buyer|employee
 *
 * Initiates the DigiLocker OAuth flow. Generates a CSRF state token,
 * stashes it in a short-lived cookie, and redirects the user to
 * DigiLocker's authorize endpoint.
 *
 * Sandbox mode (BYPASS_AADHAAR=true or no client_id):
 *   Instead of redirecting, we simulate a successful eKYC right here
 *   and redirect to the same callback URL with `?bypass=1&code=sandbox`.
 *   This lets the rest of the eKYC pipeline be tested without real
 *   DigiLocker credentials.
 */
export async function GET(req: Request) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "Not signed in" }, { status: 401 });
  }

  const url = new URL(req.url);
  const purpose = url.searchParams.get("purpose") ?? "employee";
  const next = url.searchParams.get("next") ?? `/onboarding/${purpose === "buyer" ? "buyer" : "employee"}`;
  const docType = (url.searchParams.get("doc_type") ?? "aadhaar") as "aadhaar" | "pan";

  const cfg = digilockerConfig();
  // Sandbox / bypass: skip the actual OAuth, jump straight to the
  // callback with a fake code. The callback handles the bypass.
  if (cfg.bypass || !cfg.isConfigured) {
    const cb = new URL(cfg.redirectUri || `${url.origin}/api/verification/digilocker/callback`);
    cb.searchParams.set("code", "sandbox-bypass");
    cb.searchParams.set("state", "sandbox");
    cb.searchParams.set("bypass", "1");
    cb.searchParams.set("purpose", purpose);
    cb.searchParams.set("doc_type", docType);
    cb.searchParams.set("next", next);
    return NextResponse.redirect(cb);
  }

  // Real flow.
  const state = generateState();
  const ck = cookies();
  ck.set("dl_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: url.protocol === "https:",
    path: "/",
    maxAge: 600, // 10 minutes
  });
  ck.set("dl_oauth_purpose", purpose, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  ck.set("dl_oauth_doc_type", docType, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  ck.set("dl_oauth_next", next, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });

  // DigiLocker's authorize endpoint accepts a `doc_type` param so the
  // user lands on the right document picker screen.
  const authorizeUrl = buildAuthorizeUrl({ state, purpose: `HiVR eKYC (${purpose})`, docType });
  return NextResponse.redirect(authorizeUrl);
}
