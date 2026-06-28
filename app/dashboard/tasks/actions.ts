"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Hire an applicant directly. Calls the `hire_applicant` RPC which:
 *   1. Inserts a contract row (status='active')
 *   2. Lets the trg_create_workspace_for_contract trigger create the
 *      workspace (status='awaiting_funding')
 *   3. Materializes the delivery_checklist_items from the brief
 *   4. Marks the task as 'in_contract'
 *   5. Marks the application as 'hired'
 *   6. Notifies the employee
 *
 * No negotiation round needed — the "Hire directly" path bypasses
 * the offer/accept flow entirely (that's the Instant Hire flow).
 */
export async function hireApplicantAction(_taskId: string, applicationId: string, buyerMessage?: string) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, reason: "Not signed in" };

  const { data, error } = await sb.rpc("hire_applicant" as any, {
    p_application_id: applicationId,
    p_buyer_message:   buyerMessage ?? null,
  } as any);

  if (error) {
    return { ok: false, reason: error.message };
  }

  // The RPC returns a setof row: (ok boolean, error_text text, contract_id uuid)
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || row.ok !== true) {
    return { ok: false, reason: row?.error_text ?? "Hire failed" };
  }

  revalidatePath(`/dashboard/tasks/${_taskId}/applicants`);
  revalidatePath(`/browse/${_taskId}`);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/contracts");
  revalidatePath("/dashboard/contracts/" + row.contract_id);
  revalidatePath("/dashboard/workspaces");
  return { ok: true, contract_id: row.contract_id };
}

/**
 * Close a task. Only the buyer can close. Atomic via `close_task` RPC.
 */
export async function closeTaskAction(taskId: string, reason?: string) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, reason: "Not signed in" };

  const { data, error } = await sb.rpc("close_task" as any, {
    p_task_id: taskId,
    p_reason: reason ?? null,
  } as any);

  if (error) return { ok: false, reason: error.message };
  if (data !== true) return { ok: false, reason: "Not allowed" };

  revalidatePath(`/browse/${taskId}`);
  revalidatePath("/dashboard/tasks");
  revalidatePath("/browse");
  return { ok: true };
}

/**
 * Extend a task's apply-by deadline. Only the buyer. Atomic via RPC.
 */
export async function extendDeadlineAction(taskId: string, newDeadlineIso: string) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, reason: "Not signed in" };

  const { data, error } = await sb.rpc("extend_task_deadline" as any, {
    p_task_id: taskId,
    p_new_deadline: newDeadlineIso,
  } as any);

  if (error) return { ok: false, reason: error.message };
  if (!data) return { ok: false, reason: "Invalid deadline (must be in the future)" };

  revalidatePath(`/browse/${taskId}`);
  revalidatePath("/dashboard/tasks");
  return { ok: true, newDeadline: data };
}

/**
 * Update application status (shortlist / reject / interview). Only the buyer.
 */
export async function updateApplicationStatusAction(
  applicationId: string,
  status: "shortlisted" | "rejected" | "interviewing" | "pending"
) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, reason: "Not signed in" };

  // Find the task for this application so we can revalidate the right page.
  const { data: app } = await sb
    .from("task_applications")
    .select("task_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (!app) return { ok: false, reason: "Application not found" };

  const { error } = await sb
    .from("task_applications")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", applicationId);
  if (error) return { ok: false, reason: error.message };

  revalidatePath(`/dashboard/tasks/${(app as any).task_id}/applicants`);
  return { ok: true };
}

/**
 * Advance an application to a hiring stage. Atomic via RPC. The stage list
 * (in order) is: pending → shortlist → interview_r1 → interview_r2 → test
 * → offer → hired. The buyer can also move backwards or jump to a later
 * stage; this is a free-form stage field, not a strict pipeline.
 */
export async function advanceStageAction(
  applicationId: string,
  newStage: "pending" | "shortlist" | "interview_r1" | "interview_r2" | "test" | "offer" | "hired" | "rejected" | "withdrawn",
  note?: string
) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, reason: "Not signed in" };

  const { data, error } = await sb.rpc("advance_application_stage" as any, {
    p_application_id: applicationId,
    p_new_stage: newStage,
    p_note: note ?? null,
  } as any);

  if (error) return { ok: false, reason: error.message };
  if (data !== true) return { ok: false, reason: "Not allowed" };

  // Find the task id for revalidation
  const { data: app } = await sb
    .from("task_applications")
    .select("task_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (app) revalidatePath(`/dashboard/tasks/${(app as any).task_id}/applicants`);

  return { ok: true };
}
