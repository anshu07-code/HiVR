/**
 * DELETE /api/business/team/[id]
 * Marks the business_members row as 'removed'. If the user is currently
 * signed in, their next request will lose access to /business/* routes
 * (because is_business_member_or_owner will return false).
 *
 * Cannot remove the owner.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: bp } = await sb.from("business_profiles").select("id, owner_user_id").eq("owner_user_id", user.id).maybeSingle();
  if (!bp) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  // Pull the member
  const { data: member } = await sb.from("business_members")
    .select("id, business_id, member_role, status")
    .eq("id", params.id).maybeSingle();
  if (!member) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if ((member as any).business_id !== bp.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if ((member as any).member_role === "owner") {
    return NextResponse.json({ error: "Cannot remove the owner." }, { status: 400 });
  }

  // For 'invited' rows: just delete
  if ((member as any).status === "invited") {
    const { error } = await sb.from("business_members").delete().eq("id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, action: "deleted" });
  }

  // For 'active' rows: mark as removed (preserves audit trail + contracts)
  const { error } = await sb.from("business_members")
    .update({ status: "removed" } as any)
    .eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, action: "removed" });
}
