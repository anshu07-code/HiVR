import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWebPushToUser, type PushPayload, isPushConfigured } from "@/lib/web-push";

/**
 * POST /api/push/send
 * Body: { user_id: string, payload: PushPayload }
 * Service-role or authed call that sends a web push to all the
 * user's active browser subscriptions. Best-effort: dead
 * subscriptions are pruned in-flight.
 *
 * Auth: requires either the service_role key (cron / server-side
 * code) or an authenticated admin user.
 */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? "";
  const isServiceCall = serviceKey && auth === `Bearer ${serviceKey}`;

  if (!isServiceCall) {
    const sb = await import("@/lib/supabase/server").then(m => m.createClient());
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
    // Only super admins can send via authed calls.
    const { data: isAdmin } = await sb.rpc("is_admin" as any, { p_role: "super_admin" } as any);
    if (!isAdmin) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  if (!isPushConfigured()) {
    return NextResponse.json({ ok: false, error: "VAPID not configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const userId  = String(body.user_id ?? "");
  const payload = body.payload as PushPayload | undefined;
  if (!userId || !payload || !payload.title || !payload.body) {
    return NextResponse.json({ ok: false, error: "user_id and payload.title + payload.body required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const summary = await sendWebPushToUser(admin, userId, payload);
  return NextResponse.json({ ok: true, ...summary });
}
