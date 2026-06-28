import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/admin/monitoring/stop
 *
 * Marks the monitoring session as ended. Called when the admin closes
 * the tab or navigates away.
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
    .update({ ended_at: new Date().toISOString(), end_reason: "closed" })
    .eq("id", sessionId)
    .eq("admin_id", user.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
