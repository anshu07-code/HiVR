import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** POST /api/contracts/[id]/milestones/[mid]/reject — buyer rejects a checkpoint with feedback. */
export async function POST(req: NextRequest, { params }: { params: { id: string; mid: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const feedback = String(body.feedback ?? "").trim();
  if (feedback.length < 5) return NextResponse.json({ error: "Feedback is required (5+ chars)" }, { status: 400 });

  const { data, error } = await sb.rpc("reject_checkpoint" as any, {
    p_milestone_id: params.mid,
    p_feedback: feedback,
  } as any);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (data !== true) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
