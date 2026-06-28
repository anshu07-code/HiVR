import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Briefcase, Clock, Users, ArrowRight, SearchX, Inbox, ChevronRight, Sparkles,
} from "lucide-react";
import { formatINR, timeAgo } from "@/lib/utils";
import { CategoryIcon } from "@/components/marketing/category-icon";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Status = "open" | "in_contract" | "closed" | "cancelled";

const STATUS_META: Record<Status, { label: string; tone: string; dot: string; live: boolean }> = {
  open:        { label: "Open",        tone: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", dot: "bg-emerald-500",       live: true  },
  in_contract: { label: "In contract", tone: "bg-sky-500/10 text-sky-600 border-sky-500/20",           dot: "bg-sky-500",           live: true  },
  closed:      { label: "Closed",      tone: "bg-muted text-muted-foreground border-border",            dot: "bg-muted-foreground", live: false },
  cancelled:   { label: "Cancelled",   tone: "bg-rose-500/10 text-rose-600 border-rose-500/20",         dot: "bg-rose-500",          live: false },
};

const PRICING_LABEL: Record<string, string> = {
  hourly: "per hour",
  daily: "per day",
  daily_rate: "per day",
  monthly: "per month",
  fixed: "fixed",
  fixed_milestone: "per milestone",
};

export default async function MyTasks() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;

  // Fetch tasks with their categories. We do the application counts in a
  // follow-up query so we can show "N applicants" on each card. We pull
  // only counts, not the full rows.
  const { data: tasks } = await sb
    .from("task_posts")
    .select("id, title, description, status, pricing_model, budget_min, budget_max, created_at, deadline, estimated_hours, category:skill_categories(name, icon, tier)")
    .eq("buyer_id", user.id)
    .order("created_at", { ascending: false });

  const taskList = (tasks ?? []) as any[];
  const taskIds = taskList.map((t) => t.id);

  // Try to count applications. We have to guard for the table being
  // missing (pre-0023 install) the same way the browse detail page does.
  let applicantsByTask: Record<string, number> = {};
  if (taskIds.length > 0) {
    const probe = await sb
      .from("task_applications")
      .select("id", { count: "exact", head: true })
      .in("task_id", taskIds.slice(0, 1));
    if (!probe.error) {
      const { data: apps } = await sb
        .from("task_applications")
        .select("task_id")
        .in("task_id", taskIds);
      for (const row of apps ?? []) {
        applicantsByTask[(row as any).task_id] = (applicantsByTask[(row as any).task_id] ?? 0) + 1;
      }
    }
  }

  // Quick stats.
  const openCount = taskList.filter((t) => t.status === "open").length;
  const inContractCount = taskList.filter((t) => t.status === "in_contract").length;
  const totalApplicants = Object.values(applicantsByTask).reduce((s, n) => s + n, 0);

  return (
    <div className="container max-w-6xl space-y-6 py-8">
      {/* ======== HEADER ======== */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-3xl font-semibold tracking-tight">My posted tasks</h1>
            <Badge variant="secondary" className="font-mono text-[10px]">{taskList.length}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Track applicants, status, and budget across every task you've posted.
          </p>
        </div>
        <Button asChild variant="gradient" size="sm">
          <Link href="/dashboard/post">
            <Plus className="h-4 w-4" />
            Post a new task
          </Link>
        </Button>
      </header>

      {/* ======== STATS ======== */}
      {taskList.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Open"        value={openCount}        tone="emerald" />
          <StatTile label="In contract" value={inContractCount}  tone="sky"     />
          <StatTile label="Applicants"  value={totalApplicants}  tone="primary" />
        </div>
      )}

      {/* ======== LIST ======== */}
      {taskList.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {taskList.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              applicantCount={applicantsByTask[t.id] ?? 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Task card                                                         */
/* ------------------------------------------------------------------ */

function TaskCard({ task, applicantCount }: { task: any; applicantCount: number }) {
  const meta = STATUS_META[task.status as Status] ?? STATUS_META.open;
  const tier = task.category?.tier === "role_engagement" ? "B" : "A";
  const pricing = PRICING_LABEL[task.pricing_model] ?? task.pricing_model;
  const min = Math.round((task.budget_min ?? 0) / 100);
  const max = Math.round((task.budget_max ?? 0) / 100);
  const sameRange = min === max;
  const budgetText = sameRange
    ? formatINR(min)
    : `${formatINR(min)} – ${formatINR(max)}`;

  return (
    <div className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-2xl">
      <Card className="h-full transition-all duration-200 hover:border-primary/40 hover:shadow-md group-hover:bg-accent/30">
        <CardContent className="space-y-4 p-5">
          {/* Top row: title + LIVE pill */}
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="flex items-start gap-2 line-clamp-2 font-semibold leading-tight">
                <CategoryIcon name={task.category?.icon ?? ""} className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <Link href={`/browse/${task.id}`} className="hover:text-primary">{task.title}</Link>
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {task.category?.name ?? "Uncategorised"} · {timeAgo(task.created_at)}
              </p>
            </div>
            {meta.live && (
              <span className="relative inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </span>
                Live
              </span>
            )}
          </div>

          {/* Description preview */}
          <p className="line-clamp-2 text-sm text-muted-foreground">{task.description}</p>

          {/* Metric strip */}
          <div className="grid grid-cols-3 gap-2 rounded-xl border bg-muted/30 p-3 text-center">
            <Metric
              icon={<Sparkles className="h-3.5 w-3.5" />}
              label="Budget"
              value={budgetText}
              hint={pricing}
            />
            <div className="border-x">
              <Metric
                icon={<Users className="h-3.5 w-3.5" />}
                label="Applicants"
                value={String(applicantCount)}
                hint={applicantCount === 0 ? "none yet" : applicantCount === 1 ? "candidate" : "candidates"}
              />
            </div>
            <Metric
              icon={<Clock className="h-3.5 w-3.5" />}
              label="Tier"
              value={`Tier ${tier}`}
              hint={tier === "A" ? "Micro-task" : "Role engagement"}
            />
          </div>

          {/* Footer: status + actions */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium ${meta.tone}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
              {meta.label}
            </span>
            <div className="flex items-center gap-1.5">
              <Button asChild size="sm" variant="outline" className="h-7 text-[11px]">
                <Link href={`/browse/${task.id}`}>View</Link>
              </Button>
              <Button asChild size="sm" variant={applicantCount > 0 ? "gradient" : "outline"} className="h-7 text-[11px]">
                <Link href={`/dashboard/tasks/${task.id}/applicants`}>
                  <Users className="h-3 w-3" />
                  Applicants · {applicantCount}
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="space-y-0.5 px-1">
      <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="font-display text-sm font-semibold leading-tight">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Empty state                                                       */
/* ------------------------------------------------------------------ */

function EmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
          <Inbox className="h-7 w-7" />
        </div>
        <div>
          <p className="font-display text-lg font-semibold">You haven't posted any tasks yet</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Post a task to start receiving applications from verified people across India.
          </p>
        </div>
        <Button asChild variant="gradient" className="mt-2">
          <Link href="/dashboard/post">
            <Plus className="h-4 w-4" />
            Post your first task
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Stat tile                                                         */
/* ------------------------------------------------------------------ */

function StatTile({ label, value, tone }: { label: string; value: number; tone: "emerald" | "sky" | "primary" }) {
  const toneClass =
    tone === "emerald" ? "text-emerald-600" :
    tone === "sky"     ? "text-sky-600"     :
                         "text-primary";
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  );
}
