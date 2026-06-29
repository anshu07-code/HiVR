import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/workspace/cancel
 *
 * Body: { workspaceId: string }
 * Actor must be a party (buyer or employee) of the workspace.
 *
 * Works only for "cancellable" contracts. For "non-cancellable" contracts
 * the full amount is locked — no cancellation is permitted.
 *
 * Cancellation math (cancellable only):
 *   deliverable_price = escrow_amount / N(brief checklist items)
 *   earned = deliverable_price * approved_count
 *   remaining = escrow_amount - earned
 *   penalty = round(remaining * 0.20)
 *   refund_to_buyer = remaining - penalty
 *
 *   Buyer cancels: buyer gets refund_to_buyer. Platform keeps penalty.
 *                  Employee keeps earned (minus 5% platform fee on approved).
 *   Employee cancels: 20% penalty on remaining. Buyer gets refund_to_buyer.
 *                     Employee keeps earned (minus platform fee).
 */
export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const workspaceId: string = body.workspaceId ?? "";
  if (!workspaceId) return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });

  // Fetch workspace + contract + checklist
  const { data: ws } = await sb
    .from("workspaces")
    .select("id, contract_id, buyer_id, employee_id, status, escrow_amount_paise, escrow_funded")
    .eq("id", workspaceId)
    .maybeSingle();
  if (!ws) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  if (!ws.escrow_funded || ws.escrow_amount_paise <= 0)
    return NextResponse.json({ error: "No escrow funded for this workspace" }, { status: 400 });

  const isBuyer = ws.buyer_id === user.id;
  const isEmployee = ws.employee_id === user.id;
  if (!isBuyer && !isEmployee)
    return NextResponse.json({ error: "Not a party to this contract" }, { status: 403 });

  // Get contract cancellation_policy
  const { data: contract } = await sb
    .from("contracts")
    .select("id, agreed_price, cancellation_policy, status")
    .eq("id", ws.contract_id)
    .maybeSingle();
  if (!contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });

  if (contract.cancellation_policy === "non-cancellable") {
    return NextResponse.json({ error: "Non-cancellable contract — no refunds or cancellations permitted" }, { status: 400 });
  }

  if (ws.status !== "funded" && ws.status !== "delivered" && ws.status !== "in_review") {
    return NextResponse.json({ error: `Cannot cancel in status "${ws.status}"` }, { status: 400 });
  }

  // Fetch checklist = deliverables (from delivery_checklist_items, keyed by contract_id)
  const { data: checklistItems } = await sb
    .from("delivery_checklist_items")
    .select("id, status")
    .eq("contract_id", ws.contract_id);
  const totalDeliverables = (checklistItems ?? []).length;
  if (totalDeliverables === 0)
    return NextResponse.json({ error: "No deliverables found in the brief" }, { status: 400 });

  const approvedCount = (checklistItems ?? []).filter(
    (c: any) => c.status === "done" || c.status === "resolved"
  ).length;

  const escrowPaise = Number(ws.escrow_amount_paise);
  const deliverablePrice = Math.floor(escrowPaise / totalDeliverables);
  const earnedPaise = deliverablePrice * approvedCount;
  const remainingPaise = escrowPaise - earnedPaise;
  const penaltyPaise = Math.floor(remainingPaise * 0.20);
  const refundToBuyer = remainingPaise - penaltyPaise;

  // Compute what the employee actually keeps (deduct 5% platform fee on approved deliverables)
  const employeeKeeps = Math.floor(earnedPaise * 0.95); // 5% platform fee on earned
  const platformOnEarned = earnedPaise - employeeKeeps;
  const totalPlatformKeeps = platformOnEarned + penaltyPaise;

  const admin = createAdminClient();

  // Credit buyer wallet with earned portion + refund
  // The buyer already paid the full escrow. We refund: earned portion (employee keeps)
  // is NOT refunded (it goes to employee). Remaining = what's left after earned.
  // BUT the escrow money hasn't moved yet - it's in the platform wallet.
  // So we just credit the buyer's wallet with the refund.
  if (refundToBuyer > 0) {
    const { error: creditErr } = await admin.rpc("wallet_credit", {
      p_user_id: ws.buyer_id,
      p_amount_paise: refundToBuyer,
      p_description: `Refund for cancelled workspace (${workspaceId.slice(0, 8)}) — ${approvedCount}/${totalDeliverables} deliverables approved`,
      p_kind: "escrow_refund",
    } as any);
    if (creditErr) return NextResponse.json({ error: creditErr.message }, { status: 500 });
  }

  // Credit employee wallet with earned (minus 5% platform fee)
  if (employeeKeeps > 0) {
    const { error: empErr } = await admin.rpc("wallet_credit", {
      p_user_id: ws.employee_id,
      p_amount_paise: employeeKeeps,
      p_description: `Payment for ${approvedCount}/${totalDeliverables} approved deliverables (workspace ${workspaceId.slice(0, 8)})`,
      p_kind: "escrow_release",
    } as any);
    if (empErr) return NextResponse.json({ error: empErr.message }, { status: 500 });
  }

  // Update workspace status
  await admin.from("workspaces").update({
    status: "cancelled",
    completed_at: new Date().toISOString(),
  }).eq("id", workspaceId);

  // Record cancellation in workspace_events
  await admin.from("workspace_events").insert({
    workspace_id: workspaceId,
    event_type: "cancelled",
    triggered_by: user.id,
    metadata: {
      cancelled_by: isBuyer ? "buyer" : "employee",
      approved_deliverables: approvedCount,
      total_deliverables: totalDeliverables,
      earned_paise: earnedPaise,
      refund_paise: refundToBuyer,
      penalty_paise: penaltyPaise,
      platform_retained_paise: totalPlatformKeeps,
    },
  });

  return NextResponse.json({
    ok: true,
    approved_count: approvedCount,
    total_deliverables: totalDeliverables,
    earned_paise: earnedPaise,
    refund_paise: refundToBuyer,
    penalty_paise: penaltyPaise,
    platform_retained_paise: totalPlatformKeeps,
  });
}
