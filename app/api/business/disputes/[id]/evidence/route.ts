import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/business/disputes/[id]/evidence
 * Body: { type: string, content: string, file_url?: string }
 *
 * Submits evidence to a dispute. Resets auto_decide_at by 7 days
 * (giving admin time to consider the new evidence).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: bp } = await sb.from("business_profiles").select("id").eq("owner_user_id", user.id).maybeSingle();
  if (!bp) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    type?: string;
    content?: string;
    file_url?: string;
  };
  const type = (body.type ?? "other").slice(0, 40);
  const content = (body.content ?? "").slice(0, 8000);
  if (!content.trim()) return NextResponse.json({ error: "Content is required" }, { status: 400 });

  // Verify the dispute belongs to this business and is still open
  const { data: dispute } = await sb.from("business_disputes")
    .select("id, business_id, status")
    .eq("id", params.id).eq("business_id", bp.id).maybeSingle();
  if (!dispute) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!["open", "under_review"].includes((dispute as any).status)) {
    return NextResponse.json({ error: `Cannot add evidence: status is "${(dispute as any).status}".` }, { status: 400 });
  }

  // Insert the evidence row
  const { data, error } = await sb.from("business_dispute_evidence").insert({
    dispute_id: params.id,
    submitted_by: user.id,
    submitted_by_role: "business",
    evidence_type: type,
    content,
    file_url: body.file_url ?? null,
  } as any).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Bump status to under_review + reset auto_decide_at by 7 days
  const newAutoDecideAt = new Date(Date.now() + 7 * 86400_000).toISOString();
  await sb.from("business_disputes").update({
    status: "under_review",
    auto_decide_at: newAutoDecideAt,
  } as any).eq("id", params.id);

  return NextResponse.json({ ok: true, id: (data as any)?.id, autoDecideAt: newAutoDecideAt });
}
