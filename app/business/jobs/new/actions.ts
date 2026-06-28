"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * Pricing model constraint: we never allow "hourly" for Tier B.
 * (Tier A and B have separate categories; we filter at the form level.)
 */
const PricingModelSchema = z.enum(["daily_rate", "fixed_milestone", "retainer", "monthly"]);

const JobSchema = z.object({
  business_id: z.string().uuid(),
  title: z.string().min(5).max(120),
  category_id: z.string().uuid(),
  subcategory_id: z.string().uuid().optional().or(z.literal("")),
  description: z.string().min(20).max(8000),
  employment_type: z.enum(["full_time", "part_time", "contract", "internship", "task"]),
  pricing_model: PricingModelSchema,
  wage_min_paise: z.coerce.number().int().min(10000).max(1_000_000_00),
  wage_max_paise: z.coerce.number().int().min(10000).max(1_000_000_00),
  positions: z.coerce.number().int().min(1).max(50),
  experience_required_years: z.coerce.number().int().min(0).max(40),
  skills_required: z.array(z.string().min(1).max(40)).max(20),
  location_city: z.string().min(2).max(80).optional().or(z.literal("")),
  location_state: z.string().min(2).max(80).optional().or(z.literal("")),
  location_country: z.string().default("India"),
  remote_ok: z.coerce.boolean().default(false),
  start_date: z.string().optional().or(z.literal("")),
  duration_label: z.string().max(80).optional().or(z.literal("")),
  application_deadline: z.string().optional().or(z.literal("")),
}).refine(d => d.wage_min_paise <= d.wage_max_paise, {
  message: "Wage min cannot exceed wage max",
  path: ["wage_min_paise"],
});

export async function createBusinessJobAction(formData: FormData) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  // Skills come as a multi-value field
  const skills = (formData.getAll("skills_required") as string[]).map(s => s.trim()).filter(Boolean);
  const payload = {
    business_id: formData.get("business_id"),
    title: formData.get("title"),
    category_id: formData.get("category_id"),
    subcategory_id: formData.get("subcategory_id") || undefined,
    description: formData.get("description"),
    employment_type: formData.get("employment_type"),
    pricing_model: formData.get("pricing_model"),
    wage_min_paise: formData.get("wage_min_paise"),
    wage_max_paise: formData.get("wage_max_paise"),
    positions: formData.get("positions"),
    experience_required_years: formData.get("experience_required_years") ?? 0,
    skills_required: skills,
    location_city: formData.get("location_city") || undefined,
    location_state: formData.get("location_state") || undefined,
    location_country: formData.get("location_country") || "India",
    remote_ok: formData.get("remote_ok") === "on",
    start_date: formData.get("start_date") || undefined,
    duration_label: formData.get("duration_label") || undefined,
    application_deadline: formData.get("application_deadline") || undefined,
  };

  const parsed = JobSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // Verify plan limits + business ownership
  const { data: sub } = await sb.from("business_subscriptions")
    .select("plan_key, status, active_jobs_count").eq("business_id", parsed.data.business_id)
    .in("status", ["active", "trialing"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const planKey = (sub as any)?.plan_key ?? "business_free";
  const activeJobs = (sub as any)?.active_jobs_count ?? 0;
  const planLimits: Record<string, number> = { business_free: 1, business_pro: 10, business_enterprise: -1 };
  const limit = planLimits[planKey];
  if (limit > 0 && activeJobs >= limit) {
    return { ok: false, error: `You're on the ${planKey.replace("business_", "")} plan and have reached the limit of ${limit} active job${limit === 1 ? "" : "s"}.` };
  }

  // Verify the category is Tier A or B (we never allow business jobs in Coming Soon)
  const { data: cat } = await sb.from("skill_categories").select("tier, is_active, name").eq("id", parsed.data.category_id).maybeSingle();
  if (!cat || !cat.is_active) return { ok: false, error: "Category not available" };
  if (cat.tier === "B" && (parsed.data.pricing_model as any) === "hourly") {
    return { ok: false, error: "Tier B categories do not allow hourly pricing" };
  }

  // Create the job
  const insert = {
    business_id: parsed.data.business_id,
    title: parsed.data.title,
    category_id: parsed.data.category_id,
    subcategory_id: parsed.data.subcategory_id || null,
    description: parsed.data.description,
    employment_type: parsed.data.employment_type,
    pricing_model: parsed.data.pricing_model,
    wage_min_paise: parsed.data.wage_min_paise,
    wage_max_paise: parsed.data.wage_max_paise,
    positions: parsed.data.positions,
    positions_filled: 0,
    experience_required_years: parsed.data.experience_required_years,
    skills_required: parsed.data.skills_required,
    location_city: parsed.data.location_city || null,
    location_state: parsed.data.location_state || null,
    location_country: parsed.data.location_country,
    remote_ok: parsed.data.remote_ok,
    start_date: parsed.data.start_date || null,
    duration_label: parsed.data.duration_label || null,
    application_deadline: parsed.data.application_deadline || null,
    status: "open" as const,
    created_by: user.id,
  };

  const { data: created, error } = await sb.from("business_jobs").insert(insert as any).select("id").single();
  if (error || !created) return { ok: false, error: error?.message ?? "Failed to create job" };

  // Bump the subscription counter
  if (sub) {
    await sb.from("business_subscriptions").update({ active_jobs_count: activeJobs + 1 } as any).eq("business_id", parsed.data.business_id);
  }

  revalidatePath("/business/dashboard");
  revalidatePath("/business/jobs");
  redirect(`/business/jobs/${(created as any).id}?posted=1`);
}
