// Sets baseline security headers on every response.
// Supabase session refresh is intentionally excluded here — @supabase/ssr v0.5.x
// has a race condition when both middleware and Server Components call getUser()
// simultaneously. Server Components handle their own session refresh.
//
// Security headers:
//   - Strict-Transport-Security (HSTS) — forces HTTPS for 1 year
//   - X-Frame-Options: DENY — clickjacking protection
//   - X-Content-Type-Options: nosniff — prevents MIME sniffing
//   - Referrer-Policy: strict-origin-when-cross-origin
//   - Permissions-Policy — disables features we don't use
//   - X-DNS-Prefetch-Control: off

import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({ request: { headers: request.headers } });

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
