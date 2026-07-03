import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ArrowLeft, Users, CheckCircle2, XCircle, Clock, Sparkles,
  MapPin, Star, Briefcase, FileText, IndianRupee, MessageSquare, ChevronRight,
} from "lucide-react";
import { formatPaise, timeAgo } from "@/lib/utils";
import { ApplicantsBoard } from "./applicants-board";
import { ApplicantsRealtime } from "./realtime";
import { InstantHireSection } from "@/components/applicants/instant-hire-section";
import { OfferStatusCard } from "@/components/applicants/offer-status-card";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TaskApplicantsPage({ params, searchParams }: { params: { id: string }; searchParams: { settleAppId?: string } }) {
  noStore();
  const sb = createClient();
  const taskId = params.id;
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect(`/auth/signin?next=/dashboard/tasks/${taskId}/applicants`);

  // Fetch the task
  const { data: task } = await sb
    .from("task_posts")
    .select("id, title, description, pricing_model, budget_min, budget_max, status, deadline, skills_required, created_at, category:skill_categories(name, icon, tier)")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) notFound();

  // Only the buyer can see the applicants panel
  if ((task as any).buyer_id !== user.id) {
    // Defensive: re-check via explicit buyer_id field below
  }
  const { data: ownerCheck } = await sb
    .from("task_posts")
    .select("buyer_id")
    .eq("id", taskId)
    .maybeSingle();
  if ((ownerCheck as any)?.buyer_id !== user.id) {
    return (
      <div className="container max-w-3xl py-8">
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            You can only see applicants for tasks you posted.
          </CardContent>
        </Card>
      </div>
    );
  }

  // Fetch all applications with the full employee profile, employee skills,
  // and verifications. Split into multiple small queries (no big embedded
  // joins) so a single RLS hiccup doesn't take down the whole payload.
  const { data: appsBase, error: appErr } = await sb
    .from("task_applications")
    .select("id, cover_note, bid_paise, status, created_at, updated_at, hiring_stage, hiring_stage_history, hiring_notes, hiring_stage_updated_at, employee_id")
    .eq("task_id", taskId)
    .neq("hiring_stage", "withdrawn")
    .order("created_at", { ascending: false });

  // Fetch employee standing rates for this task's category to compute bargain prices
  const taskCategoryId = (task as any).category_id;
  const taskPricingModel = (task as any).pricing_model ?? "fixed";

  let apps: any[] = [];
  if (!appErr && appsBase && appsBase.length > 0) {
    const empIds = Array.from(new Set(appsBase.map((a: any) => a.employee_id).filter(Boolean)));
    const [{ data: emps }, { data: profiles }, { data: skills }, { data: verifs }, { data: standingRates }] = await Promise.all([
      sb.from("users").select("id, full_name, avatar_url, current_mode").in("id", empIds),
      sb.from("employee_profiles").select("user_id, bio, languages, location, experience_type, overall_trust_tier, lifetime_earnings, completion_rate, avg_rating, total_reviews").in("user_id", empIds),
      sb.from("employee_skills").select("employee_id, verification_status, current_wage_band_min, current_wage_band_max, category:skill_categories(name, slug)").in("employee_id", empIds),
      sb.from("verifications").select("user_id, doc_type, status, purpose, metadata").in("user_id", empIds).eq("status", "verified"),
      sb.from("employee_standing_rates").select("user_id, rate_per_hour_paise, rate_per_task_paise, rate_per_day_paise, rate_per_week_paise").in("user_id", empIds).eq("category_id", taskCategoryId),
    ]);
    const empMap = new Map((emps ?? []).map((e: any) => [e.id, e]));
    const profMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));
    const skillsByUser = new Map<string, any[]>();
    for (const s of skills ?? []) {
      const arr = skillsByUser.get((s as any).employee_id) ?? [];
      arr.push(s);
      skillsByUser.set((s as any).employee_id, arr);
    }
    const verifsByUser = new Map<string, any[]>();
    for (const v of verifs ?? []) {
      const arr = verifsByUser.get((v as any).user_id) ?? [];
      arr.push(v);
      verifsByUser.set((v as any).user_id, arr);
    }
    const ratesMap = new Map((standingRates ?? []).map((r: any) => [r.user_id, r]));

    apps = (appsBase as any[]).map((a) => {
      const rate = ratesMap.get(a.employee_id);
      let effectiveRatePaise: number | null = null;
      if (rate) {
        effectiveRatePaise =
          taskPricingModel === "hourly" ? rate.rate_per_hour_paise :
          taskPricingModel === "fixed" ? rate.rate_per_task_paise :
          taskPricingModel === "daily" ? rate.rate_per_day_paise :
          rate.rate_per_week_paise ?? null;
      }
      return {
        ...a,
        employee_rate_paise: effectiveRatePaise, // full rate for this pricing model
        bargain_min_paise: effectiveRatePaise ? Math.floor(effectiveRatePaise * 0.8) : null, // floor for bargaining
        employee: empMap.get(a.employee_id) ?? null,
        employee_profile: profMap.get(a.employee_id) ?? null,
        skills: skillsByUser.get(a.employee_id) ?? [],
        verifications: verifsByUser.get(a.employee_id) ?? [],
      };
    });
  }

  // Quick stats
  const total = apps.length;
  const pending = apps.filter(a => a.status === "pending").length;
  const shortlisted = apps.filter(a => a.status === "shortlisted").length;
  const interviewing = apps.filter(a => a.status === "interviewing").length;
  const hired = apps.find(a => a.status === "hired");
  const rejected = apps.filter(a => a.status === "rejected").length;

  // Look up the contract id for the workspace CTA (lazy).
  let contractId: string | null = null;
  if (hired) {
    const { data: c } = await sb.from("contracts").select("id").eq("task_post_id", taskId).order("started_at", { ascending: false }).limit(1).maybeSingle();
    contractId = (c as any)?.id ?? null;
  }

  return (
    <div className="container max-w-6xl space-y-6 py-8">
      {/* Header */}
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2">
          <Link href="/dashboard/tasks">
            <ArrowLeft className="h-3.5 w-3.5" />
            All my tasks
          </Link>
        </Button>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Applicants</h1>
            <p className="mt-1 text-sm text-muted-foreground line-clamp-1">{task.title}</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={`/browse/${taskId}`}>
              <ExternalIcon /> View public task page
            </Link>
          </Button>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Total"     value={total}        tone="default" />
        <StatTile label="Pending"   value={pending}      tone="amber" />
        <StatTile label="Shortlisted" value={shortlisted} tone="primary" />
        <StatTile label="Interview" value={interviewing} tone="sky" />
      </div>

      {hired && (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <p className="font-semibold text-emerald-700">Hired: {hired.employee?.full_name ?? "an applicant"}</p>
              <p className="mt-0.5 text-xs text-emerald-700/80">
                The task is now in contract. Coordinate delivery through the personalised workspace.
              </p>
            </div>
          </div>
          {contractId ? (
            <Button asChild variant="gradient" size="sm">
              <Link href={`/dashboard/contracts/${contractId}`}>
                Open workspace
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          ) : null}
        </div>
      )}

      {/* Applicants board */}
      <ApplicantsRealtime taskId={taskId} />
      {!hired && (task as any).status !== "closed" && (task as any).status !== "cancelled" && (
        <InstantHireSection
          taskId={taskId}
          categoryId={(task as any).category_id}
          tier={((task as any).category?.tier ?? "micro_task") as "micro_task" | "role_engagement"}
          buyerId={user.id}
          taskStatus={(task as any).status}
        />
      )}
      <OfferStatusCard taskId={taskId} currentUserId={user.id} boundPct={0.2} />
      <ApplicantsBoard
        taskId={taskId}
        taskStatus={(task as any).status}
        applicants={apps}
        taskBudgetMin={(task as any).budget_min}
        taskBudgetMax={(task as any).budget_max}
        taskTier={(task as any).category?.tier ?? "micro_task"}
        currentUserId={user.id}
        buyerId={user.id}
        taskPricingModel={(task as any).pricing_model ?? "fixed"}
        estimatedHours={(task as any).estimated_hours ?? null}
        taskTitle={task.title}
        settleAppId={searchParams.settleAppId}
      />
    </div>
  );
}

function StatTile({ label, value, tone }: { label: string; value: number; tone: "default" | "amber" | "primary" | "sky" }) {
  const cls = tone === "amber" ? "text-amber-600" :
              tone === "primary" ? "text-primary" :
              tone === "sky" ? "text-sky-600" :
              "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`mt-1 font-display text-2xl font-semibold tabular-nums ${cls}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function ExternalIcon() {
  return <span className="ml-1 text-xs">↗</span>;
}
