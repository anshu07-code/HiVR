import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/push/subscribe
 * Body: { endpoint: string, keys: { p256dh: string, auth: string }, userAgent?: string }
 * Registers a browser push subscription for the current user.
 */
export async function POST(req: Request) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const endpoint = String(body.endpoint ?? "");
  const p256dh   = String(body?.keys?.p256dh ?? "");
  const auth     = String(body?.keys?.auth ?? "");
  const userAgent = body.userAgent ? String(body.userAgent).slice(0, 500) : null;

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ ok: false, error: "endpoint, keys.p256dh, keys.auth required" }, { status: 400 });
  }

  // Validate the endpoint — only accept https push service URLs
  if (!/^https:\/\//.test(endpoint)) {
    return NextResponse.json({ ok: false, error: "endpoint must be an https URL" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("push_subscriptions")
    .upsert({
      user_id: user.id,
      endpoint,
      p256dh,
      auth,
      user_agent: userAgent,
      failure_count: 0,
      updated_at: new Date().toISOString(),
    } as any, { onConflict: "endpoint" })
    .select("id")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, subscription_id: (data as any).id });
}
