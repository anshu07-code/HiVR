import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SecurityError } from "@/lib/security";
import { anonymousDisplayId } from "@/lib/crypto";
import { writeAuditLog } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

    const admin = createAdminClient();

    const { data: grantCheck } = await admin
      .from("accounts_team_grants")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: adminCheck } = await admin
      .from("admin_users")
      .select("admin_role")
      .eq("user_id", user.id)
      .maybeSingle();

    const isAccountsTeam = grantCheck != null;
    const isSuperAdmin = adminCheck != null && (adminCheck as any).admin_role === "super_admin";

    if (!isAccountsTeam && !isSuperAdmin) {
      return NextResponse.json({ ok: false, error: "Not authorised. Accounts team only." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const requestId = String(body.requestId ?? "").trim();
    const action = body.action === "approve" ? "approve" : body.action === "reject" ? "reject" : null;
    const notes = String(body.notes ?? "").trim().slice(0, 500);

    if (!requestId || !action) {
      return NextResponse.json({ ok: false, error: "requestId and action (approve|reject) are required" }, { status: 400 });
    }

    const { data: request } = await admin
      .from("anonymous_requests")
      .select("*, employee_profiles!inner(user_id)") as any;

    const { data: reqRow } = await admin
      .from("anonymous_requests")
      .select("id, user_id, requested_tier, status")
      .eq("id", requestId)
      .single() as any;

    if (!reqRow) return NextResponse.json({ ok: false, error: "Request not found" }, { status: 404 });
    if (reqRow.status !== "pending") {
      return NextResponse.json({ ok: false, error: `Request already ${reqRow.status}` }, { status: 400 });
    }

    const requestingUserId = reqRow.user_id;

    if (action === "approve") {
      const { data: seqResult } = await admin.rpc("nextval", { seq_name: "public.anonymous_display_seq" } as any) as any;
      const seqNum = seqResult ?? Math.floor(Math.random() * 90000) + 10000;
      const displayId = typeof seqNum === "number" ? anonymousDisplayId(seqNum) : `Top Pro #${String(seqNum)}`;

      const { error: insertErr } = await admin
        .from("anonymous_profiles")
        .upsert({
          user_id: requestingUserId,
          display_id: displayId,
          display_label: "Top Pro",
          tier: reqRow.requested_tier,
          status: "approved",
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        } as any);

      if (insertErr) return NextResponse.json({ ok: false, error: insertErr.message }, { status: 500 });

      await admin
        .from("employee_profiles")
        .update({ is_anonymous: true } as any)
        .eq("user_id", requestingUserId);
    }

    await admin
      .from("anonymous_requests")
      .update({
        status: action === "approve" ? "approved" : "rejected",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        reviewer_notes: notes || null,
      } as any)
      .eq("id", requestId);

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    await writeAuditLog("wallet_audit_log", {
      userId: user.id,
      action: `anonymous_${action}`,
      metadata: { requestId, targetUserId: requestingUserId, tier: reqRow.requested_tier },
      ipAddress: ip,
    });

    return NextResponse.json({
      ok: true,
      action,
      displayId: action === "approve" ? (await admin.from("anonymous_profiles").select("display_id").eq("user_id", requestingUserId).single() as any)?.data?.display_id : null,
    });
  } catch (e) {
    if (e instanceof SecurityError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
