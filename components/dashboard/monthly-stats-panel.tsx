"use client";

/**
 * components/dashboard/monthly-stats-panel.tsx
 *
 * Animated, role-aware monthly stats panel shown ABOVE the HiVR
 * wallet. For buyers it shows: tasks posted, employees hired, contracts
 * signed, points earned (lifetime + last-30-days). For employees it
 * shows: contracts completed, earnings (last 30d + lifetime), average
 * rating, points earned, jobs hired.
 *
 * Uses an in-house SVG bar/line chart with a CSS keyframe reveal — no
 * external chart library. Realtime updates via Supabase postgres_changes
 * on the relevant tables.
 */
import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Briefcase, Wallet, Star, Hammer, CheckCircle2, Users, TrendingUp, Award, ListChecks,
  Send, IndianRupee, Calendar, ChevronRight, Activity,
} from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatINR, cn } from "@/lib/utils";

type Day = { day: string; value: number; paise?: number };
type ActivityDay = { day: string; tasks: number; contracts: number };

type Role = "buyer" | "employee" | "both";

type Props = {
  userId: string;
  role: Role;
  // Initial numbers pulled server-side. The component re-fetches
  // when the relevant tables change via realtime.
  initial: {
    // Common
    pointsBalance: number;
    pointsLast30d: number;
    // Buyer
    tasksPostedLast30d: number;
    tasksCompletedLast30d: number;
    contractsSignedLast30d: number;
    uniqueEmployeesHiredLast30d: number;
    totalSpentLast30dPaise: number;
    // Employee
    contractsCompletedLast30d: number;
    contractsActive: number;
    earningsLast30dPaise: number;
    lifetimeEarningsPaise: number;
    avgRating: number;
    totalReviews: number;
    // Time series (last 30 days)
    buyerActivitySeries: ActivityDay[]; // tasks posted + contracts signed per day
    employeeActivitySeries: Day[]; // contracts completed per day
    earningsSeries: Day[]; // paise earned per day
    spendSeries: Day[]; // paise spent per day
  };
};

