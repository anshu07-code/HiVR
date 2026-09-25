import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { SidebarMode } from "@/components/layout/dashboard-sidebar";

/**
 * Cached auth + profile lookup. Called by both /dashboard/layout and
 * /admin/layout on every navigation. Wrapping in `cache()` deduplicates
 * the calls within a single request — and crucially, the auth check, the
 * users lookup, and the admin_users lookup all run in PARALLEL instead
 * of sequentially, cutting layout latency by ~2/3.
 *
 * Returns null if not signed in (the caller decides whether to redirect).
 */
export const getCurrentUserContext = cache(async () => {
  const sb = createClient();
  let user = null;
  try {
    const res = await sb.auth.getUser();
    user = res.data.user;
  } catch {
    // fallback if token refresh races with middleware
  }
  if (!user) return {
    user: null,
    profile: null,
    isAdmin: false,
    mode: "employee" as SidebarMode,
    emailConfirmed: false,
    phoneConfirmed: false,
  };

  // Fire the two DB lookups in parallel — they don't depend on each other.
  const [profileRes, adminRes] = await Promise.all([
    sb.from("users").select("roles, current_mode, phone_verified, full_name, is_suspended").eq("id", user.id).maybeSingle(),
    sb.from("admin_users").select("admin_role").eq("user_id", user.id).maybeSingle(),
  ]);

  const profile = profileRes.data;
  const isAdmin = !!adminRes.data;
  const roles: string[] = (profile?.roles as string[] | null) ?? [];
  const mode: SidebarMode = isAdmin
    ? "admin"
    : roles.includes("business")
    ? "business"
    : profile?.current_mode === "buyer"
    ? "buyer"
    : "employee";

  return {
    user,
    profile,
    isAdmin,
    mode,
    emailConfirmed: !!user.email_confirmed_at,
    phoneConfirmed: !!user.phone_confirmed_at,
  };
});

/**
 * Dashboard layout helper. Redirects to signin if not authenticated.
 */
export async function requireUser(nextPath: string) {
  const ctx = await getCurrentUserContext();
  if (!ctx.user) redirect(`/auth/signin?next=${encodeURIComponent(nextPath)}`);
  return ctx;
}

/**
 * Admin layout helper. Redirects to signin if not authenticated, or to
 * the dashboard if the user is signed in but not an admin.
 */
export async function requireAdmin(nextPath: string) {
  const ctx = await getCurrentUserContext();
  if (!ctx.user) redirect(`/auth/signin?next=${encodeURIComponent(nextPath)}`);
  if (!ctx.isAdmin) redirect("/dashboard?error=admin_required");
  return ctx;
}

/* ====================================================================== */
/* Buyer KYC helpers                                                      */
/* ====================================================================== */

/**
 * Returns true if the user has completed the buyer KYC requirements:
 *   * email confirmed
 *   * phone verified
 *   * PAN verified (purpose='buyer')
 *   * Aadhaar verified (purpose='buyer')
 *   * Bank account verified (purpose='buyer')
 *   * (Business buyers) GSTIN verified
 *
 * The caller can also pass `minBudgetRupees` to relax the requirements
 * for sub-₹2,000 tasks (not used by default — the platform now requires
 * full KYC for any spend).
 */
export type KycStatus = {
  email: boolean;
  phone: boolean;
  pan: boolean;
  aadhaar: boolean;
  bank: boolean;
  gstin: boolean;
  isBusiness: boolean;
  isComplete: boolean;
  missing: string[];
};

