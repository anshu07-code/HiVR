import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CategoryIcon } from "@/components/marketing/category-icon";
import { TaskActions } from "./task-actions";
import { BuyerTaskControls } from "./buyer-controls";
import { TaskRealtime } from "./task-realtime";
import { TaskQueries } from "./task-queries";
import { TaskTabs } from "./task-tabs";
import { createClient } from "@/lib/supabase/server";
import { formatINR, formatPaise, timeAgo, timeUntil } from "@/lib/utils";
import {
  ArrowLeft, Briefcase, Calendar, Clock, MapPin, Users, Building2,
  CheckCircle2, Sparkles, TrendingUp, DollarSign, Bookmark, Heart, Settings, X, ChevronRight,
} from "lucide-react";
import { ShareButton } from "./share-button";
import { TimeAgo } from "@/components/time-ago";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TaskDetailPage({ params }: { params: { id: string } }) {
  noStore();
  const sb = createClient();
  const taskId = params.id;

  // Fetch task + current user in parallel.
  const [{ data: task }, { data: { user } }] = await Promise.all([
    sb.from("task_posts")
      .select("id, title, description, pricing_model, budget_min, budget_max, status, created_at, deadline, estimated_hours, buyer_id, category_id, openings, skills_required, category:skill_categories(slug, name, icon, tier)")
      .eq("id", taskId)
      .maybeSingle(),
    sb.auth.getUser(),
  ]);
  if (!task) notFound();

  // Fetch the poster + the current user's profile (for roles / current_mode)
  // in parallel.
  const [{ data: buyerUser }, { data: meProfile }] = await Promise.all([
    sb.from("users")
      .select("id, full_name, avatar_url, current_mode")
      .eq("id", task.buyer_id)
      .maybeSingle(),
    user
      ? sb.from("users").select("id, full_name, avatar_url, roles, current_mode").eq("id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Interaction tables. We probe whether the new tables exist by doing a
  // lightweight count query first. If migration 0023 has been run, the
  // query succeeds and we fetch the real data; if not, the query returns
  // an error and the page degrades gracefully (no Apply button, no
  // applicant list, no Q&A).
  //
  // We split this into MULTIPLE small queries instead of one giant join —
  // PostgREST embedded joins can silently fail when any link in the chain
  // hits a 0-row RLS result. Splitting makes each query robust.
  let applications: any[] = [];
  let likes: any[] = [];
  let queries: any[] = [];
  const hasInteractions = await checkInteractionsTable(sb);
  if (hasInteractions) {
    // Step 1: applications — base fields only (no joins)
    const { data: appsBase, error: aErr } = await sb
      .from("task_applications")
      .select("id, cover_note, bid_paise, status, created_at, employee_id")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false });
    if (!aErr && appsBase && appsBase.length > 0) {
      // Step 2: fetch the employees' public profile data in one batch
      const empIds = Array.from(new Set(appsBase.map((a: any) => a.employee_id).filter(Boolean)));
      const [{ data: emps }, { data: profiles }] = await Promise.all([
        // Only valid columns: `users` has id/full_name/avatar_url/current_mode.
        // `is_verified` and `trust_tier` don't exist there — they live on
        // `employee_profiles` (overall_trust_tier).
        sb.from("users").select("id, full_name, avatar_url, current_mode").in("id", empIds),
        sb.from("employee_profiles").select("user_id, bio, location, experience_type, overall_trust_tier, lifetime_earnings, completion_rate, avg_rating, total_reviews").in("user_id", empIds),
      ]);
      const empMap = new Map((emps ?? []).map((e: any) => [e.id, e]));
      const profMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));
      // Step 3: stitch together
      applications = appsBase.map((a: any) => ({
        ...a,
        employee: empMap.get(a.employee_id) ?? null,
        employee_profile: profMap.get(a.employee_id) ?? null,
      }));
    }
    // Likes + queries (no embedded joins, no RLS surprises)
    const [l, q] = await Promise.all([
      sb.from("task_likes").select("user_id").eq("task_id", taskId),
      sb.from("task_queries")
        .select("id, body, is_answer, created_at, asker_id, parent_id, asker:users!task_queries_asker_id_fkey(id, full_name, avatar_url)")
        .eq("task_id", taskId)
        .order("created_at", { ascending: true }),
    ]);
    if (!l.error) likes = l.data ?? [];
    if (!q.error) queries = q.data ?? [];
  }

  // Derive UI state.
  const myApp = user ? applications.find((a: any) => a.employee_id === user.id) : null;
  const hasLiked = user ? likes.some((l: any) => l.user_id === user.id) : false;
  const appsCount = applications.filter((a: any) => a.status !== "withdrawn").length;
  const isBuyer = user?.id === task.buyer_id;
  // An employee is someone who has the "employee" role in their `roles`
  // array. If they're in buyer mode, they're effectively a buyer for this
  // task and can't apply / save.
  const userRoles: string[] = (meProfile?.roles as string[]) ?? [];
  const isAdmin = userRoles.includes("admin");
  const hasEmployeeRole = isAdmin || userRoles.includes("employee");
  const isInEmployeeMode = hasEmployeeRole && (isAdmin || meProfile?.current_mode === "employee" || meProfile?.current_mode === "both" || !meProfile?.current_mode);
  const canEmployeeAct = !!user && hasEmployeeRole && isInEmployeeMode && !isBuyer;
  const tierLabel = (task as any).category?.tier === "role_engagement" ? "Tier B · Role engagement" : "Tier A · Micro-task";
  const initials = ((buyerUser?.full_name ?? "??").split(" ").map((w: string) => w[0]).slice(0, 2).join("") || "??").toUpperCase();

  // Approximate applicants for the "X applicants" stat. We also pull the
  // canonical count from task_applicant_counts (the view) as a fallback for
  // cases where applications table data is missing/stale.
  const shortlisted = applications.filter((a: any) => a.status === "shortlisted").length;
  const hired = applications.filter((a: any) => a.status === "hired").length;
  const appCountLocal = applications.filter((a: any) => a.status !== "withdrawn").length;
  let appCountView = appCountLocal;
  if (appsCount === 0 && appCountLocal === 0) {
    try {
      const { data: vc } = await sb
        .from("task_applicant_counts")
        .select("applicant_count")
        .eq("task_id", taskId)
        .maybeSingle();
      if (vc) appCountView = Number((vc as any).applicant_count) || 0;
    } catch { /* non-fatal */ }
  }

  // Employee apply context — only fetched for signed-in non-buyer
  // employees. Used by TaskActions to show the skill-match / pause / rate
  // limit banners.
  let applyCtx: Awaited<ReturnType<typeof import("@/lib/auth-context").getEmployeeApplyContext>> | null = null;
  if (canEmployeeAct) {
    applyCtx = await import("@/lib/auth-context").then(m => m.getEmployeeApplyContext({ userId: user!.id, taskId }));
  }

  // For the Applicants tab we want to know which applicants have the
  // task's skill verified. We do a single query for all relevant
  // employee_skills and bucket.
  let applicantSkillMap: Record<string, { verified: boolean; status: string }> = {};
  if (canEmployeeAct && hasInteractions && applications.length > 0) {
    const empIds = Array.from(new Set(applications.map((a: any) => a.employee_id).filter(Boolean)));
    if (empIds.length > 0) {
      const { data: sks } = await sb
        .from("employee_skills")
        .select("employee_id, verification_status")
        .in("employee_id", empIds)
        .eq("category_id", task.category_id);
      for (const r of sks ?? []) {
        const v = (r as any).verification_status;
        applicantSkillMap[(r as any).employee_id] = {
          verified: v === "verified" || v === "experienced" || v === "top_rated",
          status: v,
        };
      }
    }
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Realtime subscription — re-renders the page when applications,
          likes, queries, or the task itself change. */}
      <TaskRealtime taskId={taskId} />

      {/* ============ TOP NAVIGATION STRIP ============ */}
      <div className="border-b bg-background/80 backdrop-blur sticky top-[60px] z-30">
        <div className="container flex items-center justify-between py-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/browse">
              <ArrowLeft className="h-4 w-4" />
              All tasks
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            {isBuyer && (
              <Button asChild size="sm" variant="outline">
                <Link href={`/dashboard/tasks/${taskId}/applicants`}>
                  <Settings className="h-3.5 w-3.5" />
                  Manage task
                  {appCountView > 0 && (
                    <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/20 px-1.5 text-[10px] font-bold text-primary">
                      {appCountView}
                    </span>
                  )}
                </Link>
              </Button>
            )}
            <ShareButton url={`/browse/${taskId}`} title={task.title} />
            {hasInteractions && (
              <TaskActions
                taskId={taskId}
                initialLiked={hasLiked}
                initialLikesCount={likes.length}
                initialApplied={!!myApp}
                isBuyer={isBuyer}
                signedIn={!!user}
                canEmployeeAct={canEmployeeAct}
                appsCount={appsCount}
                applyCtx={applyCtx as any}
                variant="icon-only"
              />
            )}
          </div>
        </div>
      </div>

      {/* ============ HERO ============ */}
      <div className="border-b bg-background">
        <div className="container pb-0 pt-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="flex-1 min-w-0">
              {/* Tags row */}
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge variant={(task as any).category?.tier === "role_engagement" ? "tierB" : "tierA"}>
                  {(task as any).category?.tier === "role_engagement" ? "Tier B · Role" : "Tier A · Micro-task"}
                </Badge>
                <Badge variant="outline" className="capitalize">
                  <Briefcase className="mr-1 h-3 w-3" />
                  {task.pricing_model.replace("_", " ")}
                </Badge>
                <Badge variant="secondary" className="capitalize">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  {task.status.replace("_", " ")}
                </Badge>
                <span className="text-xs text-muted-foreground"><TimeAgo date={task.created_at} /></span>
              </div>

              {/* Title */}
              <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl lg:text-4xl">
                {task.title}
              </h1>

              {/* Skills required chips (buyer's own tags) */}
              {(task as any).skills_required && (task as any).skills_required.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(task as any).skills_required.map((s: string) => (
                    <Badge key={s} variant="secondary" className="text-xs">
                      <Sparkles className="mr-1 h-3 w-3 text-primary" />{s}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Buyer line */}
              <div className="mt-4 flex items-center gap-2 text-sm">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Posted by</span>
                <Avatar className="h-5 w-5">
                  <AvatarImage src={buyerUser?.avatar_url ?? undefined} />
                  <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
                </Avatar>
                <span className="font-semibold">{buyerUser?.full_name ?? "Anonymous buyer"}</span>
                <Badge variant="success" className="text-[10px]">Verified</Badge>
              </div>

              {/* Key stats row */}
              <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatPill Icon={DollarSign} label="Budget" value={`${formatPaise(task.budget_min)}–${formatPaise(task.budget_max)}`} />
                <StatPill Icon={Clock} label="Duration" value={(task as any).estimated_hours ? `~${(task as any).estimated_hours} ${(task as any).category?.tier === "role_engagement" ? "days" : "hrs"}` : "Flexible"} />
                <StatPill Icon={Users} label="Applicants" value={String(appsCount)} hint={shortlisted > 0 ? `${shortlisted} shortlisted` : undefined} />
                <StatPill Icon={Briefcase} label="Openings" value={String((task as any).openings ?? 1)} hint={String((task as any).openings ?? 1) === "1" ? undefined : `${(task as any).openings ?? 1} hires`} />
              </div>
            </div>

            {/* APPLY CTA — right side on desktop, sticky */}
            <div className="md:w-72 shrink-0">
              <div className="rounded-xl border bg-card p-5 shadow-sm">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Compensation</div>
                <div className="mt-1 font-display text-2xl font-bold">
                  {formatPaise(task.budget_min)}
                  <span className="text-base font-normal text-muted-foreground"> – {formatPaise(task.budget_max)}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {task.pricing_model.replace("_", " ")} · {formatPaise(task.budget_min)}–{formatPaise(task.budget_max)}
                </div>
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-1 text-xs">
                  <Briefcase className="h-3 w-3 text-muted-foreground" />
                  <span className="font-medium">{(task as any).openings ?? 1}</span>
                  <span className="text-muted-foreground">
                    {(task as any).openings > 1 ? "openings" : "opening"}
                  </span>
                </div>

                {/* Deadline display */}
                {task.deadline && (
                  <div className="mt-3 rounded-md border bg-amber-500/5 p-2 text-xs">
                    <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                      <Clock className="h-3 w-3" />
                      <span className="font-medium">
                        {new Date(task.deadline) > new Date() ? "Closes" : "Closed"}{" "}
                        {timeUntil(task.deadline as any)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {new Date(task.deadline).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                    </p>
                  </div>
                )}

                {hasInteractions ? (
                  <div className="mt-4 space-y-2">
                    <TaskActions
                      taskId={taskId}
                      initialLiked={hasLiked}
                      initialLikesCount={likes.length}
                      initialApplied={!!myApp}
                      isBuyer={isBuyer}
                      signedIn={!!user}
                      canEmployeeAct={canEmployeeAct}
                      appsCount={appsCount}
                      applyCtx={applyCtx as any}
                    />
                    {!isBuyer && canEmployeeAct && !applyCtx?.paused && (
                      <p className="text-center text-[10px] text-muted-foreground">
                        Applications are reviewed by the buyer. No spam.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="mt-4">
                    <p className="text-xs text-muted-foreground">
                      Run <code className="rounded bg-muted px-1 py-0.5 text-[10px]">0023_task_applications.sql</code> in Supabase to enable Apply.
                    </p>
                  </div>
                )}

                {/* Buyer-only: extend deadline / close task (applicants link is in the header) */}
                {isBuyer && (
                  <BuyerTaskControls
                    taskId={taskId}
                    initialDeadline={task.deadline as any}
                    status={(task as any).status}
                    appsCount={appsCount}
                  />
                )}

                <div className="mt-4 grid grid-cols-3 gap-2 border-t pt-4 text-center text-xs">
                  <div>
                    <div className="font-display text-lg font-semibold">{appCountView}</div>
                    <div className="text-muted-foreground">Applied</div>
                  </div>
                  <div className="border-x">
                    <div className="font-display text-lg font-semibold">{shortlisted}</div>
                    <div className="text-muted-foreground">Shortlisted</div>
                  </div>
                  <div>
                    <div className="font-display text-lg font-semibold">{hired}</div>
                    <div className="text-muted-foreground">Hired</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ============ MAIN BODY (tabs) ============ */}
      <div className="container pb-8 pt-4">
        <TaskTabs
          taskId={taskId}
          task={{
            id: task.id,
            title: task.title,
            description: task.description,
            pricing_model: task.pricing_model,
            budget_min: task.budget_min,
            budget_max: task.budget_max,
            status: task.status,
            created_at: task.created_at,
            deadline: task.deadline ?? null,
            estimated_hours: (task as any).estimated_hours ?? null,
            category: (task as any).category ?? null,
          }}
          applications={applications}
          queries={queries}
          isBuyer={isBuyer}
          signedIn={!!user}
          hasInteractions={hasInteractions}
          applicantSkillMap={applicantSkillMap}
          currentUserId={user?.id ?? undefined}
        />
      </div>
    </div>
  );
}

function StatPill({ Icon, label, value, hint }: { Icon: any; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="mt-1 truncate font-display text-sm font-semibold">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

async function checkInteractionsTable(sb: ReturnType<typeof createClient>): Promise<boolean> {
  try {
    const r = await sb.from("task_applications").select("id", { count: "exact", head: true }).limit(1);
    return !r.error;
  } catch {
    return false;
  }
}
