import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-auth";

const REFUND_FEE_PAISE = 49 * 100;

export async function POST(req: NextRequest) {
  await requireAdmin();
  const sb = createClient();
  const admin = createAdminClient();

  const body = await req.json().catch(() => ({}));
  const workspaceId = String(body.workspaceId ?? "");
  const contractId = String(body.contractId ?? "");
  const reason = String(body.reason ?? "Admin refund").slice(0, 500);

  if (!workspaceId && !contractId) {
    return NextResponse.json({ ok: false, error: "workspaceId or contractId required" }, { status: 400 });
  }

  // Find workspace
  let ws: any;
  if (workspaceId) {
    const { data } = await sb.from("workspaces").select("id, contract_id, buyer_id, escrow_amount_paise, status").eq("id", workspaceId).maybeSingle();
    ws = data;
  } else {
    const { data } = await sb.from("workspaces").select("id, contract_id, buyer_id, escrow_amount_paise, status").eq("contract_id", contractId).maybeSingle();
    ws = data;
  }
  if (!ws) return NextResponse.json({ ok: false, error: "Workspace not found" }, { status: 404 });
  if (ws.status !== "completed") {
    return NextResponse.json({ ok: false, error: "Only completed workspaces can be refunded" }, { status: 400 });
  }

  const buyerId = ws.buyer_id;
  const grossPaise = Number(ws.escrow_amount_paise ?? 0);
  if (grossPaise <= 0) return NextResponse.json({ ok: false, error: "No escrow amount to refund" }, { status: 400 });

  // Find released payments linked to this contract
  const { data: payments } = await admin
    .from("payments")
    .select("id, amount, platform_fee_amount, status, escrow_released")
    .eq("contract_id", ws.contract_id)
    .eq("status", "released");

  const refundablePayments = (payments ?? []).filter((p: any) => p.status === "released");

  // Credit buyer's wallet: gross amount - ₹49 fee
  const refundPaise = Math.max(0, grossPaise - REFUND_FEE_PAISE);
  const platformRetainedPaise = grossPaise - refundPaise;

  const { data: walletRes } = await admin.rpc("wallet_credit" as any, {
    p_user_id: buyerId,
    p_amount_paise: refundPaise,
    p_kind: "refund",
    p_description: `Admin refund for workspace ${ws.id} · ₹${(REFUND_FEE_PAISE / 100).toFixed(2)} fee retained`,
    p_ref_type: "workspace",
    p_ref_id: ws.id,
    p_metadata: {
      workspace_id: ws.id,
      contract_id: ws.contract_id,
      gross_paise: grossPaise,
      refund_paise: refundPaise,
      platform_retained_paise: platformRetainedPaise,
      fee_paise: REFUND_FEE_PAISE,
      reason,
    },
  } as any);
  if (!walletRes || !(walletRes as any).ok) {
    return NextResponse.json({ ok: false, error: (walletRes as any)?.error ?? "Failed to credit buyer wallet" }, { status: 500 });
  }

  // Mark all released payments as refunded
  for (const p of refundablePayments) {
    await admin.from("payments").update({
      status: "refunded",
      escrow_released: false,
    } as any).eq("id", (p as any).id);
  }

  return NextResponse.json({
    ok: true,
    workspaceId: ws.id,
    contractId: ws.contract_id,
    grossPaise,
    refundPaise,
    platformRetainedPaise,
    feePaise: REFUND_FEE_PAISE,
    paymentsRefunded: refundablePayments.length,
  });
}
