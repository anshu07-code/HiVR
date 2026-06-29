"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function requireUser() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("Not signed in");
  return { sb, user };
}

/* ========================================================================
 * Profile basics (name, bio, headline, location, rate, availability)
 * ====================================================================== */

export async function updateProfileBasicsAction(input: {
  full_name?: string;
  headline?: string;
  bio?: string;
  location?: string;
  hourly_rate_paise?: number;
  availability_hours?: number;
  timezone?: string;
  experience_type?: string;
}) {
  const { sb, user } = await requireUser();
  // Split between users (full_name) and employee_profiles
  if (input.full_name !== undefined) {
    await sb.from("users").update({ full_name: input.full_name }).eq("id", user.id);
  }
  const epUpdate: Record<string, any> = {};
  for (const k of ["headline","bio","location","hourly_rate_paise","availability_hours","timezone","experience_type"] as const) {
    if (input[k] !== undefined) epUpdate[k] = input[k];
  }
  if (Object.keys(epUpdate).length > 0) {
    const { error } = await sb.from("employee_profiles").update(epUpdate).eq("user_id", user.id);
    if (error) return { ok: false, reason: error.message };
  }
  revalidatePath("/dashboard/profile");
  revalidatePath(`/people/${user.id}`);
  revalidatePath("/find-people");
  return { ok: true };
}

/* ========================================================================
 * Buyer profile basics (full_name, company_name, buyer_type)
 * ====================================================================== */

export async function updateBuyerProfileAction(input: {
  full_name?: string;
  company_name?: string;
  buyer_type?: string;
}) {
  const { sb, user } = await requireUser();
  if (input.full_name !== undefined) {
    const { error: nameErr } = await sb.from("users").update({ full_name: input.full_name }).eq("id", user.id);
    if (nameErr) return { ok: false, reason: nameErr.message };
  }
  const bpUpdate: Record<string, any> = {};
  if (input.company_name !== undefined) bpUpdate.company_name = input.company_name;
  if (input.buyer_type !== undefined) bpUpdate.buyer_type = input.buyer_type;
  if (Object.keys(bpUpdate).length > 0) {
    const { error } = await sb.from("buyer_profiles").upsert({
      user_id: user.id, ...bpUpdate,
    }, { onConflict: "user_id" });
    if (error) return { ok: false, reason: error.message };
  }
  revalidatePath("/dashboard/profile");
  return { ok: true };
}

/* ========================================================================
 * Photo upload — uses supabase storage (avatar in users table is a URL;
 * we upload to the public employee-projects bucket, but for the avatar
 * we use the users.avatar_url column directly via signed upload).
 * Simpler: use the admin client to update users.avatar_url.
 * ====================================================================== */

export async function updateAvatarUrlAction(avatarUrl: string) {
  const { user } = await requireUser();
  const admin = createAdminClient();
  const { error } = await admin.from("users").update({ avatar_url: avatarUrl }).eq("id", user.id);
  if (error) return { ok: false, reason: error.message };
  revalidatePath("/dashboard/profile");
  return { ok: true };
}

/* ========================================================================
 * Skills — picked from skill_categories. We replace the employee's row
 * set atomically (delete + insert). For 1000+ skills this would be slow,
 * but for typical employees (5-15 skills) it's fine.
 * ====================================================================== */

export async function updateEmployeeSkillsAction(skills: { category_id: string; years_experience?: number; is_primary?: boolean }[]) {
  const { sb, user } = await requireUser();
  // Delete existing
  await sb.from("employee_skills").delete().eq("employee_id", user.id);
  // Insert new
  if (skills.length > 0) {
    const rows = skills.map((s, i) => ({
      employee_id: user.id,
      category_id: s.category_id,
      years_experience: s.years_experience ?? null,
      is_primary: s.is_primary ?? (i === 0),
      current_wage_band_min: 25000,
      current_wage_band_max: 75000,
      verification_status: "unverified",
    }));
    const { error } = await sb.from("employee_skills").insert(rows);
    if (error) return { ok: false, reason: error.message };
  }
  revalidatePath("/dashboard/profile");
  revalidatePath("/find-people");
  return { ok: true };
}

/* ========================================================================
 * Education (CRUD)
 * ====================================================================== */

export async function addEducationAction(input: {
  institution: string; degree?: string; field_of_study?: string;
  start_year?: number; end_year?: number; is_current?: boolean; description?: string;
}) {
  const { sb, user } = await requireUser();
  const { error } = await sb.from("employee_education").insert({
    user_id: user.id, ...input,
    sort_order: Date.now(),
  });
  if (error) return { ok: false, reason: error.message };
  revalidatePath("/dashboard/profile");
  revalidatePath(`/people/${user.id}`);
  return { ok: true };
}

export async function deleteEducationAction(id: string) {
  const { sb, user } = await requireUser();
  const { error } = await sb.from("employee_education").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, reason: error.message };
  revalidatePath("/dashboard/profile");
  revalidatePath(`/people/${user.id}`);
  return { ok: true };
}

/* ========================================================================
 * Experience (CRUD)
 * ====================================================================== */