export async function getBuyerKycStatus(userId: string): Promise<KycStatus> {
  const sb = createClient();
  const [{ data: u }, { data: bp }, { data: vs }] = await Promise.all([
    sb.from("users").select("email, phone_verified").eq("id", userId).maybeSingle(),
    sb.from("buyer_profiles").select("buyer_type").eq("user_id", userId).maybeSingle(),
    sb.from("verifications").select("doc_type, status, purpose").eq("user_id", userId).eq("purpose", "buyer"),
  ]);

  const isBusiness = bp?.buyer_type === "business";
  const verified = new Set(
    (vs ?? []).filter((v: any) => v.status === "verified").map((v: any) => v.doc_type)
  );

  const status: KycStatus = {
    email:  !!u?.email,
    phone:  !!u?.phone_verified,
    pan:    verified.has("pan"),
    aadhaar: verified.has("aadhaar"),
    bank:   verified.has("bank"),
    gstin:  verified.has("gstin"),
    isBusiness,
    isComplete: false,
    missing: [],
  };
  status.isComplete =
    status.email &&
    status.phone &&
    status.pan &&
    status.aadhaar &&
    status.bank &&
    (!isBusiness || status.gstin);
  if (!status.email)   status.missing.push("Confirm your email");
  if (!status.phone)   status.missing.push("Verify your phone number");
  if (!status.pan)     status.missing.push("Verify your PAN");
  if (!status.aadhaar) status.missing.push("Verify your Aadhaar");
  if (!status.bank)    status.missing.push("Verify your bank account");
  if (isBusiness && !status.gstin) status.missing.push("Verify your GSTIN");
  return status;
}

/**
 * Throws a redirect to the buyer onboarding flow if KYC is incomplete.
 * Use in server components / server actions that gate on buyer verification.
 */
export async function requireBuyerKyc(nextPath: string) {
  const ctx = await getCurrentUserContext();
  if (!ctx.user) redirect(`/auth/signin?next=${encodeURIComponent(nextPath)}`);
  const kyc = await getBuyerKycStatus(ctx.user.id);
  if (!kyc.isComplete) {
    redirect(`/onboarding/buyer?next=${encodeURIComponent(nextPath)}&missing=${kyc.missing.join(",")}`);
  }
  return { ctx, kyc };
}

/**
 * Returns the result of a rate-limit check on task posting. We track
 * attempts in `buyer_profiles.post_attempts_1h` and `_24h` and roll them
 * forward. The actual rate-limit numbers come from platform_settings
 * with sane defaults.
 */
export type TaskPostGuard = {
  allowed: boolean;
  reason?: string;
  remainingHour: number;
  remainingDay: number;
  kycComplete: boolean;
  missing: string[];
};

export async function canBuyerPostTask(opts: { userId: string; budgetRupees: number; tier: "micro_task" | "role_engagement" }): Promise<TaskPostGuard> {
  const sb = createClient();
  const kyc = await getBuyerKycStatus(opts.userId);

  // Hard KYC floor: if KYC is incomplete, no posting at all.
  if (!kyc.isComplete) {
    return { allowed: false, reason: "Complete KYC to post tasks.", kycComplete: false, missing: kyc.missing, remainingHour: 0, remainingDay: 0 };
  }

  // Tier B gate: admins and fully-KYC'd buyers can post tier B. Already
  // gated by kyc.isComplete above, so this is implicit. (We could add a
  // stricter "tier_b_eligible" flag in the future — e.g. min lifetime
  // spend — but for now full KYC is the bar.)

  // Rate limit via platform_settings.
  const { data: settings } = await sb
    .from("platform_settings")
    .select("key, value")
    .in("key", ["task_post_rate_limit_per_hour", "task_post_rate_limit_per_day", "block_tier_b_for_unverified"]);
  const get = (k: string, def: number) => {
    const s = (settings ?? []).find((x: any) => x.key === k) as any;
    return Number(s?.value?.value ?? def);
  };
  const perHour = get("task_post_rate_limit_per_hour", 5);
  const perDay = get("task_post_rate_limit_per_day", 20);

  // Count attempts in the last hour and last 24h.
  const now = Date.now();
  const since1h = new Date(now - 60 * 60_000).toISOString();
  const since24h = new Date(now - 24 * 60 * 60_000).toISOString();
  const [{ count: c1h }, { count: c24h }] = await Promise.all([
    sb.from("task_posts").select("id", { count: "exact", head: true }).eq("buyer_id", opts.userId).gte("created_at", since1h),
    sb.from("task_posts").select("id", { count: "exact", head: true }).eq("buyer_id", opts.userId).gte("created_at", since24h),
  ]);
  const h1 = c1h ?? 0;
  const h24 = c24h ?? 0;

  if (h1 >= perHour) return { allowed: false, reason: `Rate limit: max ${perHour} tasks per hour. Try again in a few minutes.`, kycComplete: true, missing: [], remainingHour: 0, remainingDay: Math.max(0, perDay - h24) };
  if (h24 >= perDay) return { allowed: false, reason: `Rate limit: max ${perDay} tasks per day.`, kycComplete: true, missing: [], remainingHour: Math.max(0, perHour - h1), remainingDay: 0 };

  return {
    allowed: true,
    kycComplete: true,
    missing: [],
    remainingHour: Math.max(0, perHour - h1 - 1),
    remainingDay: Math.max(0, perDay - h24 - 1),
  };
}

