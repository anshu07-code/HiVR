"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canBuyerPostTask } from "@/lib/auth-context";
import { computeFraudSignals, recordFraudSignals } from "@/lib/fraud-signals";
import { z } from "zod";

/**
 * Server action called by the post-task form. Wraps the supabase insert
 * with the KYC + rate-limit gate and the fraud-signals recorder so the
 * client never sees those checks.
 *
 * Returns either { ok: true, id } or { ok: false, reason }. When the
 * form is bound to this as a `formAction`, the only way to surface an
 * error is via `redirect()` with a search param. We use that pattern
 * here so the form can stay a plain `<form action={createTaskAction}>`.
 */

const Schema = z.object({
  category_id: z.string().uuid(),
  title: z.string().min(8).max(120),
  description: z.string().min(40).max(8000),
  pricing_model: z.string().min(2).max(40),
  budget_min: z.coerce.number().int().positive(),
  budget_max: z.coerce.number().int().positive(),
  deadline: z.string().min(1, "Deadline is required"),
  estimated_hours: z.coerce.number().int().positive().max(720).optional(),
  skills_required: z.array(z.string().min(1).max(60)).max(20).default([]),
  scheduled_publish_at: z.string().optional(),
  show_in_upcoming: z.boolean().default(true),
  brief: z.string().min(2),
  openings: z.coerce.number().int().min(1).max(50).default(1),
}).refine(d => d.budget_max >= d.budget_min, { message: "Max budget must be ≥ min" })
  .refine(d => new Date(d.deadline) > new Date(), { message: "Deadline must be in the future", path: ["deadline"] })
  .refine(d => !d.scheduled_publish_at || new Date(d.scheduled_publish_at) > new Date(), { message: "Schedule time must be in the future", path: ["scheduled_publish_at"] });

export async function createTaskAction(formData: FormData): Promise<void> {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/dashboard/post");

  // Build payload from FormData
  const raw = {
    category_id: String(formData.get("category_id") ?? ""),
    title: String(formData.get("title") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    pricing_model: String(formData.get("pricing_model") ?? ""),
    budget_min: formData.get("budget_min"),
    budget_max: formData.get("budget_max"),
    deadline: formData.get("deadline") ? String(formData.get("deadline")) : undefined,
    estimated_hours: formData.get("estimated_hours") ? String(formData.get("estimated_hours")) : undefined,
    skills_required: String(formData.get("skills_required") ?? "")
      .split(",").map(s => s.trim()).filter(Boolean),
    scheduled_publish_at: formData.get("scheduled_publish_at") ? String(formData.get("scheduled_publish_at")) : undefined,
    show_in_upcoming: String(formData.get("show_in_upcoming") ?? "true") !== "false",
    brief: String(formData.get("brief") ?? ""),
    openings: formData.get("openings") ? String(formData.get("openings")) : "1",
  };
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    const reason = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`/dashboard/post?error=${encodeURIComponent(reason)}`);
  }

  // Parse and validate the brief JSON server-side
  let briefJson: any = {};
  try { briefJson = JSON.parse(parsed.data.brief); } catch {
    redirect(`/dashboard/post?error=${encodeURIComponent("Brief payload is not valid JSON")}`);
  }
  const items = Array.isArray(briefJson?.checklist_items) ? briefJson.checklist_items : [];
  const cleaned = items
    .map((it: any, idx: number) => ({ key: String(it?.key ?? `item_${idx + 1}`), text: String(it?.text ?? "").trim() }))
    .filter((it: { text: string }) => it.text.length > 0);
  if (cleaned.length < 2) {
    redirect(`/dashboard/post?error=${encodeURIComponent("Brief must include at least 2 checklist items (deliverables)")}`);
  }
  const briefPayload = {
    checklist_items: cleaned,
    notes: typeof briefJson?.notes === "string" ? briefJson.notes : "",
    sample_url: typeof briefJson?.sample_url === "string" ? briefJson.sample_url : undefined,
  };

  // Tier lookup
  const { data: cat } = await sb.from("skill_categories").select("tier").eq("id", parsed.data.category_id).maybeSingle();
  if (!cat) redirect(`/dashboard/post?error=${encodeURIComponent("Category not found")}`);
  const tier = ((cat as any).tier ?? "micro_task") as "micro_task" | "role_engagement";

  // KYC + rate-limit gate
  const budgetRupees = parsed.data.budget_max;
  const guard = await canBuyerPostTask({ userId: user.id, budgetRupees, tier });
  if (!guard.allowed) {
    redirect(`/dashboard/post?error=${encodeURIComponent(guard.reason ?? "Not allowed to post")}`);
  }

  // Anti-fraud signals (best-effort)
  try {
    const signals = await computeFraudSignals(sb, user.id, { newTaskBudgetRupees: budgetRupees });
    const { autoSuspended } = await recordFraudSignals(sb, user.id, signals);
    if (autoSuspended) {
      redirect(`/dashboard/post?error=${encodeURIComponent("Account flagged for review. Contact support.")}`);
    }
  } catch { /* non-fatal */ }

  // Insert
  const scheduled = parsed.data.scheduled_publish_at && new Date(parsed.data.scheduled_publish_at) > new Date();
  const payload = {
    buyer_id: user.id,
    category_id: parsed.data.category_id,
    title: parsed.data.title,
    description: parsed.data.description,
    pricing_model: parsed.data.pricing_model,
    budget_min: Math.round(parsed.data.budget_min * 100),
    budget_max: Math.round(parsed.data.budget_max * 100),
    deadline: parsed.data.deadline,
    estimated_hours: parsed.data.estimated_hours ?? null,
    skills_required: parsed.data.skills_required ?? [],
    scheduled_publish_at: scheduled ? parsed.data.scheduled_publish_at : null,
    show_in_upcoming: parsed.data.show_in_upcoming ?? true,
    brief: briefPayload,
    scope_flag: "standard",
    openings: parsed.data.openings ?? 1,
    status: scheduled ? "upcoming" : "open",
    published_at: scheduled ? null : new Date().toISOString(),
  };
  const { data, error } = await sb.from("task_posts").insert(payload).select("id").maybeSingle();
  if (error) {
    redirect(`/dashboard/post?error=${encodeURIComponent(error.message)}`);
  }
  // Grant buyer role if not already held — unlocking the mode switcher.
  const { data: me } = await sb.from("users").select("roles").eq("id", user.id).maybeSingle();
  const currentRoles: string[] = (me as any)?.roles ?? [];
  if (!currentRoles.includes("buyer")) {
    await sb.from("users").update({ roles: [...currentRoles, "buyer"] }).eq("id", user.id);
  }
  revalidatePath("/browse");
  revalidatePath("/dashboard");
  redirect(`/browse?just_posted=1&id=${data?.id ?? ""}`);
}
