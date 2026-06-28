"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { anonymousDisplayId } from "@/lib/crypto";

export async function registerAnonymousAction(formData: FormData) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const justification = formData.get("justification")?.toString().trim().slice(0, 500) ?? "";
  const tier = formData.get("tier")?.toString() === "B" ? "B" : "A";

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("anonymous_requests")
    .select("id, status")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false } as any)
    .limit(1) as any;

  if (existing && existing.length > 0 && existing[0].status === "pending") {
    throw new Error("You already have a pending request");
  }

  const { error } = await admin
    .from("anonymous_requests")
    .insert({
      user_id: user.id,
      requested_tier: tier,
      justification: justification || null,
      status: "pending",
    } as any);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/anonymous");
}

export async function updateWorkExperienceAction(formData: FormData) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const id = formData.get("id")?.toString();
  const company = formData.get("company")?.toString().trim();
  const role = formData.get("role")?.toString().trim();
  const description = formData.get("description")?.toString().trim().slice(0, 2000) ?? null;
  const startDate = formData.get("start_date")?.toString() || null;
  const endDate = formData.get("end_date")?.toString() || null;
  const isCurrent = formData.get("is_current") === "true";

  if (!company || !role) throw new Error("Company and role are required");

  const admin = createAdminClient();

  if (id) {
    const { error } = await admin
      .from("anonymous_work_experience")
      .update({
        company,
        role,
        description,
        start_date: startDate,
        end_date: isCurrent ? null : endDate,
        is_current: isCurrent,
        verification_status: "pending",
      } as any)
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) throw new Error(error.message);
  } else {
    const { error } = await admin
      .from("anonymous_work_experience")
      .insert({
        user_id: user.id,
        company,
        role,
        description,
        start_date: startDate,
        end_date: isCurrent ? null : endDate,
        is_current: isCurrent,
      } as any);

    if (error) throw new Error(error.message);
  }

  revalidatePath("/dashboard/anonymous");
}

export async function deleteWorkExperienceAction(id: string) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const admin = createAdminClient();
  const { error } = await admin
    .from("anonymous_work_experience")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/anonymous");
}

export async function addSocialLinkAction(formData: FormData) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const platform = formData.get("platform")?.toString().trim();
  const url = formData.get("url")?.toString().trim();

  if (!platform || !url) throw new Error("Platform and URL are required");

  const admin = createAdminClient();
  const { error } = await admin
    .from("anonymous_social_links")
    .upsert({
      user_id: user.id,
      platform,
      url,
      verification_status: "pending",
    } as any);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/anonymous");
}

export async function deleteSocialLinkAction(id: string) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const admin = createAdminClient();
  const { error } = await admin
    .from("anonymous_social_links")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/anonymous");
}

export async function setPricingAction(formData: FormData) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const admin = createAdminClient();

  const { data: ap } = await admin
    .from("anonymous_profiles")
    .select("user_id, tier")
    .eq("user_id", user.id)
    .maybeSingle() as any;

  if (!ap) throw new Error("Anonymous profile not found");

  const updates: Record<string, number> = {};
  const tier = ap.tier as string;

  const hourly = formData.get("hourly_rate")?.toString();
  if (hourly) updates.hourly_rate_paise = Math.round(Number(hourly) * 100);

  if (tier === "A") {
    const task = formData.get("task_rate")?.toString();
    if (task) updates.task_rate_paise = Math.round(Number(task) * 100);
  } else {
    const daily = formData.get("daily_rate")?.toString();
    const weekly = formData.get("weekly_rate")?.toString();
    const monthly = formData.get("monthly_rate")?.toString();
    if (daily) updates.daily_rate_paise = Math.round(Number(daily) * 100);
    if (weekly) updates.weekly_rate_paise = Math.round(Number(weekly) * 100);
    if (monthly) updates.monthly_rate_paise = Math.round(Number(monthly) * 100);
  }

  updates.updated_at = Date.now();

  const { error } = await admin
    .from("anonymous_profiles")
    .update(updates as any)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/anonymous");
}
