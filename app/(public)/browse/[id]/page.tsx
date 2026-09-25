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
import { DeadlineDisplay } from "./deadline-display";
import { DraggableSquirrel } from "./draggable-squirrel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TaskDetailPage({ params }: { params: { id: string } }) {
  noStore();
  const sb = createClient();
  const taskId = params.id;

  // Fetch task + current user in parallel.
  const [{ data: task }, { data: { user } }] = await Promise.all([
    sb.from("task_posts")
      .select("id, title, description, pricing_model, budget_min, budget_max, status, created_at, deadline, estimated_hours, buyer_id, category_id, openings, skills_required, brief, category:skill_categories(slug, name, icon, tier)")
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
  const taskClosed = task.status === "closed" || task.status === "cancelled" || task.status === "in_contract" || task.status === "upcoming";
  const canEmployeeAct = !!user && hasEmployeeRole && isInEmployeeMode && !isBuyer && !taskClosed && (!task.deadline || new Date(task.deadline) > new Date());
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

  // Fetch negotiation offer for current user for this task
  let myOffer: any = null;
  let contractId: string | null = null;
  if (user && hasInteractions) {
    const { data: offerData } = await sb
      .from("negotiation_offers")
      .select("id, status, proposed_price, created_at, responded_at, contract_id")
      .or(`employee_id.eq.${user.id},buyer_id.eq.${user.id}`)
      .eq("task_post_id", taskId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (offerData) {
      myOffer = offerData;
      if (offerData.contract_id) contractId = offerData.contract_id;
    }
    if (!contractId && myApp?.status === "hired") {
      const { data: c } = await sb
        .from("contracts")
        .select("id")
        .eq("task_post_id", taskId)
        .eq("employee_id", user.id)
        .neq("status", "cancelled")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (c) contractId = (c as any).id;
    }
  }

  // Squirrel mood + actions — fully personalized per user per task
  const taskOpen = task.status === "open" && (!task.deadline || new Date(task.deadline) > new Date());
  const isBothMode = userRoles.includes("employee") && userRoles.includes("buyer");
  const isPureBuyer = userRoles.includes("buyer") && !userRoles.includes("employee");
  let squirrelMood: "excited" | "happy" | "neutral" | "sad" | "waving" | "worried" | "drinking" = "neutral";
  let squirrelNote: string | undefined;
  let squirrelActions: { label: string; href: string; variant?: "default" | "outline" | "success" }[] | undefined;

  if (!user) {
    squirrelMood = "drinking";
    squirrelNote = "Sign in to apply for this task.";
  } else if (contractId || (myApp && myApp.status === "hired") || (myOffer && myOffer.status === "accepted")) {
    squirrelMood = "happy";
    squirrelNote = "🎉 Congratulations! You've been hired for this task!\nYou're officially part of the team. Head to your contract to get started.";
    squirrelActions = [{ label: "📄 View Contract", href: `/dashboard/contracts/${contractId ?? ""}`, variant: "success" }];
    if (isBuyer) {
      squirrelActions.push({ label: "👥 Applicants", href: `/dashboard/tasks/${taskId}/applicants`, variant: "outline" });
    }
  } else if (myApp && myApp.status === "shortlisted") {
    squirrelMood = "excited";
    squirrelNote = "👀 You've been shortlisted!\nThe buyer is interested in your profile. Keep an eye on your offers and messages.";
    squirrelActions = [{ label: "📋 My Applications", href: "/dashboard/applications", variant: "default" }];
  } else if (myOffer && myOffer.status === "pending") {
    squirrelMood = "excited";
    squirrelNote = "💼 You've received a direct hire offer!\nA buyer wants to work with you directly. Check it out and respond.";
    squirrelActions = [{ label: "📩 Job Offers", href: "/dashboard/job-offers", variant: "default" }];
  } else if (myOffer && myOffer.status === "declined") {
    squirrelMood = "neutral";
    squirrelNote = "You declined the offer for this task.\nNo worries — more opportunities await on the Browse page!";
    squirrelActions = [{ label: "🔍 Browse Tasks", href: "/browse", variant: "outline" }];
  } else if (isBuyer) {
    squirrelMood = "neutral";
    if (taskOpen) {
      squirrelNote = `📋 You posted this task.\nYou have ${appCountView} applicant${appCountView !== 1 ? "s" : ""} so far. Review them in the Applicants tab.`;
    } else {
      squirrelNote = `📋 You posted this task. It's now ${task.status}.\nReview your applicants or manage your contracts.`;
    }
    squirrelActions = [
      { label: "👥 Applicants", href: `/dashboard/tasks/${taskId}/applicants`, variant: "default" },
      { label: "📋 My Tasks", href: "/dashboard/tasks", variant: "outline" },
    ];
  } else if (isPureBuyer) {
    squirrelMood = "neutral";
    squirrelNote = "Hello! You can also post a task and get your job done.";
    squirrelActions = [{ label: "📝 Post a Task", href: "/dashboard/tasks/new", variant: "default" }];
  } else if (!isInEmployeeMode && isBothMode) {
    squirrelMood = "neutral";
    squirrelNote = "Switch to employee mode in the header to apply for this task!";
  } else if (!hasEmployeeRole) {
    squirrelMood = "neutral";
    squirrelNote = "Only employees can apply. Want to become an employee? Update your role in settings.";
  } else if (myApp) {
    const appStatus = myApp.status;
    if (appStatus === "hired") {
      squirrelMood = "happy";
      squirrelNote = "🎉 You've been hired! Check your contracts to start working.";
      squirrelActions = [{ label: "📄 View Contract", href: `/dashboard/contracts/${contractId ?? ""}`, variant: "success" }];
    } else if (appStatus === "shortlisted") {
      squirrelMood = "excited";
      squirrelNote = "👀 You're shortlisted! The buyer will reach out soon.";
      squirrelActions = [{ label: "📋 My Applications", href: "/dashboard/applications", variant: "default" }];
    } else if (appStatus === "withdrawn") {
      squirrelMood = "neutral";
      squirrelNote = "You withdrew your application.\nIf you change your mind, you can re-apply.";
      squirrelActions = [{ label: "🔍 Browse Tasks", href: "/browse", variant: "outline" }];
    } else {
      squirrelMood = "happy";
      squirrelNote = "✅ You've applied! Fingers crossed 🤞\nThe buyer will review your application soon.";
      squirrelActions = [{ label: "📋 My Applications", href: "/dashboard/applications", variant: "default" }];
    }
  } else if (taskOpen && applyCtx) {
    if (applyCtx.paused) {
      squirrelMood = "neutral";
      squirrelNote = applyCtx.blockedReason ?? "Your applications are paused.\nContact support to unpause.";
    } else if (applyCtx.hasSkill && applyCtx.canApply) {
      squirrelMood = "excited";
      const skills = applyCtx.matchedSkills.length > 0 ? applyCtx.matchedSkills.slice(0, 3).join(", ") : "";
      squirrelNote = `Task is Open, Apply fast! 🎯\nYou have verified skills in ${skills ? skills + " " : "this area"} — buyers love that!`;
      squirrelActions = [{ label: "📝 Apply Now", href: `#apply`, variant: "default" }];
    } else if (!applyCtx.hasSkill && applyCtx.canApply) {
      squirrelMood = "worried";
      squirrelNote = "Skills does not match. Apply at your own risk.\nBuyers prefer verified skills — consider getting verified!";
      squirrelActions = [{ label: "📝 Apply Anyway", href: `#apply`, variant: "outline" }];
    } else if (!applyCtx.canApply) {
      squirrelMood = "neutral";
      squirrelNote = applyCtx.blockedReason ?? "Your profile needs some work before you can apply.";
    } else {
      squirrelMood = "neutral";
      squirrelNote = "You can apply for this task!\nFill in a cover note to stand out from the crowd.";
      squirrelActions = [{ label: "📝 Apply Now", href: `#apply`, variant: "default" }];
    }
  } else if (!taskOpen && hasEmployeeRole) {
    squirrelMood = "sad";
    squirrelNote = "This task is now closed. 😔\nDon't worry — there are plenty more opportunities on the Browse page!";
    squirrelActions = [{ label: "🔍 Browse Tasks", href: "/browse", variant: "default" }];
  } else {
    squirrelMood = "neutral";
    squirrelNote = "Welcome! I'm HiVR Squirrel 🐿️\nYour guide to finding work on HiVR.";
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
                taskStatus={task.status}
                taskDeadline={task.deadline}
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
          <div className="flex flex-col gap-6 md:flex-row md:items-stretch md:justify-between">
            <div className="flex-1 min-w-0 flex flex-col">
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
              <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl lg:text-4xl" data-tour="browse-detail-header">
                {task.title}
              </h1>

              {/* Skills required chips */}
              {getSkills(task).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {getSkills(task).map((s: string) => (
                    <Badge key={s} variant="secondary" className="text-xs">
                      <Sparkles className="mr-1 h-3 w-3 text-primary" />{s}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Buyer line + mascot (beside each other) */}
              <div className="mt-4 flex items-start justify-between gap-4">
                <div className="flex items-center gap-2 text-sm shrink-0">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Posted by</span>
                  <Avatar className="h-5 w-5">
                    <AvatarImage src={buyerUser?.avatar_url ?? undefined} />
                    <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
                  </Avatar>
                  <span className="font-semibold">{buyerUser?.full_name ?? "Anonymous buyer"}</span>
                  <Badge variant="success" className="text-[10px]">Verified</Badge>
                </div>
                <div className="shrink-0">
<DraggableSquirrel
                panelHeight={90}
                mood={squirrelMood}
                message={squirrelNote}
                task={{
                  id: task.id,
                  title: task.title,
                  description: task.description,
                  pricing_model: task.pricing_model,
                  budget_min: task.budget_min,
                  budget_max: task.budget_max,
                  deadline: task.deadline ?? null,
                  category_name: (task as any).category?.name ?? undefined,
                  skills_required: (task as any).skills_required ?? [],
                  status: task.status,
                  deliverables: getDeliverables(task).join(", ") || null,
                  buyer_name: buyerUser?.full_name ?? undefined,
                }}
                applicantCount={appCountView}
                isOwnTask={isBuyer}
                actions={squirrelActions}
              />
                </div>
              </div>

              {/* Key stats row */}
              <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatPill Icon={DollarSign} label="Budget" value={`${formatPaise(task.budget_min)}–${formatPaise(task.budget_max)}`} />
                <StatPill Icon={Clock} label="Duration" value={(task as any).estimated_hours ? `~${(task as any).estimated_hours} ${(task as any).category?.tier === "role_engagement" ? "days" : "hrs"}` : "Flexible"} />
                <StatPill Icon={Users} label="Applicants" value={String(appsCount)} hint={shortlisted > 0 ? `${shortlisted} shortlisted` : undefined} />
                <StatPill Icon={Briefcase} label="Openings" value={String((task as any).openings ?? 1)} hint={String((task as any).openings ?? 1) === "1" ? undefined : `${(task as any).openings ?? 1} hires`} />
              </div>

              {/* Deliverables list below stats */}
              {getDeliverables(task).length > 0 && (
                <div className="mt-4 rounded-xl border bg-card p-4">
                  <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    Deliverables
                  </h3>
                  <ul className="space-y-1">
                    {getDeliverables(task).map((d, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs">
                        <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Overview / Q&A / Applicants tabs inside left panel */}
              <div className="mt-6">
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
                    deliverables: getDeliverables(task),
                    skills_required: (task as any).skills_required ?? [],
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

            {/* RIGHT SIDEBAR — sticky on desktop */}
            <div className="md:w-72 shrink-0 md:self-start apply-cta-panel space-y-4">
              {/* OFFER CARD */}
              <div className="rounded-xl border bg-card p-5 shadow-sm">
                {task.status !== "open" && (
                  <div className="mb-3 inline-flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1 text-[11px] font-medium text-destructive">
                    <Clock className="h-3 w-3" />
                    {task.status === "closed" && (Number(hired) >= Number((task as any).openings || 1) ? "Closed (filled)" : "Closed (expired)")}
                    {task.status === "cancelled" && "Cancelled"}
                    {task.status === "in_contract" && "In contract"}
                    {task.status === "upcoming" && "Upcoming"}
                  </div>
                )}
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Offer</div>
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

                {task.deadline && (
                  <DeadlineDisplay deadline={task.deadline as any} status={task.status} />
                )}

                {hasInteractions ? (
                  <div className="mt-4 space-y-2">
                    <TaskActions
                      taskId={taskId}
                      taskStatus={task.status}
                      taskDeadline={task.deadline}
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

                {isBuyer && (
                  <BuyerTaskControls
                    taskId={taskId}
                    initialDeadline={task.deadline as any}
                    status={(task as any).status}
                    appsCount={appsCount}
                  />
                )}
              </div>

              {/* Stats row */}
              <div className="rounded-xl border bg-card p-4">
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
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

              {/* SKILLS REQUIRED */}
              {getSkills(task).length > 0 && (
                <div className="rounded-xl border bg-card p-4">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Briefcase className="h-3.5 w-3.5" />
                    Skills required
                  </h3>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {getSkills(task).map((s: string) => (
                      <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Important dates */}
              <div className="rounded-xl border bg-card p-4">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  Important dates
                </div>
                <div className="mt-3 space-y-1.5 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">Posted</span><span className="font-medium">{timeAgo(task.created_at)}</span></div>
                  {task.deadline && <div className="flex justify-between"><span className="text-muted-foreground">Deadline</span><span className="font-medium">{new Date(task.deadline).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span></div>}
                  {(task as any).estimated_hours != null && <div className="flex justify-between"><span className="text-muted-foreground">Est. time</span><span className="font-medium">~{(task as any).estimated_hours} {(task as any).category?.tier === "role_engagement" ? "days" : "hrs"}</span></div>}
                </div>
              </div>
            </div>
          </div>
        </div>
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

function getSkills(task: any): string[] {
  const explicit: string[] = (task as any).skills_required ?? [];
  if (explicit.length > 0) return explicit;
  const text = ((task.title ?? "") + " " + (task.description ?? "")).toLowerCase();
  const candidates = [
    "Excel", "Spreadsheets", "Python", "JavaScript", "TypeScript", "React", "Node.js",
    "SQL", "Postgres", "REST APIs", "Data analysis", "Machine learning", "NLP",
    "Frontend", "Backend", "DevOps", "Docker", "Kubernetes", "AWS", "GCP", "Azure",
    "Teaching", "Mentoring", "Translation", "Writing", "Design", "Figma", "Video editing",
  ];
  return candidates.filter((c) => text.includes(c.toLowerCase())).slice(0, 6);
}

function getDeliverables(task: any): string[] {
  const brief = task?.brief;
  if (!brief || typeof brief !== "object") return [];
  const items: any[] = (brief as any).checklist_items;
  if (!Array.isArray(items)) return [];
  return items.map((i: any) => i?.text ?? "").filter(Boolean);
}

async function checkInteractionsTable(sb: ReturnType<typeof createClient>): Promise<boolean> {
  try {
    const r = await sb.from("task_applications").select("id", { count: "exact", head: true }).limit(1);
    return !r.error;
  } catch {
    return false;
  }
}
