import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/admin/monitoring/start
 *
 * Inserts a row in admin_monitoring_sessions. Called when an admin
 * opens a chat (contract or workspace) in the monitoring panel.
 * Returns the session id; the client must heartbeat every 15s.
 *
 * Body: { workspaceId?: string, contractId?: string }
 * Exactly one of workspaceId or contractId must be present.
 */

const ALLOWED_ROLES = new Set([
  "super_admin", "contact_admin", "tech_executive", "trust_safety_admin",
]);

export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

  // Admin gate
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
  const workspaceId = body.workspaceId ? String(body.workspaceId) : null;
  const contractId = body.contractId ? String(body.contractId) : null;
  if (!workspaceId && !contractId) {
    return NextResponse.json({ ok: false, error: "workspaceId or contractId required" }, { status: 400 });
  }
  if (workspaceId && contractId) {
    return NextResponse.json({ ok: false, error: "Provide only one of workspaceId or contractId" }, { status: 400 });
  }

  // Validate the target exists before insert — saves us a 500 from a
  // FK violation. The admin client is used because service_role
  // bypasses RLS and is the only role that can reliably read across all
  // tables here.
  const admin = createAdminClient();
  if (workspaceId) {
    const { data: ws } = await admin.from("workspaces").select("id").eq("id", workspaceId).maybeSingle();
    if (!ws) {
      return NextResponse.json({ ok: false, error: `Workspace ${workspaceId} not found` }, { status: 404 });
    }
  }
  if (contractId) {
    const { data: c } = await admin.from("contracts").select("id").eq("id", contractId).maybeSingle();
    if (!c) {
      return NextResponse.json({ ok: false, error: `Contract ${contractId} not found` }, { status: 404 });
    }
  }

  // Close any stale session this admin has on the same target
  await (admin.from("admin_monitoring_sessions") as any)
    .update({ ended_at: new Date().toISOString(), end_reason: "superseded" })
    .eq("admin_id", user.id)
    .is("ended_at", null);

  // Get admin's name for denormalised display
  const { data: profile } = await sb.from("users").select("full_name").eq("id", user.id).maybeSingle();

  const { data, error } = await (admin.from("admin_monitoring_sessions") as any)
    .insert({
      admin_id: user.id,
      admin_name: (profile as any)?.full_name ?? "Admin",
      workspace_id: workspaceId,
      contract_id: contractId,
    })
    .select("id, started_at, last_heartbeat_at")
    .single();
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[admin/monitoring/start] insert failed:", {
      admin_id: user.id,
      workspace_id: workspaceId,
      contract_id: contractId,
      code: (error as any).code,
      message: error.message,
      details: (error as any).details,
      hint: (error as any).hint,
    });
    return NextResponse.json({
      ok: false,
      error: error.message,
      code: (error as any).code,
      details: (error as any).details,
      hint: (error as any).hint,
    }, { status: 500 });
  }
  return NextResponse.json({ ok: true, session: data });
}