export function MonthlyStatsPanel({ userId, role, initial }: Props) {
  const [stats, setStats] = React.useState(initial);
  // Keep client state in sync with server-rendered initial data so
  // router.refresh() / re-renders pick up fresh server values instead
  // of being stuck on the first-render snapshot.
  React.useEffect(() => {
    setStats(initial);
  }, [initial]);
  const sbRef = React.useRef<ReturnType<typeof createClient> | null>(null);

  React.useEffect(() => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const ch = sb
      .channel(`monthly-stats-${userId}`)
      // Buyer
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "task_posts", filter: `buyer_id=eq.${userId}` }, () => refresh())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "contracts", filter: `buyer_id=eq.${userId}` }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "loyalty_points" }, () => refresh())
      // Employee
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "contracts", filter: `employee_id=eq.${userId}` }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "wallet_transactions" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "reviews", filter: `reviewer_id=eq.${userId}` }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "reviews", filter: `reviewee_id=eq.${userId}` }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "employee_profiles", filter: `user_id=eq.${userId}` }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "user_wallets", filter: `user_id=eq.${userId}` }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "workspaces", filter: `buyer_id=eq.${userId}` }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "workspaces", filter: `employee_id=eq.${userId}` }, () => refresh())
      .subscribe();
    return () => { sb.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function refresh() {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60_000).toISOString();

    // Run queries in parallel. We grab a fresh window every time the
    // relevant table mutates. We cast to `any` because the Supabase
    // generated types don't always include the joined columns we use
    // (e.g. `contract.buyer_id`).
    const [tasks, contracts, payments, reviews, employeeProfile, loyalty, walletTxns, allEscrow] = (await Promise.all([
      sb.from("task_posts").select("id, created_at, status").eq("buyer_id", userId).gte("created_at", thirtyDaysAgo),
      sb.from("contracts").select("id, status, started_at, completed_at, buyer_id, employee_id, agreed_price, task_post_id").or(`buyer_id.eq.${userId},employee_id.eq.${userId}`).or(`started_at.gte.${thirtyDaysAgo},completed_at.gte.${thirtyDaysAgo}`),
      sb.from("payments").select("id, amount, status, created_at, contract:contracts(buyer_id)").gte("created_at", thirtyDaysAgo),
      sb.from("reviews").select("id, rating, reviewee_id, created_at").eq("reviewee_id", userId).gte("created_at", thirtyDaysAgo),
      sb.from("employee_profiles").select("lifetime_earnings, avg_rating, total_reviews, lifetime_tasks_completed").eq("user_id", userId).maybeSingle(),
      sb.from("loyalty_points").select("points_balance").eq("employee_id", userId).maybeSingle(),
      // Real per-day escrow_release credits to this user (= their actual
      // earnings per day). We never estimate or divide a lifetime number.
      sb.from("wallet_transactions").select("amount_paise, kind, created_at").eq("user_id", userId).eq("kind", "escrow_release").gte("created_at", thirtyDaysAgo),
      // All-time escrow releases for lifetime earnings (not cached employee_profiles)
      sb.from("wallet_transactions").select("amount_paise").eq("user_id", userId).eq("kind", "escrow_release"),
    ])) as any;

    const tasksArr: any[] = (tasks as any).data ?? [];
    const contractsArr: any[] = (contracts as any).data ?? [];
    const paymentsArr: any[] = (payments as any).data ?? [];
    const reviewsArr: any[] = (reviews as any).data ?? [];
    const epRow: any = (employeeProfile as any).data;
    const loyaltyRow: any = (loyalty as any).data;
    const walletTxnArr: any[] = (walletTxns as any).data ?? [];
    const allEscrowArr: any[] = (allEscrow as any).data ?? [];

    // Wallet-funded escrows (workspaces table) — user's buyer contracts
    const buyerContractIds = contractsArr
      .filter((c: any) => c.buyer_id === userId)
      .map((c: any) => c.id);
    const { data: fundedWsArr } = buyerContractIds.length > 0
      ? await sb.from("workspaces").select("contract_id, escrow_amount_paise, created_at")
          .in("contract_id", buyerContractIds).eq("escrow_funded", true)
      : { data: [] };

    // Recompute aggregates
    const tasksPosted = tasksArr.length;
    const tasksCompleted = tasksArr.filter((t) => t.status === "completed").length;
    const contractsSigned = contractsArr.length;
    const uniqueEmployeesHired = new Set(
      contractsArr.filter((c) => c.buyer_id === userId).map((c) => c.employee_id)
    ).size;
    const contractsCompletedEmp = contractsArr.filter(
      (c) => c.employee_id === userId && c.status === "completed"
    ).length;
    const contractsActive = contractsArr.filter(
      (c) => (c.buyer_id === userId || c.employee_id === userId) && c.status === "active"
    ).length;
    const totalSpentPaise = paymentsArr
      .filter((p) => (p.contract as any)?.buyer_id === userId && (p.status === "captured" || p.status === "released"))
      .reduce((s, p) => s + Number(p.amount ?? 0), 0)
      + ((fundedWsArr ?? []) as any[]).reduce((s: number, w: any) => s + Number(w.escrow_amount_paise ?? 0), 0);

    // Real per-day earnings from escrow_release credits on the user's
    // own wallet_transactions table. Each row = one credit on one day.
    // If the user has no credits in the window, the chart shows real
    // zeros (no fabrication).
    const earningsDays: Day[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60_000);
      earningsDays.push({ day: d.toISOString().slice(0, 10), value: 0 });
    }
    const earningsIdx = new Map(earningsDays.map((d, i) => [d.day, i]));
    let earningsLast30dPaise = 0;
    for (const t of walletTxnArr) {
      if (!t.created_at) continue;
      const day = t.created_at.slice(0, 10);
      const i = earningsIdx.get(day);
      if (i == null) continue;
      const amt = Number(t.amount_paise ?? 0);
      earningsDays[i].value = (earningsDays[i].value ?? 0) + amt;
      earningsLast30dPaise += amt;
    }
    const lifetimeEarningsPaise = allEscrowArr.length > 0
      ? allEscrowArr.reduce((s: number, r: any) => s + Number(r.amount_paise ?? 0), 0)
      : Number(epRow?.lifetime_earnings ?? 0);
    const avgRating = Number(epRow?.avg_rating ?? 0);
    const totalReviews = Number(epRow?.total_reviews ?? 0);
    const pointsBalance = Number(loyaltyRow?.points_balance ?? 0);
    const pointsLast30d = Number(loyaltyRow?.points_balance ?? 0);

    // Rebuild the per-day series. 30 days inclusive.
    const days: Day[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60_000);
      days.push({ day: d.toISOString().slice(0, 10), value: 0 });
    }
    const idx = new Map(days.map((d, i) => [d.day, i]));

    const buyerActivitySeries: ActivityDay[] = days.map((d) => ({ day: d.day, tasks: 0, contracts: 0 }));
    for (const t of tasksArr) {
      const day = t.created_at?.slice(0, 10);
      const i = day ? idx.get(day) : undefined;
      if (i != null) buyerActivitySeries[i].tasks += 1;
    }
    for (const c of contractsArr) {
      const day = c.started_at?.slice(0, 10);
      const i = day ? idx.get(day) : undefined;
      if (i != null) buyerActivitySeries[i].contracts += 1;
    }

    const employeeActivitySeries = days.map((d) => ({ ...d }));
    for (const c of contractsArr) {
      if (c.employee_id !== userId) continue;
      const day = c.completed_at?.slice(0, 10) ?? c.started_at?.slice(0, 10);
      const i = day ? idx.get(day) : undefined;
      if (i != null) employeeActivitySeries[i].value += 1;
    }

    const spendSeries = days.map((d) => ({ ...d, paise: 0 }));
    for (const p of paymentsArr) {
      if ((p.contract as any)?.buyer_id !== userId) continue;
      const day = p.created_at?.slice(0, 10);
      const i = day ? idx.get(day) : undefined;
      if (i != null) spendSeries[i].paise = (spendSeries[i].paise ?? 0) + Number(p.amount ?? 0);
    }
    for (const w of (fundedWsArr ?? []) as any[]) {
      const day = w.created_at?.slice(0, 10);
      const i = day ? idx.get(day) : undefined;
      if (i != null) spendSeries[i].paise = (spendSeries[i].paise ?? 0) + Number(w.escrow_amount_paise ?? 0);
    }

    setStats((s) => ({
      ...s,
      tasksPostedLast30d: tasksPosted,
      tasksCompletedLast30d: tasksCompleted,
      contractsSignedLast30d: contractsSigned,
      uniqueEmployeesHiredLast30d: uniqueEmployeesHired,
      totalSpentLast30dPaise: totalSpentPaise,
      contractsCompletedLast30d: contractsCompletedEmp,
      contractsActive,
      earningsLast30dPaise,
      lifetimeEarningsPaise,
      avgRating,
      totalReviews,
      pointsBalance,
      pointsLast30d,
      buyerActivitySeries,
      employeeActivitySeries,
      earningsSeries: earningsDays as any,
      spendSeries,
    }));
    void reviewsArr;
  }

  return (
    <div className="space-y-4">
      {role === "employee" || role === "both" ? <EmployeeStatsBlock stats={stats} /> : null}
      {role === "buyer" || role === "both" ? <BuyerStatsBlock stats={stats} /> : null}
    </div>
  );
}

