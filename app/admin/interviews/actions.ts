"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notifications";

/**
 * Admin: create a Tier B interview slot.
 * Uses SECURITY DEFINER RPC so it works regardless of which Supabase
 * service_role JWT mapping the project has.
 */
export async function createInterviewSlot(formData: FormData) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: "Not signed in" };
  const { data: adminRow } = await sb.from("admin_users").select("admin_role").eq("user_id", user.id).maybeSingle();
  if (!adminRow) return { error: "Admin only" };

  const categoryId = String(formData.get("category_id") ?? "");
  const scheduledAt = String(formData.get("scheduled_at") ?? "");
  if (!categoryId || !scheduledAt) return { error: "category_id and scheduled_at are required" };

  const { error } = await sb.rpc("admin_create_interview_slot", {
    p_category_id: categoryId,
    p_scheduled_at: scheduledAt,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/interviews");
  revalidatePath("/dashboard/interviews");
  return { ok: true };
}

/** Admin: delete an open slot (no employee booked yet). */
export async function deleteInterviewSlot(slotId: string) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: "Not signed in" };
  const { data: adminRow } = await sb.from("admin_users").select("admin_role").eq("user_id", user.id).maybeSingle();
  if (!adminRow) return { error: "Admin only" };

  const { error } = await sb.rpc("admin_delete_interview_slot", { p_slot_id: slotId });
  if (error) return { error: error.message };
  revalidatePath("/admin/interviews");
  revalidatePath("/dashboard/interviews");
  return { ok: true };
}

/** Employee: book an open slot. */
export async function bookInterviewSlot(slotId: string) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: "Not signed in" };

  // First, verify the slot is still open.
  const { data: slot, error: sErr } = await sb
    .from("tier_b_interviews")
    .select("id, employee_id, status, category:skill_categories(name)")
    .eq("id", slotId)
    .single();
  if (sErr || !slot) return { error: "Slot not found" };
  if (slot.employee_id) return { error: "Slot already booked" };
  if (slot.status !== "scheduled") return { error: "Slot not available" };

  const { error } = await sb.from("tier_b_interviews")
    .update({ employee_id: user.id })
    .eq("id", slotId)
    .is("employee_id", null);
  if (error) return { error: error.message };

  // Notify the user themselves (confirmation) and any admin who might be tracking.
  await notify({
    userId: user.id,
    type: "interview_booked",
    title: "Interview booked",
    body: `Your Tier B interview for ${(slot as any).category?.name ?? "the category"} is confirmed. The admin will reach out with joining details.`,
    link: "/dashboard/interviews",
  });

  revalidatePath("/dashboard/interviews");
  revalidatePath("/admin/interviews");
  return { ok: true };
}

/** Employee: cancel their booking. */
export async function cancelInterviewBooking(slotId: string) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { error } = await sb.from("tier_b_interviews")
    .update({ employee_id: null })
    .eq("id", slotId)
    .eq("employee_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/interviews");
  revalidatePath("/admin/interviews");
  return { ok: true };
}

/** Admin: mark interview completed, fill scorecard + pass/fail. */
export async function recordInterviewResult(formData: FormData) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: "Not signed in" };
  const { data: adminRow } = await sb.from("admin_users").select("admin_role").eq("user_id", user.id).maybeSingle();
  if (!adminRow) return { error: "Admin only" };

  const slotId = String(formData.get("slot_id") ?? "");
  const passed = formData.get("passed") === "true";
  const feedback = String(formData.get("feedback") ?? "");
  const scoresRaw = String(formData.get("rubric_scores") ?? "{}");
  let scores: any = {};
  try { scores = JSON.parse(scoresRaw); } catch { scores = {}; }

  // Get the slot details before updating so we can notify the employee.
  const { data: slotInfo } = await sb
    .from("tier_b_interviews")
    .select("employee_id, category:skill_categories(name)")
    .eq("id", slotId)
    .single();

  const { error } = await sb.rpc("admin_record_interview_result", {
    p_slot_id: slotId,
    p_passed: passed,
    p_feedback: feedback,
    p_rubric_scores: scores,
  });
  if (error) return { error: error.message };

  // Notify the employee.
  if (slotInfo?.employee_id) {
    await notify({
      userId: slotInfo.employee_id,
      type: passed ? "interview_passed" : "interview_failed",
      title: passed ? "Tier B interview: passed" : "Tier B interview: did not pass",
      body: passed
        ? `You're now Tier B Verified for ${(slotInfo as any).category?.name}. You can now apply to Tier B contracts.`
        : `Result for ${(slotInfo as any).category?.name}: did not pass this time. Feedback from your interviewer is on your interview page.`,
      link: "/dashboard/interviews",
    });
  }

  revalidatePath("/admin/interviews");
  revalidatePath("/dashboard/interviews");
  return { ok: true };
}
