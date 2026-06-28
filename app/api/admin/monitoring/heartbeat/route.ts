import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/admin/monitoring/heartbeat
 *
 * Updates last_heartbeat_at on an open monitoring session. The
 * client calls this every ~15s while the chat is open. If we don't
 * hear from the admin for >2 minutes the session is considered
 * stale (auto-expired by the next call to expire_stale_monitoring_sessions).
 *
 * Body: { sessionId: string }
 */

const ALLOWED_ROLES = new Set([
  "super_admin", "contact_admin", "tech_executive", "trust_safety_admin",
]);

export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

  const { data: adminRow } = await sb
    .from("admin_users")
    .select("admin_role")
    .eq("user_id", user.id)
    .maybeSingle();
  const role = (adminRow as any)?.admin_role as string | undefined;
  if (!role || !ALLOWED_ROLES.has(role)) {
    return NextResponse.json({ ok: false, error: "Not authorised" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const sessionId = String(body.sessionId ?? "");
  if (!sessionId) return NextResponse.json({ ok: false, error: "sessionId required" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await (admin.from("admin_monitoring_sessions") as any)
    .update({ last_heartbeat_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("admin_id", user.id)
    .is("ended_at", null);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