/* ====================================================================== */
/* Employee apply-to-task gate                                            */
/* ====================================================================== */

export type EmployeeApplyContext = {
  /** True if the user can submit an application right now. */
  canApply: boolean;
  /** Reason humanised for the UI when `canApply` is false. */
  blockedReason?: string;
  /** True if the user has a verified skill in this task's category. */
  hasSkill: boolean;
  /** The matched `employee_skills` row, if any. */
  skill: {
    verification_status: string;
    current_wage_band_min: number;
    current_wage_band_max: number;
  } | null;
  /** Number of disputes the employee has lost. */
  disputeLossCount: number;
  /** True if the profile is paused (>= 2 disputes lost or admin-set). */
  paused: boolean;
  pausedReason: string | null;
  /** Live Aadhaar / PAN status (we don't hard-block applies on these, but
   *  the UI uses them to remind the user). */
  hasAadhaar: boolean;
  hasPan: boolean;
  /** How many applications the user has submitted in the last hour. */
  applicationsThisHour: number;
  applicationsPerHourLimit: number;
  /** Profile completeness 0-100. Below 60 = blocked from applying. */
  profileCompleteness: number;
  /** Skills the task wants that the employee has (overlap). */
  matchedSkills: string[];
  /** Skills the task wants that the employee does NOT have. */
  missingSkills: string[];
};

/**
 * Read everything the apply-to-task UI needs in one go. We don't block
 * the apply on missing identity or missing skill — the UI surfaces the
 * warnings, and only a paused profile (2+ disputes) blocks outright.
 */
export async function getEmployeeApplyContext(opts: { userId: string; taskId: string }): Promise<EmployeeApplyContext> {
  const sb = createClient();
  const now = Date.now();
  const since1h = new Date(now - 60 * 60_000).toISOString();

  const [{ data: ep }, { data: task }, { data: vs }, { data: skills }, { data: settings }, { count: apps1h }, { data: completenessRpc }, { data: skillMatchRpc }] = await Promise.all([
    sb.from("employee_profiles").select("dispute_loss_count, application_paused, application_paused_reason").eq("user_id", opts.userId).maybeSingle(),
    sb.from("task_posts").select("id, category_id").eq("id", opts.taskId).maybeSingle(),
    sb.from("verifications").select("doc_type, status, purpose").eq("user_id", opts.userId).eq("purpose", "employee").eq("status", "verified"),
    sb.from("employee_skills").select("category_id, verification_status, current_wage_band_min, current_wage_band_max").eq("employee_id", opts.userId),
    sb.from("platform_settings").select("key, value").in("key", ["application_rate_limit_per_hour"]),
    sb.from("task_applications").select("id", { count: "exact", head: true }).eq("employee_id", opts.userId).gte("created_at", since1h),
    sb.rpc("compute_profile_completeness" as any, { p_user_id: opts.userId } as any),
    sb.rpc("compute_skill_match" as any, { p_user_id: opts.userId, p_task_id: opts.taskId } as any),
  ]);

  const perHour = Number((settings ?? []).find((s: any) => s.key === "application_rate_limit_per_hour")?.value?.value ?? 10);
  const skillMatch = (skills ?? []).find((s: any) => s.category_id === task?.category_id);
  const hasCategorySkill = skillMatch?.verification_status === "verified" || skillMatch?.verification_status === "experienced" || skillMatch?.verification_status === "top_rated";

  const profileCompleteness = Number(completenessRpc ?? 0);
  const skillMatchRow = (skillMatchRpc as any)?.[0] ?? skillMatchRpc;
  const matchedSkills: string[] = (skillMatchRow?.matched_skills as string[]) ?? [];
  const missingSkills: string[] = (skillMatchRow?.missing_skills as string[]) ?? [];

  // hasSkill = category-level match OR the RPC confirmed matching skills
  const hasSkill = hasCategorySkill || matchedSkills.length > 0;
  const docTypes = new Set((vs ?? []).map((v: any) => v.doc_type));

  const paused = !!ep?.application_paused;
  const disputeLossCount = ep?.dispute_loss_count ?? 0;
  const applicationsThisHour = apps1h ?? 0;

  let blockedReason: string | undefined;
  if (paused) {
    if (ep?.permanent_ban) {
      blockedReason = "Your profile is permanently banned due to repeated dispute losses. Contact support for review.";
    } else {
      blockedReason = ep?.application_paused_reason ?? "Your profile is paused. Contact support to request an unpause.";
    }
  } else if (profileCompleteness < 60) {
    blockedReason = `Your profile is only ${profileCompleteness}% complete. Build it to at least 60% before applying — buyers shortlist full profiles.`;
  } else if (applicationsThisHour >= perHour) {
    blockedReason = `Application rate limit: max ${perHour} per hour. Try again in a few minutes.`;
  }

  return {
    canApply: !blockedReason,
    blockedReason,
    hasSkill,
    skill: skillMatch ? {
      verification_status: skillMatch.verification_status,
      current_wage_band_min: skillMatch.current_wage_band_min,
      current_wage_band_max: skillMatch.current_wage_band_max,
    } : null,
    disputeLossCount,
    paused,
    pausedReason: ep?.application_paused_reason ?? null,
    hasAadhaar: docTypes.has("aadhaar"),
    hasPan: docTypes.has("pan"),
    applicationsThisHour,
    applicationsPerHourLimit: perHour,
    profileCompleteness,
    matchedSkills,
    missingSkills,
  };
}

