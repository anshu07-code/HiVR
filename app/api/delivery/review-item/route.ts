import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const itemId = String(body.itemId ?? "");
  const status = String(body.status ?? "");
  const comment = body.comment ? String(body.comment) : null;
  if (!itemId || !["done", "not_done"].includes(status)) {
    return NextResponse.json({ ok: false, error: "itemId and valid status required" }, { status: 400 });
  }
  const { data, error } = await (sb.rpc as any)("buyer_review_delivery_item", {
    p_item_id: itemId,
    p_status: status,
    p_comment: comment,
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data || data.ok === false) return NextResponse.json({ ok: false, error: data?.error ?? "Failed" }, { status: 400 });
  return NextResponse.json(data);
}
