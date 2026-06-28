import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/contracts/[id]/withdraw
 * Body: { reason?: string }
 *
 * Either party can withdraw from an active contract. The withdrawer
 * pays a fixed ₹99 penalty to HiVR (debited from wallet if balance
 * allows, else added to pending balance and consumed on next payout).
 * The escrow is fully refunded to the buyer.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

  let body: any = null;
  try { body = await req.json(); } catch { body = null; }
  const reason = body?.reason ? String(body.reason).trim() : null;

  const { data, error } = await sb.rpc("withdraw_from_contract" as any, {
    p_contract_id: params.id,
    p_reason: reason,
  } as any);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
