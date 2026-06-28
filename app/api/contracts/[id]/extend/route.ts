import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** POST /api/contracts/[id]/extend — buyer adds more time / money to the contract. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const minutes = Number(body.minutes ?? 0);
  const paise = Number(body.paise ?? 0);
  if (minutes <= 0 || paise <= 0) {
    return NextResponse.json({ error: "minutes and paise are required" }, { status: 400 });
  }
  const { data, error } = await sb.rpc("extend_work" as any, {
    p_contract_id: params.id,
    p_extra_minutes: minutes,
    p_extra_paise: paise,
  } as any);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, added: data });
}
