import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** POST /api/applications/interview/[id]/respond — employee accepts or declines an interview. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const response = String(body.response ?? "");
  if (!["accepted", "declined"].includes(response)) {
    return NextResponse.json({ error: "response must be 'accepted' or 'declined'" }, { status: 400 });
  }
  const { data, error } = await sb.rpc("respond_to_interview" as any, {
    p_interview_id: params.id,
    p_response: response,
  } as any);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (data !== true) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