/* =============================================================================
   Buyer stats block
   ============================================================================= */
function BuyerStatsBlock({ stats }: { stats: Props["initial"] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Hammer className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Your hiring activity · last 30 days</CardTitle>
          </div>
          <Badge variant="outline" className="text-[10px] uppercase">Buyer</Badge>
        </div>
        <CardDescription>Tasks posted, employees hired, contracts signed, points earned.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            icon={ListChecks}
            label="Tasks posted"
            value={String(stats.tasksPostedLast30d)}
            sub={`${stats.tasksCompletedLast30d} completed`}
            accent="primary"
          />
          <StatTile
            icon={Users}
            label="Employees hired"
            value={String(stats.uniqueEmployeesHiredLast30d)}
            sub="unique freelancers"
            accent="info"
          />
          <StatTile
            icon={Briefcase}
            label="Contracts signed"
            value={String(stats.contractsSignedLast30d)}
            sub="last 30d"
            accent="success"
          />
          <StatTile
            icon={Award}
            label="Points earned"
            value={String(stats.pointsLast30d)}
            sub={`Balance ${stats.pointsBalance}`}
            accent="amber"
          />
        </div>
        <div>
          <SectionLabel>Activity · last 30 days</SectionLabel>
          <StackedBarChart data={stats.buyerActivitySeries} />
          <div className="mt-1 flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-primary" /> Tasks</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-emerald-500" /> Contracts</span>
          </div>
        </div>
        <div className="mt-3 rounded-lg border border-dashed bg-muted/20 p-3 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total spent · last 30 days</p>
          <p className="mt-1 font-display text-2xl font-bold tabular-nums">{formatINR(Math.round(stats.totalSpentLast30dPaise / 100))}</p>
          <p className="text-[10px] text-muted-foreground">Captured + released payments.</p>
        </div>
      </CardContent>
    </Card>
  );
}

