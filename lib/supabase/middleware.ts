// Middleware-side Supabase client. Refreshes the session cookie on every request
// so server components always see an up-to-date auth state.
//
// Also sets baseline security headers on every response:
//   - Strict-Transport-Security (HSTS) — forces HTTPS for 1 year
//   - X-Frame-Options: DENY — clickjacking protection
//   - X-Content-Type-Options: nosniff — prevents MIME sniffing
//   - Referrer-Policy: strict-origin-when-cross-origin
//   - Permissions-Policy — disables features we don't use
//   - X-DNS-Prefetch-Control: off
// CSP is intentionally omitted here (it conflicts with the Supabase
// Realtime WS endpoint and Razorpay checkout). If you want strict CSP,
// add a nonce-based policy in a future iteration.

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./types";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    },
  );

  // Refresh session if needed. IMPORTANT: do not put any other logic between
  // createServerClient and the auth.getUser() call — doing so can cause the
  // session to be randomly logged out.
  await supabase.auth.getUser();

  // Baseline security headers (M1 fix). We use a fresh NextResponse.next
  // wrapper so the headers are always attached, even when the Supabase
  // client short-circuits with its own response.
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-DNS-Prefetch-Control", "off");
  response.headers.set("Permissions-Policy", "camera=(self), microphone=(self), geolocation=(), interest-cohort=()");
  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }

  return response;
}
