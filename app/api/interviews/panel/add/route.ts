import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/interviews/panel/add
 * Body: { email: string, role?: "interviewer" | "lead_interviewer" | "admin" }
 * Super admin only. Adds a user (looked up by email) to the interview panel.
 */
export async function POST(req: Request) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

  const { data: isAdmin } = await sb.rpc("is_admin" as any, { p_role: "super_admin" } as any);
  if (!isAdmin) return NextResponse.json({ ok: false, error: "Super admin only" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const role = ["interviewer", "lead_interviewer", "admin"].includes(body.role) ? body.role : "interviewer";
  if (!email) return NextResponse.json({ ok: false, error: "email required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: target } = await admin.from("users").select("id, email, full_name").eq("email", email).maybeSingle();
  if (!target) return NextResponse.json({ ok: false, error: `No user found with email ${email}` }, { status: 404 });

  const { data, error } = await admin.from("interview_panel_members").upsert({
    user_id: (target as any).id,
    role,
    is_active: true,
    added_by: user.id,
  } as any, { onConflict: "user_id" }).select("id").single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, member_id: (data as any).id, user: target });
}
