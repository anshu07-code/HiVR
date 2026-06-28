import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** POST /api/contracts/[id]/pause — buyer pauses the timer (employee is dragging). */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data, error } = await sb.rpc("pause_work" as any, { p_contract_id: params.id } as any);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (data !== true) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
