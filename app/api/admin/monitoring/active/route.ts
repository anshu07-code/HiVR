import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/monitoring/active
 *
 * Returns all open monitoring sessions. Used by the live panel on
 * /admin/tech and /admin/contact. Optionally filters by workspaceId
 * or contractId via query string.
 *
 *   GET /api/admin/monitoring/active?workspaceId=<uuid>
 *   GET /api/admin/monitoring/active?contractId=<uuid>
 */

const ALLOWED_ROLES = new Set([
  "super_admin", "contact_admin", "tech_executive", "trust_safety_admin",
]);

export async function GET(req: NextRequest) {
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

  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspaceId");
  const contractId = url.searchParams.get("contractId");

  let q = sb
    .from("admin_monitoring_sessions")
    .select(`
      id, admin_id, admin_name, workspace_id, contract_id,
      started_at, last_heartbeat_at, ended_at
    `)
    .is("ended_at", null)
    .order("last_heartbeat_at", { ascending: false });

  if (workspaceId) q = q.eq("workspace_id", workspaceId);
  if (contractId) q = q.eq("contract_id", contractId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, sessions: data ?? [] });
}
