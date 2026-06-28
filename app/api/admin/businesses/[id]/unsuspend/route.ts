import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: admin } = await sb.from("admin_users").select("admin_role").eq("user_id", user.id).maybeSingle();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await sb.from("business_profiles").update({
    is_suspended: false,
    suspended_reason: null,
    suspended_at: null,
  } as any).eq("id", params.id);

  try {
    await sb.from("business_audit_log").insert({
      business_id: params.id,
      actor_id: user.id,
      actor_role: "admin",
      action: "unsuspended",
    } as any);
  } catch {}

  return NextResponse.json({ ok: true, message: "Suspension lifted." });
}