/**
 * Increments `dispute_loss_count` for the losing party. If it crosses
 * the configured threshold, auto-pauses their applications and bumps
 * the pause-ladder step. Admin can unpause via the admin disputes page.
 */
export async function recordDisputeLoss(userId: string, reason: string): Promise<{ paused: boolean; count: number; ladderStep: number; permanent: boolean }> {
  const sb = createClient();
  const [{ data: ep }, { data: settings }] = await Promise.all([
    sb.from("employee_profiles").select("dispute_loss_count, pause_count, pause_ladder_step, permanent_ban").eq("user_id", userId).maybeSingle(),
    sb.from("platform_settings").select("key, value").eq("key", "employee_dispute_pause_threshold").maybeSingle(),
  ]);
  const threshold = Number((settings as any)?.value?.value ?? 2);
  const newCount = (ep?.dispute_loss_count ?? 0) + 1;
  const updates: any = { dispute_loss_count: newCount };
  let paused = false;
  let ladderStep = (ep as any)?.pause_ladder_step ?? 0;
  let permanent = !!(ep as any)?.permanent_ban;

  if (newCount >= threshold && !permanent) {
    ladderStep = ladderStep + 1;
    updates.pause_count = ((ep as any)?.pause_count ?? 0) + 1;
    updates.pause_ladder_step = ladderStep;
    updates.last_pause_at = new Date().toISOString();

    // Step 4+ is permanent
    if (ladderStep >= 4) {
      updates.permanent_ban = true;
      updates.application_paused = true;
      updates.application_paused_at = new Date().toISOString();
      updates.application_paused_reason = `Permanently banned: reached ladder step ${ladderStep} (${updates.pause_count} pause events). ${reason}`;
      permanent = true;
    } else {
      updates.application_paused = true;
      updates.application_paused_at = new Date().toISOString();
      updates.application_paused_reason = `Auto-paused (ladder step ${ladderStep}/3). Will auto-unpause in ${ladderCooldownDays(ladderStep)} days unless you contact support with proof of remediation. ${reason}`;
    }
    paused = true;
  }
  await sb.from("employee_profiles").update(updates).eq("user_id", userId);

  // Append to unpause_log for audit trail.
  try {
    const { data: cur } = await sb.from("employee_profiles").select("unpause_log").eq("user_id", userId).maybeSingle();
    const log = ((cur as any)?.unpause_log as any[]) ?? [];
    log.push({
      kind: "pause",
      at: new Date().toISOString(),
      ladder_step: ladderStep,
      permanent,
      reason,
    });
    await sb.from("employee_profiles").update({ unpause_log: log.slice(-50) }).eq("user_id", userId);
  } catch { /* non-fatal */ }

  return { paused, count: newCount, ladderStep, permanent };
}

