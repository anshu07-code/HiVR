import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/security";

export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  enforceRateLimit(`workspace_fund_wallet:${user.id}`, { max: 10, windowMs: 60_000 });

  const body = await req.json().catch(() => ({}));
  const workspaceId = body.workspaceId ? String(body.workspaceId) : null;
  if (!workspaceId) return NextResponse.json({ ok: false, error: "Missing workspaceId" }, { status: 400 });

  // Look up the escrow amount from the workspace
  const { data: ws } = await sb
    .from("workspaces")
    .select("escrow_amount_paise, buyer_id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (!ws) return NextResponse.json({ ok: false, error: "Workspace not found" }, { status: 404 });
  if ((ws as any).buyer_id !== user.id) return NextResponse.json({ ok: false, error: "Only the buyer can fund escrow" }, { status: 403 });

  const amountPaise = (ws as any).escrow_amount_paise;
  if (!amountPaise || amountPaise <= 0) return NextResponse.json({ ok: false, error: "Invalid escrow amount" }, { status: 400 });

  // wallet_debit_for_escrow(p_user_id, p_amount_paise, p_workspace_id, p_description)
  const { data, error } = await sb.rpc("wallet_debit_for_escrow" as any, {
    p_user_id: user.id,
    p_amount_paise: amountPaise,
    p_workspace_id: workspaceId,
    p_description: `Funded workspace escrow (${workspaceId.slice(0, 8)})`,
  } as any);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const result = data as any;
  if (!result?.ok) return NextResponse.json({ ok: false, error: result?.error ?? "Failed" }, { status: 400 });

  // Mark the workspace as funded (status → funded, escrow_funded → true, etc.)
  const { error: fundErr } = await sb.rpc("fund_workspace_escrow" as any, {
    p_workspace_id: workspaceId,
    p_provider: "wallet",
    p_payment_id: null,
  } as any);
  if (fundErr) return NextResponse.json({ ok: false, error: fundErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, balance: result.balance });
}
