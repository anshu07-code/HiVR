import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const itemId = String(body.itemId ?? "");
  if (!itemId) return NextResponse.json({ ok: false, error: "itemId required" }, { status: 400 });
  const { data, error } = await (sb.rpc as any)("file_item_level_dispute", {
    p_item_id: itemId,
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data || data.ok === false) return NextResponse.json({ ok: false, error: data?.error ?? "Failed" }, { status: 400 });
  return NextResponse.json(data);
}
