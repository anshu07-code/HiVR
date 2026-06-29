import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/workspace/approve-deliverable
 *
 * Body: { workspaceId: string, checklistItemId: string, approved: boolean }
 * Only the buyer can approve/reject a deliverable.
 *
 * When a deliverable is approved:
 *   - Its status is set to "done"
 *   - The next deliverable becomes available for the employee to upload
 *
 * When rejected:
 *   - Its status is set to "not_done" — employee must redo
 */
export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const workspaceId: string = body.workspaceId ?? "";
  const checklistItemId: string = body.checklistItemId ?? "";
  const approved: boolean = body.approved === true;

  if (!workspaceId || !checklistItemId)
    return NextResponse.json({ error: "workspaceId and checklistItemId are required" }, { status: 400 });

  // Verify buyer
  const { data: ws } = await sb
    .from("workspaces")
    .select("id, buyer_id, employee_id, status, contract_id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (!ws) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  if (ws.buyer_id !== user.id)
    return NextResponse.json({ error: "Only the buyer can approve deliverables" }, { status: 403 });
  if (ws.status !== "delivered" && ws.status !== "in_review")
    return NextResponse.json({ error: "Workspace is not in review" }, { status: 400 });

  // Verify checklist item belongs to this workspace's contract
  const { data: item } = await sb
    .from("delivery_checklist_items")
    .select("id, status")
    .eq("id", checklistItemId)
    .eq("contract_id", ws.contract_id)
    .maybeSingle();
  if (!item) return NextResponse.json({ error: "Checklist item not found" }, { status: 404 });

  const newStatus = approved ? "done" : "not_done";
  const { error: updateErr } = await sb
    .from("delivery_checklist_items")
    .update({ status: newStatus })
    .eq("id", checklistItemId);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Log event
  await sb.from("workspace_events").insert({
    workspace_id: workspaceId,
    event_type: approved ? "deliverable_approved" : "deliverable_rejected",
    triggered_by: user.id,
    metadata: { checklist_item_id: checklistItemId },
  });

  // If approved and all items are now done, auto-transition workspace
  if (approved) {
    const { data: allItems } = await sb
      .from("delivery_checklist_items")
      .select("status")
      .eq("contract_id", ws.contract_id);
    const allDone = (allItems ?? []).every((c: any) => c.status === "done" || c.status === "resolved");
    if (allDone) {
      await sb.from("workspaces").update({ status: "completed" }).eq("id", workspaceId);
    } else {
      await sb.from("workspaces").update({ status: "delivered" }).eq("id", workspaceId);
    }
  }

  return NextResponse.json({ ok: true, status: newStatus });
}
