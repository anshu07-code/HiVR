import { NextResponse } from "next/server";
import { isPushConfigured } from "@/lib/web-push";

/**
 * GET /api/push/vapid-public-key
 * Returns the VAPID public key so the browser can subscribe.
 * The key is public — safe to expose to all clients (including anon).
 */
export async function GET() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  if (!publicKey) {
    return NextResponse.json(
      { ok: false, error: "VAPID not configured on the server" },
      { status: 503 }
    );
  }
  return NextResponse.json(
    { ok: true, publicKey, configured: isPushConfigured() },
    {
      headers: {
        // Don't let any cache hide the public key.
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
