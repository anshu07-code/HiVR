import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const contractId = String(body.contractId ?? "");
  if (!contractId) return NextResponse.json({ ok: false, error: "contractId required" }, { status: 400 });
  const { data, error } = await (sb.rpc as any)("employee_mark_contract_delivered", {
    p_contract_id: contractId,
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data || data.ok === false) return NextResponse.json({ ok: false, error: data?.error ?? "Failed" }, { status: 400 });
  return NextResponse.json(data);
}
