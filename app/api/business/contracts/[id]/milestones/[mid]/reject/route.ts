import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Reject a submitted milestone (request changes).
 * Sets status back to 'in_progress' so the employee can resubmit.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string; mid: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: bp } = await sb.from("business_profiles").select("id").eq("owner_user_id", user.id).maybeSingle();
  if (!bp) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const { data: ms } = await sb.from("business_milestones")
    .select("id, status, business_id").eq("id", params.mid).eq("contract_id", params.id).maybeSingle();
  if (!ms) return NextResponse.json({ error: "Milestone not found" }, { status: 404 });
  if ((ms as any).business_id !== bp.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if ((ms as any).status !== "submitted") {
    return NextResponse.json({ error: `Cannot reject: status is "${(ms as any).status}".` }, { status: 400 });
  }

  const { error } = await sb.from("business_milestones").update({
    status: "in_progress",
    approved_at: null,
    approved_by: null,
  } as any).eq("id", params.mid);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