/* =============================================================================
   Employee stats block
   ============================================================================= */
function EmployeeStatsBlock({ stats }: { stats: Props["initial"] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-success" />
            <CardTitle className="text-base">Your work activity · last 30 days</CardTitle>
          </div>
          <Badge variant="outline" className="text-[10px] uppercase">Employee</Badge>
        </div>
        <CardDescription>Contracts completed, earnings, ratings, points earned.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            icon={CheckCircle2}
            label="Contracts completed"
            value={String(stats.contractsCompletedLast30d)}
            sub={`${stats.contractsActive} active`}
            accent="success"
          />
          <StatTile
            icon={IndianRupee}
            label="Earnings · 30d"
            value={formatINR(Math.round(stats.earningsLast30dPaise / 100))}
            sub={`Lifetime ${formatINR(Math.round(stats.lifetimeEarningsPaise / 100))}`}
            accent="emerald"
          />
          <StatTile
            icon={Star}
            label="Avg rating"
            value={stats.avgRating > 0 ? stats.avgRating.toFixed(2) : "—"}
            sub={`${stats.totalReviews} reviews`}
            accent="amber"
          />
          <StatTile
            icon={Award}
            label="Points earned"
            value={String(stats.pointsLast30d)}
            sub={`Balance ${stats.pointsBalance}`}
            accent="primary"
          />
        </div>
        <div>
          <SectionLabel>Contracts · last 30 days</SectionLabel>
          <BarChart data={stats.employeeActivitySeries} />
          <p className="mt-1 text-[10px] text-muted-foreground">Contracts completed per day.</p>
        </div>
      </CardContent>
    </Card>
  );
}

/* =============================================================================
   Reusable bits
   ============================================================================= */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{children}</p>;
}

function SpendPill({ paise }: { paise: number }) {
  return (
    <p className="mb-1 font-display text-2xl font-semibold tabular-nums">
      {formatINR(Math.round(paise / 100))}
    </p>
  );
}

function StatTile({
  icon: Icon, label, value, sub, accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  accent: "primary" | "success" | "info" | "amber" | "emerald";
}) {
  const map: Record<string, string> = {
    primary: "from-primary/15 to-primary/5 text-primary",
    success: "from-emerald-500/15 to-emerald-500/5 text-emerald-600",
    info:    "from-sky-500/15 to-sky-500/5 text-sky-600",
    amber:   "from-amber-500/15 to-amber-500/5 text-amber-600",
    emerald: "from-emerald-500/15 to-emerald-500/5 text-emerald-600",
  };
  return (
    <div className={cn("relative overflow-hidden rounded-lg border bg-gradient-to-br p-3", map[accent])}>
      <div className="flex items-center justify-between text-[10px] uppercase text-muted-foreground">
        <span>{label}</span>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="mt-1 font-display text-xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
      <div className="pointer-events-none absolute -bottom-4 -right-4 h-12 w-12 rounded-full bg-current opacity-[0.04] blur-xl" />
    </div>
  );
}

/* =============================================================================
   Bar chart (30 days)
   ============================================================================= */
