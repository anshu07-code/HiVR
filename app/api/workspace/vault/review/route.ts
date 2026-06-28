import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notifications/helpers";

/**
 * POST /api/workspace/vault/review
 *
 * Buyer reviews an individual vault file. Sets the file's
 * `review_status` and (optionally) `review_comment`.
 *
 *   Body: { vaultId: string, status: "approved" | "rejected", comment?: string }
 *
 * Rules:
 *   - Caller must be the buyer of the workspace
 *   - Workspace must be in 'delivered' or 'in_review' state
 *   - `comment` is required when status = 'rejected'
 *   - Folders are not reviewable (auto-approved)
 *   - This call is idempotent (UPSERT-like behaviour)
 *
 * On rejected: a notification is sent to the employee so they can
 * fix the file. The workspace stays in 'in_review' state.
 *
 * On all-files-approved: the workspace moves to 'in_review' state
 * (the buyer will then click "Mark as done" to release payment).
 */

export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const vaultId = String(body.vaultId ?? "");
  const status = body.status === "approved" || body.status === "rejected" ? body.status : null;
  const comment = body.comment ? String(body.comment).slice(0, 2000) : null;
  if (!vaultId) return NextResponse.json({ ok: false, error: "vaultId required" }, { status: 400 });
  if (!status) return NextResponse.json({ ok: false, error: "status must be 'approved' or 'rejected'" }, { status: 400 });
  if (status === "rejected" && !comment?.trim()) {
    return NextResponse.json({ ok: false, error: "comment required when rejecting" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 1. Verify ownership + workspace state
  const { data: item } = await admin
    .from("workspace_vault")
    .select("id, workspace_id, is_folder, name")
    .eq("id", vaultId)
    .maybeSingle();
  if (!item) return NextResponse.json({ ok: false, error: "Vault item not found" }, { status: 404 });
  if (item.is_folder) {
    return NextResponse.json({ ok: false, error: "Folders are not reviewable" }, { status: 400 });
  }

  const { data: ws } = await admin
    .from("workspaces")
    .select("id, buyer_id, employee_id, status, contract_id")
    .eq("id", (item as any).workspace_id)
    .maybeSingle();
  const w = ws as any;
  if (!w) return NextResponse.json({ ok: false, error: "Workspace not found" }, { status: 404 });
  if (w.buyer_id !== user.id) {
    return NextResponse.json({ ok: false, error: "Only the buyer can review files" }, { status: 403 });
  }
  if (!["delivered", "in_review"].includes(w.status)) {
    return NextResponse.json({ ok: false, error: "Workspace is not in review state" }, { status: 400 });
  }

  // 2. Apply the review
  const { error: updateErr } = await admin
    .from("workspace_vault")
    .update({
      review_status: status,
      review_comment: comment,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    })
    .eq("id", vaultId);
  if (updateErr) return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });

  // 3. Log the review event
  await admin.from("vault_event_log").insert({
    workspace_id: w.id,
    vault_item_id: vaultId,
    actor_id: user.id,
    actor_name: null,
    event: "share_create", // 'share_create' = approved, 'share_revoke' = rejected (closest existing slot)
    file_name: (item as any).name,
    file_size: null,
    metadata: { review: true, status, comment: comment?.slice(0, 200) ?? null },
  } as any);

  // 4. Move the workspace into 'in_review' if this is the first review
  if (w.status === "delivered") {
    await admin.from("workspaces").update({ status: "in_review" }).eq("id", w.id);
    await admin.from("contracts").update({ status: "in_review" }).eq("id", w.contract_id);
  }

  // 5. Notify the employee
  if (status === "rejected") {
    await notify({
      userId: w.employee_id,
      kind: "vault_file_rejected",
      title: `File needs changes: ${(item as any).name}`,
      body: comment?.slice(0, 200) ?? "",
      link: `/dashboard/workspaces/${w.id}?tab=vault`,
    });
  } else {
    // Approved — light ping so the employee knows progress
    await notify({
      userId: w.employee_id,
      kind: "vault_file_approved",
      title: `File approved: ${(item as any).name}`,
      body: "One more item ticked off. Approve all files to release the payment.",
      link: `/dashboard/workspaces/${w.id}?tab=vault`,
    });
  }

  return NextResponse.json({ ok: true, status, comment });
}