/** Cooldown days for a given ladder step (1, 2, 3). Step 4+ is permanent. */
export function ladderCooldownDays(step: number): number {
  // Defaults; the cron uses the platform_settings values.
  if (step <= 1) return 7;
  if (step === 2) return 30;
  return 90;
}

export type CooldownInfo = {
  paused: boolean;
  permanent: boolean;
  ladderStep: number;
  pauseCount: number;
  cooldownDays: number;
  /** When the current pause will auto-unpause (ISO), or null if permanent. */
  autoUnpauseAt: string | null;
  /** Whole days remaining (rounded up). 0 if expired. */
  daysRemaining: number;
  /** Whether the user has already been unpaused at least once before. */
  hasPriorPause: boolean;
};

/**
 * Read everything the UI needs to render the paused banner with a
 * ladder-aware CTA.
 */
export async function getEmployeeCooldownInfo(userId: string): Promise<CooldownInfo> {
  const sb = createClient();
  const [{ data: ep }, { data: settings }] = await Promise.all([
    sb.from("employee_profiles").select("application_paused, permanent_ban, pause_count, pause_ladder_step, last_pause_at, application_paused_at").eq("user_id", userId).maybeSingle(),
    sb.from("platform_settings").select("key, value").in("key", ["pause_cooldown_step1_days", "pause_cooldown_step2_days", "pause_cooldown_step3_days"]),
  ]);
  const step = ((ep as any)?.pause_ladder_step ?? 0) as number;
  const getSetting = (k: string, def: number) => {
    const row = (settings ?? []).find((s: any) => s.key === k) as any;
    return Number(row?.value?.value ?? def);
  };
  const cooldown = step === 1 ? getSetting("pause_cooldown_step1_days", 7)
                 : step === 2 ? getSetting("pause_cooldown_step2_days", 30)
                 : step === 3 ? getSetting("pause_cooldown_step3_days", 90)
                 : 0;

  const pauseStart = (ep as any)?.last_pause_at ?? (ep as any)?.application_paused_at;
  let autoUnpauseAt: string | null = null;
  let daysRemaining = 0;
  if (pauseStart && cooldown > 0) {
    const end = new Date(pauseStart).getTime() + cooldown * 24 * 60 * 60 * 1000;
    autoUnpauseAt = new Date(end).toISOString();
    daysRemaining = Math.max(0, Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1000)));
  }

  return {
    paused: !!(ep as any)?.application_paused,
    permanent: !!(ep as any)?.permanent_ban,
    ladderStep: step,
    pauseCount: (ep as any)?.pause_count ?? 0,
    cooldownDays: cooldown,
    autoUnpauseAt,
    daysRemaining,
    hasPriorPause: ((ep as any)?.pause_count ?? 0) >= 1,
  };
}

/** Admin tool: clear a paused employee's pause flag.
 *  Pass `{ resetLadder: true }` to also clear the ladder step and
 *  permanent_ban flag (used for genuine false-positives).
 *  Pass `{ reason }` to log the action. */
export async function clearApplicationPause(
  userId: string,
  opts: { resetLadder?: boolean; reason?: string } = {},
): Promise<void> {
  const sb = createClient();
  const updates: any = {
    application_paused: false,
    application_paused_at: null,
    application_paused_reason: null,
  };
  if (opts.resetLadder) {
    updates.pause_ladder_step = 0;
    updates.pause_count = 0;
    updates.permanent_ban = false;
    updates.last_pause_at = null;
  }
  await sb.from("employee_profiles").update(updates).eq("user_id", userId);
  // Audit log entry
  try {
    const { data: cur } = await sb.from("employee_profiles").select("unpause_log").eq("user_id", userId).maybeSingle();
    const log = ((cur as any)?.unpause_log as any[]) ?? [];
    log.push({
      kind: "admin_unpause",
      at: new Date().toISOString(),
      reset_ladder: !!opts.resetLadder,
      reason: opts.reason ?? null,
    });
    await sb.from("employee_profiles").update({ unpause_log: log.slice(-50) }).eq("user_id", userId);
  } catch { /* non-fatal */ }
}
