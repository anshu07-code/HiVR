/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
  async headers() {
    // CORS / cross-origin policy (M5 fix).
    // The app is a same-origin Next.js app. The only cross-origin requests
    // we expect are:
    //   1. Supabase REST/Realtime (subdomain of supabase.co) — covered by
    //      the next.config.mjs image patterns + the realtime WS in
    //      middleware.
    //   2. Razorpay checkout.js + the iframe popup — no CORS preflight.
    //   3. Google OAuth (if enabled later) — no CORS preflight.
    // We restrict `connect-src` for our own API to same-origin only, and
    // allow Supabase + Razorpay. `frame-ancestors 'none'` blocks all
    // iframing (defence-in-depth against clickjacking, in addition to
    // the X-Frame-Options set in middleware).
    const csp = [
      "default-src 'self'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https://assets.mixkit.co https://cdn.pixabay.com https://*.supabase.co",
      "style-src 'self' 'unsafe-inline'",
      // Next.js dev server needs 'unsafe-eval' for fast refresh. In
      // production this is still emitted but browsers ignore unsafe-eval
      // for non-script contexts.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://checkout.razorpay.com https://cdn.jsdelivr.net",
      "worker-src 'self' blob:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.razorpay.com https://lumberjack.razorpay.com https://cdn.jsdelivr.net https://storage.googleapis.com",
      "frame-src 'self' https://checkout.razorpay.com https://api.razorpay.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), interest-cohort=()" },
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" }]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