export async function addExperienceAction(input: {
  company: string; role: string; employment_type?: string; location?: string;
  is_current?: boolean; start_date: string; end_date?: string; description?: string;
}) {
  const { sb, user } = await requireUser();
  const { error } = await sb.from("employee_experience").insert({
    user_id: user.id, ...input,
    sort_order: Date.now(),
  });
  if (error) return { ok: false, reason: error.message };
  revalidatePath("/dashboard/profile");
  revalidatePath(`/people/${user.id}`);
  return { ok: true };
}

export async function deleteExperienceAction(id: string) {
  const { sb, user } = await requireUser();
  const { error } = await sb.from("employee_experience").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, reason: error.message };
  revalidatePath("/dashboard/profile");
  revalidatePath(`/people/${user.id}`);
  return { ok: true };
}

/* ========================================================================
 * Projects (CRUD)
 * ====================================================================== */

export async function addProjectAction(input: {
  title: string; description: string; url?: string; image_url?: string;
  role?: string; tech_stack?: string[]; start_date?: string; end_date?: string; is_featured?: boolean;
}) {
  const { sb, user } = await requireUser();
  const { error } = await sb.from("employee_projects").insert({
    user_id: user.id, ...input,
    sort_order: Date.now(),
  });
  if (error) return { ok: false, reason: error.message };
  revalidatePath("/dashboard/profile");
  revalidatePath(`/people/${user.id}`);
  return { ok: true };
}

export async function deleteProjectAction(id: string) {
  const { sb, user } = await requireUser();
  const { error } = await sb.from("employee_projects").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, reason: error.message };
  revalidatePath("/dashboard/profile");
  revalidatePath(`/people/${user.id}`);
  return { ok: true };
}

/* ========================================================================
 * Certifications (CRUD)
 * ====================================================================== */

export async function addCertificationAction(input: {
  name: string; issuer: string; issued_at?: string; expires_at?: string;
  credential_id?: string; url?: string;
}) {
  const { sb, user } = await requireUser();
  const { error } = await sb.from("employee_certifications").insert({
    user_id: user.id, ...input,
    sort_order: Date.now(),
  });
  if (error) return { ok: false, reason: error.message };
  revalidatePath("/dashboard/profile");
  revalidatePath(`/people/${user.id}`);
  return { ok: true };
}

export async function deleteCertificationAction(id: string) {
  const { sb, user } = await requireUser();
  const { error } = await sb.from("employee_certifications").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, reason: error.message };
  revalidatePath("/dashboard/profile");
  revalidatePath(`/people/${user.id}`);
  return { ok: true };
}

/* ========================================================================
 * Social links (upsert)
 * ====================================================================== */

export async function setSocialLinkAction(platform: string, url: string) {
  const { sb, user } = await requireUser();
  const { error } = await sb.from("employee_social_links").upsert({
    user_id: user.id, platform, url, sort_order: Date.now(),
  }, { onConflict: "user_id,platform" });
  if (error) return { ok: false, reason: error.message };
  revalidatePath("/dashboard/profile");
  revalidatePath(`/people/${user.id}`);
  return { ok: true };
}

export async function deleteSocialLinkAction(platform: string) {
  const { sb, user } = await requireUser();
  const { error } = await sb.from("employee_social_links").delete().eq("user_id", user.id).eq("platform", platform);
  if (error) return { ok: false, reason: error.message };
  revalidatePath("/dashboard/profile");
  return { ok: true };
}

/* ========================================================================
 * Profile completeness — called by the builder UI as a progress bar.
 * Computes 0-100 based on which sections are filled in.
 * ====================================================================== */

export async function getProfileCompletenessAction(): Promise<number> {
  const { sb, user } = await requireUser();
  const [{ data: ep }, { data: skills }, { data: edu }, { data: exp }, { data: proj }, { data: cert }, { data: links }, { data: u }] = await Promise.all([
    sb.from("employee_profiles").select("bio, location, headline, hourly_rate_paise").eq("user_id", user.id).maybeSingle(),
    sb.from("employee_skills").select("id").eq("employee_id", user.id),
    sb.from("employee_education").select("id").eq("user_id", user.id),
    sb.from("employee_experience").select("id").eq("user_id", user.id),
    sb.from("employee_projects").select("id").eq("user_id", user.id),
    sb.from("employee_certifications").select("id").eq("user_id", user.id),
    sb.from("employee_social_links").select("platform").eq("user_id", user.id),
    sb.from("users").select("full_name, avatar_url").eq("id", user.id).maybeSingle(),
  ]);
  let score = 0;
  if (u?.full_name) score += 5;
  if (u?.avatar_url) score += 5;
  if (ep?.headline) score += 5;
  if (ep?.bio && (ep.bio as string).length > 20) score += 15;
  if (ep?.location) score += 5;
  if (ep?.hourly_rate_paise) score += 5;
  if ((skills?.length ?? 0) >= 1) score += 15;
  if ((skills?.length ?? 0) >= 3) score += 5;
  if ((edu?.length ?? 0) >= 1) score += 10;
  if ((exp?.length ?? 0) >= 1) score += 15;
  if ((proj?.length ?? 0) >= 1) score += 10;
  if ((cert?.length ?? 0) >= 1) score += 5;
  if ((links?.length ?? 0) >= 1) score += 5;
  return Math.min(100, score);
}
