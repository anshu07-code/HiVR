import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const itemId = String(body.itemId ?? "");
  const action = String(body.action ?? "");
  const response = body.response ? String(body.response) : null;
  const evidenceUrl = body.evidenceUrl ? String(body.evidenceUrl) : null;
  if (!itemId || !["fix", "dispute"].includes(action)) {
    return NextResponse.json({ ok: false, error: "itemId and valid action required" }, { status: 400 });
  }
  const { data, error } = await (sb.rpc as any)("employee_respond_delivery_item", {
    p_item_id: itemId,
    p_action: action,
    p_response: response,
    p_evidence_url: evidenceUrl,
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data || data.ok === false) return NextResponse.json({ ok: false, error: data?.error ?? "Failed" }, { status: 400 });
  return NextResponse.json(data);
}
