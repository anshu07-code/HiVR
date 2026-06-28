import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const contractId = String(body.contractId ?? "");
  const reason = String(body.reason ?? "");
  const evidence = Array.isArray(body.evidence) ? body.evidence : [];
  if (!contractId || reason.length < 10) {
    return NextResponse.json({ ok: false, error: "contractId and reason (min 10 chars) required" }, { status: 400 });
  }
  const { data, error } = await (sb.rpc as any)("file_scope_mismatch_dispute", {
    p_contract_id: contractId,
    p_reason: reason,
    p_evidence: evidence,
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data || data.ok === false) return NextResponse.json({ ok: false, error: data?.error ?? "Failed" }, { status: 400 });
  return NextResponse.json(data);
}
