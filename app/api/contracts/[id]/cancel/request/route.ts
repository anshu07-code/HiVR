import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/contracts/[id]/cancel/request
 * Body: { reason: string }
 * Caller must be a party (buyer or employee) of the contract.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: any = null;
  try { body = await req.json(); } catch { body = null; }
  const reason = (body?.reason ?? "").toString().trim();
  if (reason.length < 3) {
    return NextResponse.json({ error: "A reason of at least 3 characters is required" }, { status: 400 });
  }

  const contractId = params.id;
  const { data, error } = await sb.rpc("request_contract_cancellation" as any, {
    p_contract_id: contractId,
    p_reason: reason,
  } as any);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, cancellation_id: data });
}
