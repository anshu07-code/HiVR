"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getEmployeeApplyContext } from "@/lib/auth-context";

export type ApplyState = { ok?: true; error?: string };

/**
 * Apply to a task. The user must be signed in and have the "employee"
 * role in their `users.roles` array. Idempotent: re-applying updates the
 * cover note / bid instead of creating a duplicate.
 *
 * Server-side gates (defence in depth):
 *   * Role check (employee / admin)
 *   * Profile completeness >= 60% (the employee must have built out their
 *     profile before applying — see migration 0119)
 *   * Application pause flag (2+ disputes lost → auto-paused)
 *   * Per-hour application rate limit
 *   * Skill match check (informational: the client surfaces missing
 *     skills as a warning, but apply still goes through)
 */
export async function applyToTaskAction(
  taskId: string,
  coverNote: string,
  bidPaise: number | null,
): Promise<ApplyState> {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: "Please sign in to apply." };

  const { data: profile } = await sb
    .from("users")
    .select("roles, is_suspended")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.is_suspended) return { error: "Your account is suspended. Contact support." };
  const roles: string[] = (profile?.roles as string[]) ?? [];
  if (!roles.includes("employee") && !roles.includes("admin")) {
    return { error: "Switch to employee mode first to apply." };
  }

  if (!coverNote.trim() || coverNote.trim().length < 10) {
    return { error: "Add a short cover note (10+ characters) so the buyer knows why you." };
  }

  // Profile-completeness gate — must be at least 60% to apply
  const { data: completeness } = await sb.rpc("compute_profile_completeness" as any, { p_user_id: user.id } as any);
  const score = Number(completeness ?? 0);
  if (score < 60) {
    return {
      error: `Your profile is only ${score}% complete. Build your profile to at least 60% before applying — buyers shortlist employees with full profiles.`,
    };
  }

  // Task must be open and not past deadline
  const { data: taskStatus } = await sb
    .from("task_posts")
    .select("status, deadline")
    .eq("id", taskId)
    .single();
  if (taskStatus?.status !== "open") {
    return { error: "This task is not accepting applications right now." };
  }
  if (taskStatus?.deadline && new Date(taskStatus.deadline) <= new Date()) {
    return { error: "This task's deadline has passed and is no longer accepting applications." };
  }

  // Pause / rate-limit check.
  const ctx = await getEmployeeApplyContext({ userId: user.id, taskId });
  if (!ctx.canApply) return { error: ctx.blockedReason ?? "Not allowed to apply right now." };

  const { error } = await sb
    .from("task_applications")
    .upsert(
      {
        task_id: taskId,
        employee_id: user.id,
        cover_note: coverNote.trim(),
        bid_paise: bidPaise,
        status: "pending",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "task_id,employee_id" },
    );
  if (error) return { error: error.message };
  revalidatePath(`/browse/${taskId}`);
  revalidatePath("/dashboard/applications");
  return { ok: true };
}

export async function withdrawApplicationAction(taskId: string): Promise<ApplyState> {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: "Please sign in." };
  const { error } = await sb
    .from("task_applications")
    .update({ status: "withdrawn", updated_at: new Date().toISOString() })
    .eq("task_id", taskId)
    .eq("employee_id", user.id);
  if (error) return { error: error.message };
  revalidatePath(`/browse/${taskId}`);
  return { ok: true };
}

export async function likeTaskAction(taskId: string): Promise<ApplyState> {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: "Please sign in to save tasks." };
  // Upsert: if already liked, this is a no-op; if not, it inserts.
  const { error } = await sb
    .from("task_likes")
    .upsert(
      { task_id: taskId, user_id: user.id },
      { onConflict: "task_id,user_id", ignoreDuplicates: true },
    );
  if (error) return { error: error.message };
  revalidatePath(`/browse/${taskId}`);
  revalidatePath("/dashboard/saved");
  return { ok: true };
}

export async function unlikeTaskAction(taskId: string): Promise<ApplyState> {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: "Please sign in." };
  const { error } = await sb
    .from("task_likes")
    .delete()
    .eq("task_id", taskId)
    .eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath(`/browse/${taskId}`);
  revalidatePath("/dashboard/saved");
  return { ok: true };
}

export async function postQueryAction(
  taskId: string,
  body: string,
  parentId: string | null,
): Promise<ApplyState> {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: "Please sign in to ask or answer." };
  if (!body.trim() || body.trim().length < 3) {
    return { error: "Write a question or answer (3+ characters)." };
  }

  // is_answer = true when the poster is the task's buyer.
  const { data: task } = await sb
    .from("task_posts")
    .select("buyer_id")
    .eq("id", taskId)
    .single();
  const isAnswer = task?.buyer_id === user.id;

  const { error } = await sb.from("task_queries").insert({
    task_id: taskId,
    parent_id: parentId,
    asker_id: user.id,
    body: body.trim(),
    is_answer: isAnswer,
  });
  if (error) return { error: error.message };
  revalidatePath(`/browse/${taskId}`);
  return { ok: true };
}
