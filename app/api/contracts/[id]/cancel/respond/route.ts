import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/contracts/[id]/cancel/respond
 * Body: { cancellation_id: string, agree: boolean }
 * The caller must be the COUNTER-PARTY of the original requester.
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
  const cancellationId = (body?.cancellation_id ?? "").toString();
  const agree = body?.agree === true;
  if (!cancellationId) {
    return NextResponse.json({ error: "cancellation_id is required" }, { status: 400 });
  }

  const { data, error } = await sb.rpc("respond_contract_cancellation" as any, {
    p_cancellation_id: cancellationId,
    p_agree: agree,
  } as any);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json(data);
}
