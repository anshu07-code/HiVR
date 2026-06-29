import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/auth/google/callback
 *
 * Google redirects here after the user authorises.
 * We exchange the authorisation code for Google tokens, then call
 * supabase.auth.signInWithIdToken() to create a Supabase session.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? origin;

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const errorParam = searchParams.get("error");

  // User declined at the Google consent screen.
  if (errorParam === "access_denied") {
    return NextResponse.redirect(new URL("/auth/signin", appUrl));
  }

  // Verify state (CSRF protection).
  const storedState = request.cookies.get("google_oauth_state")?.value;
  if (!state || !storedState || state !== storedState) {
    console.warn("[google-callback] state mismatch — possible CSRF");
    return NextResponse.redirect(new URL("/auth/signin?error=oauth", appUrl));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/auth/signin?error=oauth", appUrl));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/auth/signin?error=google_not_configured", appUrl));
  }

  // Exchange the authorisation code for tokens.
  let tokens: any;
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${appUrl}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });
    tokens = await res.json();
  } catch (e) {
    console.error("[google-callback] token exchange failed:", (e as Error).message);
    return NextResponse.redirect(new URL("/auth/signin?error=oauth", appUrl));
  }

  if (!tokens.id_token) {
    console.error("[google-callback] no id_token in response", tokens.error ?? "");
    return NextResponse.redirect(new URL("/auth/signin?error=oauth", appUrl));
  }

  // Create a Supabase session using the Google ID token.
  const sb = createClient();
  const { error } = await sb.auth.signInWithIdToken({
    provider: "google",
    token: tokens.id_token,
  });

  if (error) {
    console.error("[google-callback] signInWithIdToken failed:", error.message);
    return NextResponse.redirect(new URL(`/auth/signin?error=${encodeURIComponent(error.message)}`, appUrl));
  }

  // Clean up the state cookie.
  const response = NextResponse.redirect(new URL("/dashboard", appUrl));
  response.cookies.set("google_oauth_state", "", { path: "/", maxAge: 0 });

  return response;
}