function BarChart({ data }: { data: Day[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const [hoverIdx, setHoverIdx] = React.useState<number | null>(null);
  return (
    <div className="relative flex h-20 w-full items-end gap-px">
      {data.map((d, i) => {
        const h = Math.max(2, (d.value / max) * 78);
        const isHovered = hoverIdx === i;
        return (
          <div key={d.day} className="relative flex-1">
            {isHovered && (
              <div className="absolute -top-9 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-[10px] font-medium text-popover-foreground shadow-md">
                {d.value} · {d.day.slice(5)}
              </div>
            )}
            <div
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              className="stat-bar rounded-t bg-primary/70 hover:bg-primary hover:shadow-lg hover:scale-105 transition-all cursor-pointer"
              style={{ height: `${h}px`, animationDelay: `${(i % 30) * 12}ms` }}
            />
          </div>
        );
      })}
      <style jsx>{`
        .stat-bar {
          transform-origin: center bottom;
          animation: barRise 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes barRise {
          0%   { transform: scaleY(0); opacity: 0; }
          100% { transform: scaleY(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

/* =============================================================================
   Stacked bar chart — two-colored (tasks + contracts)
   ============================================================================= */
function StackedBarChart({ data }: { data: ActivityDay[] }) {
  const max = Math.max(1, ...data.map((d) => d.tasks + d.contracts));
  const [hoverIdx, setHoverIdx] = React.useState<number | null>(null);
  return (
    <div className="relative flex h-20 w-full items-end gap-px">
      {data.map((d, i) => {
        const tasksH = Math.max(1, (d.tasks / max) * 78);
        const contractsH = Math.max(1, (d.contracts / max) * 78);
        const isHovered = hoverIdx === i;
        return (
          <div key={d.day} className="relative flex-1">
            {isHovered && (
              <div className="absolute -top-9 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-[10px] font-medium text-popover-foreground shadow-md">
                {d.tasks} tasks · {d.contracts} contracts · {d.day.slice(5)}
              </div>
            )}
            <div
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              className="relative w-full cursor-pointer"
              style={{ height: `${tasksH + contractsH}px` }}
            >
              <div
                className="absolute bottom-0 left-0 right-0 rounded-t bg-emerald-500/80 hover:bg-emerald-500 transition-all"
                style={{ height: `${contractsH}px`, animationDelay: `${(i % 30) * 12}ms` }}
              />
              <div
                className="absolute bottom-0 left-0 right-0 rounded-t bg-primary/70 hover:bg-primary transition-all"
                style={{ height: `${tasksH}px`, animationDelay: `${(i % 30) * 12}ms` }}
              />
            </div>
          </div>
        );
      })}
      <style jsx>{`
        div > div > div {
          transform-origin: center bottom;
          animation: barRise 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes barRise {
          0%   { transform: scaleY(0); opacity: 0; }
          100% { transform: scaleY(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

/* =============================================================================
   Line / area chart (30 days)
   ============================================================================= */
function LineChart({
  data, valueKey, color,
}: { data: any[]; valueKey: string; color: string }) {
  const W = 320;
  const H = 90;
  const max = Math.max(1, ...data.map((d) => Number(d[valueKey] ?? 0)));
  const xFor = (i: number) => 4 + (i / Math.max(1, data.length - 1)) * (W - 8);
  const yFor = (v: number) => 4 + (H - 8) - (v / max) * (H - 8);

  const pts = data.map((d, i) => `${xFor(i)},${yFor(Number(d[valueKey] ?? 0))}`).join(" ");
  const areaPts = [
    `${xFor(0)},${H - 2}`,
    ...data.map((d, i) => `${xFor(i)},${yFor(Number(d[valueKey] ?? 0))}`),
    `${xFor(data.length - 1)},${H - 2}`,
  ].join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`lc-grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polyline
        points={areaPts}
        fill={`url(#lc-grad-${color.replace("#", "")})`}
        className="line-area-reveal"
      />
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        className="line-stroke-reveal"
      />
      <style jsx>{`
        .line-stroke-reveal {
          stroke-dasharray: 1000;
          stroke-dashoffset: 1000;
          animation: lineDraw 1.2s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .line-area-reveal {
          transform-origin: center bottom;
          animation: areaRise 0.9s cubic-bezier(0.22, 1, 0.36, 1) 0.2s both;
        }
        @keyframes lineDraw {
          to { stroke-dashoffset: 0; }
        }
        @keyframes areaRise {
          0%   { transform: scaleY(0); opacity: 0; }
          100% { transform: scaleY(1); opacity: 1; }
        }
      `}</style>
    </svg>
  );
}
