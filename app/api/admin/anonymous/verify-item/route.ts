import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SecurityError } from "@/lib/security";

type TableType = "anonymous_work_experience" | "anonymous_social_links" | "anonymous_documents";

const ALLOWED_TABLES: TableType[] = ["anonymous_work_experience", "anonymous_social_links", "anonymous_documents"];

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
    const table = body.table as string;
    const itemId = String(body.itemId ?? "").trim();
    const action = body.action === "verify" ? "verified" : body.action === "reject" ? "rejected" : null;
    const notes = String(body.notes ?? "").trim().slice(0, 500);

    if (!ALLOWED_TABLES.includes(table as TableType) || !itemId || !action) {
      return NextResponse.json({ ok: false, error: "table, itemId, and action are required" }, { status: 400 });
    }

    const { error } = await admin
      .from(table as any)
      .update({
        verification_status: action,
        verified_by: user.id,
        verified_at: new Date().toISOString(),
      } as any)
      .eq("id", itemId);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, action, itemId });
  } catch (e) {
    if (e instanceof SecurityError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
