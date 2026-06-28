import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** POST /api/contracts/[id]/milestones/[mid]/submit — employee marks a checkpoint delivered. */
export async function POST(req: NextRequest, { params }: { params: { id: string; mid: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { data, error } = await sb.rpc("submit_checkpoint" as any, {
    p_milestone_id: params.mid,
    p_note: body.note ?? null,
    p_url: body.url ?? null,
    p_storage_path: body.storage_path ?? null,
  } as any);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (data !== true) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
