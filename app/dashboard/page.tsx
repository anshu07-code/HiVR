import Link from "next/link";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { Badge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";

import { Wallet, Briefcase, Award, TrendingUp, ShieldCheck, Star, ArrowRight, ListChecks, FileText, MessageSquare, Plus, Users, Clock, CheckCircle2, AlertCircle, Sparkles, Hammer, UserSearch, EyeOff, IndianRupee, Trophy } from "lucide-react";

import { formatPaise, formatINR, timeAgo } from "@/lib/utils";

import { WalletSection } from "@/components/wallet-section";

import { RealtimeActivityPanel, type Activity } from "@/components/dashboard/realtime-activity-panel";

import { MonthlyStatsPanel } from "@/components/dashboard/monthly-stats-panel";

import { ModeSwitcher } from "./mode-switcher";
import { AvailabilitySwitcher } from "./availability-switcher";

import { AnonymousRequestButton } from "@/components/dashboard/anonymous-request-button";

import { RecentContracts } from "@/components/dashboard/recent-contracts";

import { ActiveContractsRealtime } from "@/components/dashboard/active-contracts-realtime";

import { WalletTransactionsList } from "@/components/dashboard/wallet-transactions-list";

import { PaymentNotificationBanner } from "@/components/dashboard/payment-notification-banner";

import { RealtimeDashboardRefresh } from "@/components/dashboard/realtime-dashboard-refresh";

import { PremiumDashboard } from "@/components/dashboard/premium-dashboard";

export const dynamic = "force-dynamic";

type Mode = "employee" | "buyer" | "both";

export default async function DashboardHome() {

  const sb = createClient();

  let user = null;

  try {

    const res = await sb.auth.getUser();

    user = res.data.user;

  } catch {

    // fallback if token refresh races with middleware

  }

  if (!user) redirect("/auth/signin?next=/dashboard");

  // Direct parallel queries (11 SELECTs). We tried the

  // get_dashboard_summary RPC for performance but it silently

  // returned empty data when the function wasn't deployed or

  // had a stale signature, which made the dashboard look like

  // the user's data was gone. Direct queries always work and

  // PostgREST runs them in parallel anyway, so the latency hit

  // is negligible.

  const [

    { data: me },

    { data: ep },

    { data: bp },

    { data: contracts },

    { data: skills },

    { data: points },

    { data: tasksPosted },

    { data: verifications },

    { data: reviewsGiven },

    { data: pendingContracts },

    { data: anonymousProfile },

    { data: wallet },

    { data: walletTransactions },

    { data: allEscrowReleases },

    { data: workspaces },

    { data: education },

    { data: experience },

    { data: projects },

    { data: certifications },

    { data: resumeRow },

    { data: socialLinks },

  ] = await Promise.all([

    sb.from("users").select("id, full_name, current_mode, roles, last_active, avatar_url, email, phone, phone_verified").eq("id", user.id).maybeSingle(),

    sb.from("employee_profiles").select("*").eq("user_id", user.id).maybeSingle(),

    sb.from("buyer_profiles").select("buyer_type, kyc_completed, kyc_required_above, company_name").eq("user_id", user.id).maybeSingle(),

    sb

      .from("contracts")

      .select(`

        id, status, agreed_price, category_id, started_at, approved_at, task_post_id,

        buyer_id, employee_id,

        task_post:task_posts(id, title),

        category:skill_categories(name),

        buyer:users!contracts_buyer_id_fkey(id, full_name),

        employee:users!contracts_employee_id_fkey(id, full_name)

      `)

      .or(`buyer_id.eq.${user.id},employee_id.eq.${user.id}`)

      .order("started_at", { ascending: false, nullsFirst: false })

      .limit(50),

    sb.from("employee_skills").select("*, category:skill_categories(name, icon)").eq("employee_id", user.id),

    sb.from("loyalty_points").select("*").eq("employee_id", user.id).maybeSingle(),

    sb

      .from("task_posts")

      .select("id, title, status, created_at, category:skill_categories(name)")

      .eq("buyer_id", user.id)

      .order("created_at", { ascending: false })

      .limit(50),

    sb.from("verifications").select("doc_type, purpose, status, metadata").eq("user_id", user.id),

    sb

      .from("reviews")

      .select("id, contract_id, reviewee_id, rating, comment, created_at, reviewee:users!reviews_reviewee_id_fkey(id, full_name)")

      .eq("reviewer_id", user.id)

      .order("created_at", { ascending: false })

      .limit(50),

    sb

      .from("contracts")

      .select("id, status, approved_at, task:task_posts(title)")

      .eq("status", "completed")

      .or(`buyer_id.eq.${user.id},employee_id.eq.${user.id}`)

      .order("approved_at", { ascending: false, nullsFirst: false })

      .limit(50),

    sb.from("anonymous_profiles").select("status, display_id").eq("user_id", user.id).maybeSingle(),

    sb.from("user_wallets").select("balance_paise").eq("user_id", user.id).maybeSingle(),

    sb.from("wallet_transactions")

      .select("id, amount_paise, kind, description, created_at")

      .eq("user_id", user.id)

      .order("created_at", { ascending: false })

      .limit(20),

    sb.from("wallet_transactions")

      .select("amount_paise")

      .eq("user_id", user.id)

      .eq("kind", "escrow_release"),

    sb

      .from("workspaces")

      .select("id, status, buyer_id, employee_id, contract_id")

      .or(`buyer_id.eq.${user.id},employee_id.eq.${user.id}`),

    sb.from("employee_education").select("id").eq("user_id", user.id),

    sb.from("employee_experience").select("id").eq("user_id", user.id),

    sb.from("employee_projects").select("id").eq("user_id", user.id),

    sb.from("employee_certifications").select("id").eq("user_id", user.id),

    sb.from("employee_resume").select("id").eq("user_id", user.id).maybeSingle(),

    sb.from("employee_social_links").select("id").eq("user_id", user.id),

  ]);

  const roles: string[] = (me?.roles as string[]) ?? [];

  const hasEmployee = roles.includes("employee");

  const hasBuyer = roles.includes("buyer");

  const isAdmin = roles.includes("admin");

  const currentMode: string | null = (me as any)?.current_mode ?? null;

  const mode: Mode = isAdmin

    ? "both"

    : currentMode && ["employee", "buyer", "both"].includes(currentMode)

      ? (currentMode as Mode)

      : hasEmployee && hasBuyer

        ? "both"

        : hasEmployee

          ? "employee"

          : "buyer";

  const name = (me?.full_name ?? "there").split(" ")[0];

  // Profile completeness for the employee CTA

  let profileCompleteness = 0;

  if (hasEmployee) {

    if ((me as any)?.full_name) profileCompleteness += 5;

    if ((me as any)?.avatar_url) profileCompleteness += 5;

    if (ep?.headline) profileCompleteness += 5;

    if (ep?.bio && (ep as any).bio.length > 20) profileCompleteness += 10;

    if ((ep as any)?.location) profileCompleteness += 5;

    if ((ep as any)?.availability_hours) profileCompleteness += 5;

    if ((skills ?? []).length >= 1) profileCompleteness += 15;

    if ((skills ?? []).length >= 3) profileCompleteness += 5;

    if ((education ?? []).length > 0) profileCompleteness += 10;

    if ((experience ?? []).length > 0) profileCompleteness += 10;

    if ((projects ?? []).length > 0) profileCompleteness += 10;

    if ((certifications ?? []).length > 0) profileCompleteness += 5;

    if (resumeRow) profileCompleteness += 5;

    if ((socialLinks ?? []).length > 0) profileCompleteness += 5;

    profileCompleteness = Math.min(100, profileCompleteness);

  }

  // Re-fetch payments filtered by the user's own contracts (not all payments)

  const contractIds = (contracts ?? []).map((c: any) => c.id);

  const userPayments = contractIds.length > 0

    ? (await sb

        .from("payments")

        .select("id, amount, status, created_at, contract_id, contract:contracts(id, buyer_id, employee_id, task:task_posts(title))")

        .in("contract_id", contractIds)

        .order("created_at", { ascending: false })

        .limit(100)

      ).data ?? []

    : [];

  const payments = userPayments;

  // Fetch workspaces linked to the user's BUYER contracts for escrow-funded amounts

  // —  only count escrows where the user funded them (is the buyer)

  const buyerContractIds = (contracts ?? [])

    .filter((c: any) => c.buyer_id === user.id)

    .map((c: any) => c.id);

  const { data: fundedWorkspaces } = buyerContractIds.length > 0

    ? await sb

        .from("workspaces")

        .select("id, contract_id, escrow_amount_paise, created_at")

        .in("contract_id", buyerContractIds)

        .eq("escrow_funded", true)

    : { data: [] };

  // Real lifetime earnings from wallet_transactions (not cached employee_profiles)

  const lifetimeEarningsFromWallet = (allEscrowReleases ?? []).reduce(

    (s: number, r: any) => s + Number(r.amount_paise ?? 0),

    0

  );

  // ===========================================================================

  // PremiumDashboard data —  computed in the server component (NOT inline as

  // props, which would pass function values across the RSC boundary and crash).

  // ===========================================================================

  const pd = buildPremiumDashboardData({

    userId: user.id,

    fullName: name,

    mode,

    role: mode,

    contracts: contracts ?? [],

    workspaces: workspaces ?? [],

    tasksPosted: tasksPosted ?? [],

    payments: payments ?? [],

    fundedWorkspaces: fundedWorkspaces ?? [],

    walletTransactions: walletTransactions ?? [],

    wallet,

    ep,

    lifetimeEarningsFromWallet,

    profileCompleteness,

  });

  return (

    <RealtimeDashboardRefresh userId={user.id}>

    <div className="container max-w-6xl space-y-4 overflow-x-hidden px-3 sm:px-4 md:space-y-6 md:px-6 py-4 md:py-8">

      <div data-tour="dashboard-header" className="flex flex-col items-start gap-2 md:flex-row md:items-center md:ml-auto">

          {(mode === "employee" || mode === "both") && (
            <>
              <AnonymousRequestButton
                status={(anonymousProfile as any)?.status ?? "none"}
                displayId={(anonymousProfile as any)?.display_id}
              />
              <AvailabilitySwitcher
                userId={user.id}
                current={(ep as any)?.availability_status ?? "offline"}
              />
            </>
          )}

          <ModeSwitcher roles={roles} currentMode={me?.current_mode} />

        </div>

      

      {hasEmployee && profileCompleteness < 60 && (

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-500/40 bg-rose-500/5 p-4">

          <div className="flex items-center gap-3">

            <div className="grid h-10 w-10 place-items-center rounded-full bg-rose-500/15 text-rose-600">

              <AlertCircle className="h-4 w-4" />

            </div>

            <div>

              <p className="text-sm font-semibold text-rose-700">You can't apply to tasks until your profile is at least 60% complete</p>

              <p className="text-xs text-rose-700/80">

                Currently {profileCompleteness}% complete —  finish the basics, add skills with rates, and link a portfolio. This unlocks the apply button everywhere.

              </p>

            </div>

          </div>

          <Button asChild size="sm" variant="gradient">
        <Link href="/dashboard/profile">

              {profileCompleteness === 0 ? "Start building" : "Finish profile"}

              <ArrowRight className="h-3.5 w-3.5" />

            </Link>

          </Button>

        </div>

      )}

      {hasEmployee && profileCompleteness >= 60 && profileCompleteness < 80 && (

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">

          <div className="flex items-center gap-3">

            <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">

              <Sparkles className="h-4 w-4" />

            </div>

            <div>

              <p className="text-sm font-semibold">Profile ready —  you can apply to tasks!</p>

              <p className="text-xs text-muted-foreground">

                {profileCompleteness}% complete —  add a few more sections to stand out in <Link href="/find-people" className="text-primary hover:underline">Find people</Link>.

              </p>

            </div>

          </div>

          <Button asChild size="sm" variant="outline">
        <Link href="/dashboard/profile">Polish profile</Link>

          </Button>

        </div>

      )}

      <PremiumDashboard

        userId={user.id}

        fullName={name}

        mode={mode}

        role={mode}

        greeting={pd.greeting}

        kpis={pd.kpis}

        recent={pd.recent}

        quickActions={pd.quickActions}

        spendDaily={pd.spendDaily}

        earningsDaily={pd.earningsDaily}

        heatmap={pd.heatmap}

        level={pd.level}

      />

      <div data-tour="stats-panel">

        <MonthlyStatsPanel

          userId={user.id}

          role={mode}

          initial={await buildMonthlyStats({

            sb,

            userId: user.id,

            mode,

            contracts: contracts ?? [],

            tasksPosted: tasksPosted ?? [],

            payments: payments ?? [],

            ep,

            points,

            fundedWorkspaces: fundedWorkspaces ?? [],

          })}

        />

      </div>

      <div data-tour="activity-panel"><RealtimeActivityPanel

        userId={user.id}

        role={mode}

        initialActivity={await buildInitialActivity({

          userId: user.id,

          sb,

          mode,

          payments: payments ?? [],

          contracts: contracts ?? [],

          reviewsGiven: reviewsGiven ?? [],

        })}

        pendingReviewCount={countPendingReviews(pendingContracts ?? [], reviewsGiven ?? [])}

        initialCounts={{

          activeContracts: (contracts ?? []).filter((c: any) => c.status === "active").length,

          pendingApplications: 0,

          openOffers: 0,

          unreadMessages: 0,

          pendingReviews: countPendingReviews(pendingContracts ?? [], reviewsGiven ?? []),

        }}

      /></div>

      <WalletSection

        userFullName={me?.full_name ?? ""}

        userEmail={me?.email ?? ""}

        userPhone={me?.phone ?? ""}

      />

    </div>

    </RealtimeDashboardRefresh>

  );

}

/* ------------------------------------------------------------------ */

/*  Shared helpers                                                    */

/* ------------------------------------------------------------------ */

async function buildInitialActivity(opts: {

  userId: string;

  sb: ReturnType<typeof createClient>;

  mode: Mode;

  payments: any[];

  contracts: any[];

  reviewsGiven: any[];

}): Promise<Activity[]> {

  const { userId, sb, mode, payments, contracts, reviewsGiven } = opts;

  const showBuyer = mode === "buyer" || mode === "both";

  const showEmployee = mode === "employee" || mode === "both";

  const merged: Activity[] = [];

  // Pull a small slice of each side so the initial render is informative.

  const [appsEmp, offersEmp, appsBuyer, offersBuyer, tasksBuyer] = await Promise.all([

    showEmployee

      ? sb.from("task_applications").select("id, status, created_at, task:task_posts!inner(id, title, buyer_id)").eq("employee_id", userId).order("created_at", { ascending: false }).limit(5)

      : Promise.resolve({ data: [] as any[] }),

    showEmployee

      ? sb.from("application_offers").select("id, status, created_at, rate_paise, task:task_posts!inner(id, title)").eq("employee_id", userId).order("created_at", { ascending: false }).limit(5)

      : Promise.resolve({ data: [] as any[] }),

    showBuyer

      ? sb.from("task_applications").select("id, status, created_at, task:task_posts!inner(id, title, buyer_id), employee:users!task_applications_employee_id_fkey(id, full_name)").eq("task.buyer_id", userId).order("created_at", { ascending: false }).limit(5)

      : Promise.resolve({ data: [] as any[] }),

    showBuyer

      ? sb.from("application_offers").select("id, status, created_at, rate_paise, employee:users!application_offers_employee_id_fkey(id, full_name)").eq("buyer_id", userId).order("created_at", { ascending: false }).limit(5)

      : Promise.resolve({ data: [] as any[] }),

    showBuyer

      ? sb.from("task_posts").select("id, title, status, created_at, applications:task_applications(count)").eq("buyer_id", userId).order("created_at", { ascending: false }).limit(4)

      : Promise.resolve({ data: [] as any[] }),

  ]);

  if (showBuyer) {

    for (const a of (appsBuyer.data ?? []) as any[]) {

      merged.push({

        id: `app-${a.id}`,

        kind: "application",

        title: `${a.employee?.full_name ?? "Someone"} applied to "${a.task?.title ?? "your task"}"`,

        subtitle: `Status: ${a.status}`,

        href: `/dashboard/tasks/${a.task?.id}/applicants`,

        at: a.created_at,

        tone: a.status === "hired" ? "success" : "info",

        role: "buyer",

      });

    }

    for (const o of (offersBuyer.data ?? []) as any[]) {

      merged.push({

        id: `off-${o.id}`,

        kind: "offer",

        title: `Offer ${o.status} to ${o.employee?.full_name ?? "candidate"}  · ₹${Math.round((o.rate_paise ?? 0) / 100)}`,

        subtitle: "Application offer",

        href: "/dashboard/contracts",

        at: o.created_at,

        tone: o.status === "accepted" ? "success" : o.status === "declined" ? "warn" : "info",

        role: "buyer",

      });

    }

    for (const t of (tasksBuyer.data ?? []) as any[]) {

      const appsCount = (t.applications as any)?.[0]?.count ?? 0;

      if (appsCount === 0) continue;

      merged.push({

        id: `task-${t.id}`,

        kind: "task",

        title: `"${t.title}" · ${appsCount} application${appsCount === 1 ? "" : "s"}`,

        subtitle: "Interest on your post",

        href: `/dashboard/tasks/${t.id}/applicants`,

        at: t.created_at,

        tone: "info",

        role: "buyer",

      });

    }

  }

  if (showEmployee) {

    for (const a of (appsEmp.data ?? []) as any[]) {

      merged.push({

        id: `app-emp-${a.id}`,

        kind: "application",

        title: `You applied to "${a.task?.title ?? "a task"}"`,

        subtitle: `Status: ${a.status}`,

        href: "/dashboard/applications",

        at: a.created_at,

        tone: a.status === "hired" ? "success" : "info",

        role: "employee",

      });

    }

    for (const o of (offersEmp.data ?? []) as any[]) {

      merged.push({

        id: `off-emp-${o.id}`,

        kind: "offer",

        title: `Offer received  · ₹${Math.round((o.rate_paise ?? 0) / 100)} for "${o.task?.title ?? "task"}"`,

        subtitle: `Status: ${o.status}`,

        href: "/dashboard/applications",

        at: o.created_at,

        tone: o.status === "accepted" ? "success" : o.status === "declined" ? "warn" : "info",

        role: "employee",

      });

    }

  }

  for (const p of payments) {

    if (!p.contract) continue;

    merged.push({

      id: `pay-${p.id}`,

      kind: "payment",

      title: `Payment ${p.status}  · ₹${Math.round((p.amount ?? 0) / 100)}`,

      subtitle: p.contract.task?.title ?? "Payment",

      amount_paise: p.amount,

      href: "/dashboard/payments",

      at: p.created_at,

      tone: p.status === "failed" ? "warn" : p.status === "released" ? "success" : "info",

      role: "shared",

    });

  }

  for (const c of contracts) {

    if (c.status === "active") continue;

    merged.push({

      id: `con-${c.id}`,

      kind: "contract",

      title: `Contract ${c.status.replace("_", " ")}`,

      subtitle: `${c.task?.title ?? "Contract"}  · ₹${Math.round((c.agreed_price ?? 0) / 100)}`,

      amount_paise: c.agreed_price,

      href: `/dashboard/contracts/${c.id}`,

      at: c.started_at,

      tone: c.status === "completed" ? "success" : c.status === "cancelled" ? "warn" : "info",

      role: "shared",

    });

  }

  for (const r of reviewsGiven) {

    merged.push({

      id: `rv-${r.id}`,

      kind: "review",

      title: `You gave ${r.rating} to ${r.reviewee?.full_name ?? "counterparty"}`,

      subtitle: r.comment?.slice(0, 60) ?? " — ",

      href: "/dashboard/reviews",

      at: r.created_at,

      tone: "success",

      role: "shared",

    });

  }

  return merged

    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

    .slice(0, 12);

}

async function buildMonthlyStats(opts: {

  sb: ReturnType<typeof createClient>;

  userId: string;

  mode: Mode;

  contracts: any[];

  tasksPosted: any[];

  payments: any[];

  ep: any;

  points: any;

  fundedWorkspaces: any[];

}) {

  const { sb, userId, mode, contracts, tasksPosted, payments, ep, points, fundedWorkspaces } = opts;

  const now = new Date();

  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60_000).toISOString();

  // Pre-bucketed 30-day series

  const days: { day: string; value: number; paise?: number }[] = [];

  for (let i = 29; i >= 0; i--) {

    const d = new Date(now.getTime() - i * 24 * 60 * 60_000);

    days.push({ day: d.toISOString().slice(0, 10), value: 0, paise: 0 });

  }

  const dayIdx = new Map(days.map((d, i) => [d.day, i]));

  // Buyer series (tasks posted + contracts started per day)

  const buyerActivitySeries: { day: string; tasks: number; contracts: number }[] = days.map((d) => ({ day: d.day, tasks: 0, contracts: 0 }));

  for (const t of tasksPosted) {

    const day = t.created_at?.slice(0, 10);

    const i = day ? dayIdx.get(day) : undefined;

    if (i != null) buyerActivitySeries[i].tasks += 1;

  }

  for (const c of contracts) {

    const day = c.started_at?.slice(0, 10);

    const i = day ? dayIdx.get(day) : undefined;

    if (i != null) buyerActivitySeries[i].contracts += 1;

  }

  // Employee series (contracts completed per day)

  const employeeActivitySeries = days.map((d) => ({ ...d }));

  for (const c of contracts) {

    if (c.employee_id !== userId) continue;

    const day = c.completed_at?.slice(0, 10) ?? c.started_at?.slice(0, 10);

    const i = day ? dayIdx.get(day) : undefined;

    if (i != null) employeeActivitySeries[i].value += 1;

  }

  // Spend series (paise per day from payments + wallet-funded escrows)

  const spendSeries = days.map((d) => ({ day: d.day, paise: 0 }));

  for (const p of payments) {

    if ((p.contract as any)?.buyer_id !== userId) continue;

    if (p.status !== "captured" && p.status !== "released") continue;

    const day = p.created_at?.slice(0, 10);

    const i = day ? dayIdx.get(day) : undefined;

    if (i != null) spendSeries[i].paise += Number(p.amount ?? 0);

  }

  for (const w of fundedWorkspaces) {

    const day = w.created_at?.slice(0, 10);

    const i = day ? dayIdx.get(day) : undefined;

    if (i != null) spendSeries[i].paise = (spendSeries[i].paise ?? 0) + Number(w.escrow_amount_paise ?? 0);

  }

  // Real per-day earnings from this user's escrow_release transactions.

  // We never estimate or divide a lifetime number —  every chart point

  // is a real wallet_transactions row.

  const { data: walletTxnArr } = await (sb.from("wallet_transactions") as any)

    .select("amount_paise, kind, created_at")

    .eq("user_id", userId)

    .eq("kind", "escrow_release")

    .gte("created_at", thirtyDaysAgo);

  const earningsSeries = days.map((d) => ({ day: d.day, paise: 0 }));

  let earningsLast30dPaise = 0;

  for (const t of (walletTxnArr ?? []) as any[]) {

    if (!t.created_at) continue;

    const day = t.created_at.slice(0, 10);

    const i = dayIdx.get(day);

    if (i == null) continue;

    const amt = Number(t.amount_paise ?? 0);

    earningsSeries[i].paise += amt;

    earningsLast30dPaise += amt;

  }

  // Aggregates

  const tasksPostedLast30d = tasksPosted.filter((t) => new Date(t.created_at) >= new Date(thirtyDaysAgo)).length;

  const tasksCompletedLast30d = new Set(

    contracts.filter((c) => c.buyer_id === userId && c.status === "completed" && new Date(c.completed_at ?? c.started_at) >= new Date(thirtyDaysAgo)).map((c) => c.task_post_id)

  ).size;

  const contractsSignedLast30d = contracts.filter((c) => new Date(c.started_at ?? c.completed_at) >= new Date(thirtyDaysAgo)).length;

  const uniqueEmployeesHiredLast30d = new Set(

    contracts.filter((c) => c.buyer_id === userId && new Date(c.started_at ?? c.completed_at) >= new Date(thirtyDaysAgo)).map((c) => c.employee_id)

  ).size;

  const contractsCompletedLast30d = contracts.filter(

    (c) => c.employee_id === userId && c.status === "completed" && new Date(c.completed_at ?? c.started_at) >= new Date(thirtyDaysAgo)

  ).length;

  const contractsActive = contracts.filter((c) => c.status === "active" && (mode === "both" ? true : mode === "employee" ? c.employee_id === userId : c.buyer_id === userId)).length;

  const totalSpentLast30dPaise = spendSeries.reduce((s, d) => s + d.paise, 0);

  return {

    pointsBalance: Number(points?.points_balance ?? 0),

    pointsLast30d: Number(points?.points_balance ?? 0),

    tasksPostedLast30d,

    tasksCompletedLast30d,

    contractsSignedLast30d,

    uniqueEmployeesHiredLast30d,

    totalSpentLast30dPaise,

    contractsCompletedLast30d,

    contractsActive,

    earningsLast30dPaise,

    lifetimeEarningsPaise: Number(ep?.lifetime_earnings ?? 0),

    avgRating: Number(ep?.avg_rating ?? 0),

    totalReviews: Number(ep?.total_reviews ?? 0),

    buyerActivitySeries,

    employeeActivitySeries,

    earningsSeries,

    spendSeries,

  };

}

function countPendingReviews(pendingContracts: any[] | null, reviews: any[] | null): number {

  const reviewedIds = new Set((reviews ?? []).map((r: any) => r.contract_id));

  return (pendingContracts ?? []).filter((c: any) => !reviewedIds.has(c.id)).length;

}

/* ------------------------------------------------------------------ */

/*  PremiumDashboard data builder                                     */

/*                                                                    */

/*  Pure server-side function. Returns plain values (no JSX, no       */

/*  function references) so the result can be passed as props across  */

/*  the RSC boundary into the client PremiumDashboard component.    */

/* ------------------------------------------------------------------ */

type BuildPDInput = {

  userId: string;

  fullName: string;

  mode: Mode;

  role: "buyer" | "employee" | "both";

  contracts: any[];

  workspaces: any[];

  tasksPosted: any[];

  payments: any[];

  fundedWorkspaces: any[];

  walletTransactions: any[];

  wallet: any;

  ep: any;

  lifetimeEarningsFromWallet: number;

  profileCompleteness: number;

};

function buildPremiumDashboardData(input: BuildPDInput) {

  const {

    userId, fullName, mode, role, contracts, workspaces, tasksPosted,

    payments, fundedWorkspaces, walletTransactions, wallet, ep,

    lifetimeEarningsFromWallet, profileCompleteness,

  } = input;

  // Greeting

  const hour = new Date().getHours();

  const greetWord = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const greeting = {

    title: greetWord,

    subtitle:

      mode === "employee" ? "Here's what's happening with your work today."

      : mode === "buyer"    ? "Here's what's happening with your posted tasks today."

      : "Here's a unified view of your buyer + employee activity.",

    tag: mode === "employee" ? "Employee" : mode === "buyer" ? "Buyer" : "Buyer + Employee",

  };

  // Lifetime numbers

  const lifetime = lifetimeEarningsFromWallet > 0 ? lifetimeEarningsFromWallet : Number(ep?.lifetime_earnings ?? 0);

  const walletBalance = Number(wallet?.balance_paise ?? 0);

  const walletPending = Number(wallet?.pending_paise ?? 0);

  const totalSpent = (fundedWorkspaces ?? []).reduce(

    (s: number, w: any) => s + Number(w.escrow_amount_paise ?? 0), 0

  ) + (payments ?? []).filter((p: any) => ["captured", "released"].includes(p.status))

      .reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);

  const completedContractCount = contracts.filter((c: any) => c.status === "completed").length;

  const activeContractCount = contracts.filter((c: any) => c.status === "active").length;

  const totalReviews = Number(ep?.total_reviews ?? 0);

  const lifetimeInr = lifetime / 100;

  // Tier / level

  const xp = Math.floor(lifetimeInr * 10) + completedContractCount * 50 + totalReviews * 10;

  const tiers: Array<{ name: string; min: number }> = [

    { name: "Starter",   min: 0 },

    { name: "Active",    min: 500 },

    { name: "Trusted",   min: 2000 },

    { name: "Pro",       min: 5000 },

    { name: "Top Rated", min: 12000 },

  ];

  let idx = 0;

  for (let i = tiers.length - 1; i >= 0; i--) { if (xp >= tiers[i].min) { idx = i; break; } }

  const cur = tiers[idx];

  const nxt = tiers[Math.min(idx + 1, tiers.length - 1)];

  const progressPct = nxt.min === cur.min

    ? 100

    : Math.min(100, Math.max(0, ((xp - cur.min) / (nxt.min - cur.min)) * 100));

  const level = {

    name: cur.name,

    tier: cur.name,

    progressPct,

    nextTier: nxt.name,

    xpToNext: Math.max(0, nxt.min - xp),

    xp,

  };

  // KPIs (per mode)

  const kpis = mode === "buyer" ? [

    { label: "Open tasks",        value: String((tasksPosted ?? []).filter((t: any) => t.status === "open").length), hint: `${tasksPosted?.length ?? 0} total`, icon: "ListChecks",   accent: "primary" as const },

    { label: "Active contracts",  value: String(activeContractCount), hint: `${completedContractCount} completed`, icon: "Briefcase", accent: "emerald" as const, trend: activeContractCount > 0 ? "up" as const : "flat" as const, delta: activeContractCount > 0 ? 12 : 0 },

    { label: "Total spent",       value: formatPaise(totalSpent),    hint: "lifetime", icon: "IndianRupee", accent: "amber" as const },

    { label: "Escrow in flight",  value: String((fundedWorkspaces ?? []).filter((w: any) => w.escrow_funded).length), hint: "awaiting delivery", icon: "ShieldCheck", accent: "sky" as const },

    { label: "Open applications", value: String((tasksPosted ?? []).filter((t: any) => (t.applications as any)?.[0]?.count > 0).length), hint: "across your tasks", icon: "FileText", accent: "purple" as const },

    { label: "Avg response",      value: "< 2h",                     hint: "to applications", icon: "Clock", accent: "primary" as const },

  ] : mode === "employee" ? [

    { label: "Active contracts",  value: String(activeContractCount),         hint: `${completedContractCount} completed`, icon: "Briefcase",   accent: "primary" as const },

    { label: "Active workspaces", value: String((workspaces ?? []).filter((w: any) => w.employee_id === userId && !["completed", "cancelled"].includes(w.status)).length), hint: "in flight", icon: "Hammer", accent: "emerald" as const },

    { label: "Earnings",          value: formatPaise(lifetime),                hint: "lifetime after fees", icon: "IndianRupee", accent: "sky" as const },

    { label: "Wallet",            value: formatPaise(walletBalance),           hint: walletPending > 0 ? `${formatPaise(walletPending)} pending` : "withdrawable", icon: "Wallet", accent: "emerald" as const },

    { label: "Rating",            value: Number(ep?.avg_rating ?? 0).toFixed(2) || " — ", hint: `${totalReviews} reviews`, icon: "Star", accent: "amber" as const },

    { label: "Level",             value: cur.name, hint: `${xp} XP · ${Math.max(0, nxt.min - xp)} to ${nxt.name}`, icon: "Trophy", accent: "purple" as const },

  ] : [

    { label: "Active contracts",  value: String(activeContractCount),         hint: `${completedContractCount} completed`, icon: "Briefcase",   accent: "primary" as const },

    { label: "Open tasks",        value: String((tasksPosted ?? []).filter((t: any) => t.status === "open").length), hint: `${tasksPosted?.length ?? 0} total`, icon: "ListChecks", accent: "sky" as const },

    { label: "Earnings",          value: formatPaise(lifetime),                hint: "as employee", icon: "IndianRupee", accent: "emerald" as const },

    { label: "Total spent",       value: formatPaise(totalSpent),              hint: "as buyer", icon: "Wallet",     accent: "amber" as const },

    { label: "Wallet",            value: formatPaise(walletBalance),           hint: walletPending > 0 ? `${formatPaise(walletPending)} pending` : "ready", icon: "ShieldCheck", accent: "purple" as const },

    { label: "Level",             value: cur.name, hint: `${xp} XP · ${Math.max(0, nxt.min - xp)} to ${nxt.name}`, icon: "Trophy", accent: "purple" as const },

  ];

  // Recent activity (last 10)

  const recent: any[] = [];

  for (const c of contracts.slice(0, 5) as any[]) {

    const isBuyer = c.buyer_id === userId;

    const cp = isBuyer ? c.employee?.full_name ?? "Employee" : c.buyer?.full_name ?? "Buyer";

    recent.push({

      id: `c-${c.id}`,

      icon: isBuyer ? "Hammer" : "UserSearch",

      iconAccent: c.status === "completed" ? "emerald" : c.status === "active" ? "primary" : c.status === "delivered" ? "amber" : "rose",

      title: `${(c.task_post?.title ?? "Task")} · ${c.status.replace("_", " ")}`,

      subtitle: `with ${cp}`,

      href: `/dashboard/contracts/${c.id}`,

      at: c.started_at,

    });

  }

  for (const wt of (walletTransactions ?? []).slice(0, 8) as any[]) {

    const isCredit = wt.kind === "escrow_release" || Number(wt.amount_paise ?? 0) > 0;

    recent.push({

      id: `w-${wt.id}`,

      icon: isCredit ? "TrendingUp" : "ArrowRight",

      iconAccent: isCredit ? "emerald" : "rose",

      title: wt.description ?? (wt.kind === "escrow_release" ? "Payment released" : wt.kind),

      subtitle: wt.kind,

      amountPaise: Number(wt.amount_paise ?? 0) * (isCredit ? 1 : -1),

      href: "/dashboard/payments",

      at: wt.created_at,

    });

  }

  for (const fw of (fundedWorkspaces ?? []).slice(0, 3) as any[]) {

    recent.push({

      id: `fw-${fw.id}`,

      icon: "ShieldCheck",

      iconAccent: "primary",

      title: "Escrow funded",

      subtitle: `Workspace ${fw.id.slice(0, 8)}`,

      amountPaise: Number(fw.escrow_amount_paise ?? 0),

      href: `/dashboard/workspaces/${fw.id}`,

      at: fw.created_at,

    });

  }

  recent.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  // Quick actions

  const quickActions = mode === "buyer" ? [

    { label: "Post a new task",   description: "List a task and start receiving applications", href: "/dashboard/post",   icon: "Plus",       accent: "primary" as const },

    { label: "Find freelancers",  description: "Search verified pros across all categories",   href: "/find-people",      icon: "UserSearch", accent: "sky" as const },

    { label: "My applications",   description: `${(tasksPosted ?? []).filter((t: any) => (t.applications as any)?.[0]?.count > 0).length} active posts with applicants`, href: "/dashboard/contracts", icon: "FileText",   accent: "emerald" as const, badge: "applications" },

    { label: "Add money",         description: "Top up wallet via Razorpay to fund escrows instantly", href: "/dashboard/payments",  icon: "Wallet",     accent: "amber" as const },

  ] : mode === "employee" ? [

    { label: "Find work",         description: "Browse open tasks across all categories",         href: "/browse",            icon: "ListChecks", accent: "primary" as const },

    { label: "My applications",   description: "Track every application you've sent",             href: "/dashboard/applications", icon: "FileText",  accent: "sky" as const },

    { label: "Improve profile",   description: `Profile ${profileCompleteness}% complete —  finish to unlock apply buttons`, href: "/dashboard/profile",   icon: "UserSearch", accent: "emerald" as const, badge: `${profileCompleteness}%` },

    { label: "Take a skill test", description: "Pass tests to unlock more categories",           href: "/dashboard/skills",    icon: "Award",     accent: "amber" as const },

  ] : [

    { label: "Post a task",       description: "List a new task as a buyer",                      href: "/dashboard/post",     icon: "Plus",       accent: "primary" as const },

    { label: "Find work",         description: "Browse open tasks as an employee",                 href: "/browse",            icon: "ListChecks", accent: "emerald" as const },

    { label: "Find people",       description: "Search verified freelancers",                     href: "/find-people",       icon: "UserSearch", accent: "sky" as const },

    { label: "Wallet",            description: "Top up, withdraw, or view transactions",          href: "/dashboard/payments",  icon: "Wallet",     accent: "amber" as const },

  ];

  // Daily charts (30 days) — always compute both spend and earnings

  const spendDaily: any[] = [];
  const earningsDaily: any[] = [];

  for (let i = 29; i >= 0; i--) {

    const d = new Date(Date.now() - i * 86400000);

    const day = d.toISOString().slice(0, 10);

    spendDaily.push({ day, paise: 0 });
    earningsDaily.push({ day, paise: 0 });

  }

  // Spend: funded workspaces + payments (buyer role always)
  for (const fw of (fundedWorkspaces ?? []) as any[]) {

    const day = ((fw.created_at as string) ?? "").slice(0, 10);

    if (!day) continue;

    const b = spendDaily.find((x) => x.day === day);

    if (b) b.paise += Number(fw.escrow_amount_paise ?? 0);

  }

  for (const p of (payments ?? []) as any[]) {

    if (!["captured", "released", "in_escrow"].includes(p.status)) continue;

    const day = ((p.created_at as string) ?? "").slice(0, 10);

    if (!day) continue;

    const b = spendDaily.find((x) => x.day === day);

    if (b) b.paise += Number(p.amount ?? 0);

  }

  // Earnings: wallet escrow_releases (employee role always)
  for (const wt of (walletTransactions ?? []) as any[]) {

    if (wt.kind !== "escrow_release") continue;

    const day = ((wt.created_at as string) ?? "").slice(0, 10);

    if (!day) continue;

    const b = earningsDaily.find((x) => x.day === day);

    if (b) b.paise += Number(wt.amount_paise ?? 0);

  }

  // Heatmap (90 days)

  const heatmap: any[] = [];

  const buyerCounts = new Map<string, number>();
  const employeeCounts = new Map<string, number>();

  for (const c of (contracts ?? []) as any[]) {

    const day = ((c.started_at as string) ?? "").slice(0, 10);

    if (!day) continue;

    if (c.buyer_id === userId) buyerCounts.set(day, (buyerCounts.get(day) ?? 0) + 1);
    if (c.employee_id === userId) employeeCounts.set(day, (employeeCounts.get(day) ?? 0) + 1);

  }

  for (const wt of (walletTransactions ?? []) as any[]) {

    const day = ((wt.created_at as string) ?? "").slice(0, 10);

    if (!day) continue;

    employeeCounts.set(day, (employeeCounts.get(day) ?? 0) + 1);

  }

  for (const fw of (fundedWorkspaces ?? []) as any[]) {

    const day = ((fw.created_at as string) ?? "").slice(0, 10);

    if (!day) continue;

    buyerCounts.set(day, (buyerCounts.get(day) ?? 0) + 1);

  }

  for (let i = 89; i >= 0; i--) {

    const d = new Date(Date.now() - i * 86400000);

    const day = d.toISOString().slice(0, 10);

    const bv = buyerCounts.get(day) ?? 0;
    const ev = employeeCounts.get(day) ?? 0;
    heatmap.push({ date: day, value: bv + ev, buyerValue: bv, employeeValue: ev, hint: "events" });

  }

  return {

    greeting,

    kpis,

    recent: recent.slice(0, 10),

    quickActions,

    spendDaily,

    earningsDaily,

    heatmap,

    level,

  };

}

function KpiCard({ Icon, label, value, hint, accent }: { Icon: React.ComponentType<{ className?: string }>; label: string; value: string; hint?: string; accent?: "primary" | "success" | "warning" | "sky" }) {

  const accentColor = accent === "primary" ? "text-primary"

    : accent === "success" ? "text-emerald-600"

    : accent === "warning" ? "text-amber-600"

    : accent === "sky" ? "text-sky-600"

    : "text-muted-foreground";

  return (

    <Card>

      <CardContent className="p-5">

        <div className="flex items-center justify-between">

          <span className="text-xs uppercase text-muted-foreground">{label}</span>

          <Icon className={`h-4 w-4 ${accentColor}`} />

        </div>

        <div className={`mt-2 font-display text-2xl font-semibold ${accent === "sky" ? "text-sky-700" : ""}`}>{value}</div>

        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}

      </CardContent>

    </Card>

  );

}

function VerificationRow({ label, status, hint }: { label: string; status: "verified" | "pending" | "missing"; hint?: string }) {

  const Icon = status === "verified" ? CheckCircle2 : status === "pending" ? Clock : AlertCircle;

  const color = status === "verified" ? "text-success" : status === "pending" ? "text-warning" : "text-muted-foreground";

  return (

    <div className="flex items-center justify-between text-sm">

      <div className="flex items-center gap-2">

        <Icon className={`h-4 w-4 ${color}`} />

        <span>{label}</span>

      </div>

      {status === "verified" ? <Badge variant="success" className="capitalize">Verified</Badge>

        : status === "pending" ? <Badge variant="warning" className="capitalize">Pending</Badge>

          : hint ? <span className="text-xs text-muted-foreground">{hint}</span> : <Badge variant="outline">Not started</Badge>}

    </div>

  );

}

function verificationStatus(rows: any[] | undefined, kind: string, purpose?: "employee" | "buyer"): "verified" | "pending" | "missing" {

  const r = (rows ?? []).find((v: any) => v.doc_type === kind && (!purpose || v.purpose === purpose));

  if (!r) return "missing";

  if (r.status === "verified" || r.status === "approved") return "verified";

  if (r.status === "pending" || r.status === "submitted") return "pending";

  return "missing";

}

/* ------------------------------------------------------------------ */

/*  Employee view                                                     */

/* ------------------------------------------------------------------ */

function EmployeeHome({ contracts, workspaces, ep, skills, points, verifications, currentUserId, wallet, walletTransactions, lifetimeFromWallet }: any) {

  const active = contracts.filter((c: any) => c.status === "active").length;

  const activeWorkspaces = (workspaces ?? []).filter((w: any) => w.employee_id === currentUserId && !["completed", "cancelled", "disputed"].includes(w.status)).length;

  const lifetime = lifetimeFromWallet > 0 ? lifetimeFromWallet : ((ep as any)?.lifetime_earnings ?? 0);

  const paused = !!ep?.application_paused;

  const permanent = !!ep?.permanent_ban;

  const ladderStep = (ep as any)?.pause_ladder_step ?? 0;

  const pauseCount = (ep as any)?.pause_count ?? 0;

  const disputeLossCount = ep?.dispute_loss_count ?? 0;

  // Cooldown hint for the banner.

  const cooldownDays = ladderStep === 1 ? 7 : ladderStep === 2 ? 30 : ladderStep === 3 ? 90 : 0;

  const lastPause = (ep as any)?.last_pause_at ?? (ep as any)?.application_paused_at;

  const daysRemaining = lastPause && cooldownDays > 0

    ? Math.max(0, Math.ceil((new Date(lastPause).getTime() + cooldownDays * 86400000 - Date.now()) / 86400000))

    : 0;

  return (

    <>

      {paused && (

        <div className={`flex items-start gap-3 rounded-lg border p-4 text-sm ${permanent ? "border-destructive/60 bg-destructive/10" : "border-amber-500/40 bg-amber-500/5"}`}>

          <AlertCircle className={`mt-0.5 h-5 w-5 shrink-0 ${permanent ? "text-destructive" : "text-amber-600"}`} />

          <div className="flex-1">

            <p className={`font-semibold ${permanent ? "text-destructive" : "text-amber-700"}`}>

              {permanent

                ? `Profile permanently banned (ladder step ${ladderStep})`

                : `Profile paused · ladder step ${ladderStep}/3 · ${disputeLossCount} dispute${disputeLossCount === 1 ? "" : "s"} lost`}

            </p>

            <p className="mt-0.5 text-xs text-muted-foreground">

              {ep?.application_paused_reason ?? "Your account is under admin review and you can't submit new applications."}

            </p>

            {!permanent && cooldownDays > 0 && (

              <p className="mt-1 text-xs">

                <span className="font-mono">{daysRemaining}</span> day{daysRemaining === 1 ? "" : "s"} until auto-unpause (cooldown: {cooldownDays}d).

                {" "}Ladder: <span className="font-mono">{pauseCount}</span> prior pause{pauseCount === 1 ? "" : "s"}.

              </p>

            )}

            <div className="mt-2 flex flex-wrap gap-2">

              <Button asChild size="sm" variant={permanent ? "destructive" : "default"}>
        <Link href="/support?category=account&subject=unpause-request">

                  {permanent ? "Request admin review" : "Request early unpause"}

                </Link>

              </Button>

              <Button asChild size="sm" variant="outline">
        <Link href="/support">Contact support</Link>

              </Button>

            </div>

          </div>

        </div>

      )}

      <PaymentNotificationBanner userId={currentUserId} />

      <div data-tour="kpi-cards" className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 [&>*]:min-w-0">

        <ActiveContractsRealtime userId={currentUserId} initialCount={active} />

        <KpiCard Icon={Briefcase} accent="primary" label="Workspaces" value={String(activeWorkspaces)} hint={`${(workspaces ?? []).filter((w: any) => w.employee_id === currentUserId).length} total`} />

        <KpiCard Icon={Wallet}    accent="success" label="Earnings (lifetime)" value={formatINR(Math.round(lifetime / 100))} hint="after fees" />

        <KpiCard Icon={IndianRupee} accent="sky" label="Wallet balance" value={formatINR(Math.round(((wallet as any)?.balance_paise ?? 0) / 100))} hint="available" />

        <Link href="/dashboard/points" className="block">

          <KpiCard Icon={Award} label="Points balance" value={String((points as any)?.points_balance ?? 0)} hint="non-cash, redeemable  ¢¬„¢" />

        </Link>

        <KpiCard Icon={Star}      label="Rating" value={(ep as any)?.avg_rating?.toFixed(2) ?? " — "} hint={`${(ep as any)?.total_reviews ?? 0} reviews`} />

      </div>

      <div className="grid gap-6 md:grid-cols-2 [&>*]:min-w-0">

        <Card>

          <CardHeader>

            <CardTitle>Your verified skills</CardTitle>

            <CardDescription>Pass practical tests to unlock more categories.</CardDescription>

          </CardHeader>

          <CardContent className="space-y-3">

            {skills.length === 0 && (

              <p className="text-sm text-muted-foreground">No skills yet. Start with the Tier A practical test for any Active category.</p>

            )}

            {skills.map((s: any) => (

              <div key={s.id} className="flex items-center justify-between rounded-lg border p-3">

                <div>

                  <div className="text-sm font-semibold">{s.category?.name}</div>

                  <div className="text-xs text-muted-foreground capitalize">{s.verification_status.replace("_", " ")}</div>

                </div>

                <Badge variant={s.verification_status === "verified" ? "success" : "secondary"}>

                  {formatPaise(s.current_wage_band_min)} — {formatPaise(s.current_wage_band_max)}

                </Badge>

              </div>

            ))}

            <Button asChild variant="outline" className="w-full">
        <Link href="/dashboard/skills">Take a new skill test <ArrowRight className="h-4 w-4" /></Link>

            </Button>

          </CardContent>

        </Card>

        <Card>

          <CardHeader>

            <CardTitle>Verification status</CardTitle>

            <CardDescription>Required before your first payout.</CardDescription>

          </CardHeader>

          <CardContent className="space-y-3">

            <VerificationRow label="Aadhaar"   status={verificationStatus(verifications, "aadhaar")}   hint="required to start" />

            <VerificationRow label="PAN"       status={verificationStatus(verifications, "pan")}       hint="required above ₹20,000" />

            <VerificationRow label="Liveness"  status={verificationStatus(verifications, "liveness")}  hint="required before first payout" />

            <VerificationRow label="Skills"    status={skills.some((s: any) => s.verification_status === "verified") ? "verified" : "missing"} hint="at least 1 verified" />

          </CardContent>

        </Card>

      </div>

      <RecentContracts initial={contracts} role="employee" currentUserId={currentUserId} />

      <WalletTransactionsList userId={currentUserId} initial={walletTransactions} compact />

    </>

  );

}

/* ------------------------------------------------------------------ */

/*  Buyer view                                                        */

/* ------------------------------------------------------------------ */

function BuyerHome({ tasksPosted, contracts, workspaces, payments, verifications, bp, me, currentUserId, walletTransactions, fundedWorkspaces }: any) {

  const openTasks = tasksPosted.filter((t: any) => t.status === "open").length;

  const myContracts = (contracts ?? []).filter((c: any) => c.buyer_id === currentUserId);

  const myWorkspaces = (workspaces ?? []).filter((w: any) => w.buyer_id === currentUserId);

  const activeContracts = myContracts.length;

  const myPayments = payments.filter((p: any) => p.contract?.buyer_id === currentUserId);

  const razorpaySpent = myPayments

    .filter((p: any) => p.status === "released" || p.status === "captured")

    .reduce((s: number, p: any) => s + (Number(p.amount ?? 0) / 100), 0);

  // Wallet-funded escrows don't create payments rows —  use workspaces table

  const escrowSpent = (fundedWorkspaces ?? []).reduce(

    (s: number, w: any) => s + (Number(w.escrow_amount_paise ?? 0) / 100),

    0

  );

  const totalSpent = razorpaySpent + escrowSpent;

  return (

    <>

      <div data-tour="kpi-cards" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">

        <KpiCard Icon={ListChecks} accent="primary" label="Open tasks"         value={String(openTasks)}                 hint={`${tasksPosted.length} total posted`} />

        <KpiCard Icon={Briefcase}   accent="success" label="Contracts"  value={String(myContracts.length)}           hint={`${myWorkspaces.length} workspaces · ${contracts.length} all roles`} />

        <KpiCard Icon={Wallet}      label="Total spent"                      value={formatINR(totalSpent)}            hint="lifetime" />

        <KpiCard Icon={FileText}    label="Payments & escrow"               value={String(myPayments.length + (fundedWorkspaces ?? []).length)} hint={`${fundedWorkspaces.length} funded escrows`} />

      </div>

      <div className="grid gap-6 md:grid-cols-2 [&>*]:min-w-0">

        <Card>

          <CardHeader>

            <CardTitle>Your posted tasks</CardTitle>

            <CardDescription>All tasks you've posted on the platform.</CardDescription>

          </CardHeader>

          <CardContent className="space-y-3">

            {tasksPosted.length === 0 && (

              <p className="text-sm text-muted-foreground">You haven't posted any tasks yet. Post your first one to start receiving applications.</p>

            )}

            {tasksPosted.map((t: any) => (

              <Link href={`/browse/${t.id}`} key={t.id} className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-accent">

                <div className="min-w-0 flex-1">

                  <div className="truncate text-sm font-semibold">{t.title}</div>

                  <div className="text-xs text-muted-foreground">{t.category_name ?? t.category?.name} · {timeAgo(t.created_at)}</div>

                </div>

                <Badge variant={t.status === "open" ? "success" : t.status === "in_contract" ? "default" : "secondary"} className="capitalize">{t.status.replace("_", " ")}</Badge>

              </Link>

            ))}

            <Button asChild variant="gradient" className="w-full">
        <Link href="/dashboard/post"><Plus className="h-4 w-4" />Post a new task</Link>

            </Button>

          </CardContent>

        </Card>

        <Card>

          <CardHeader>

            <CardTitle>Buyer eKYC</CardTitle>

            <CardDescription>Required to post any task.</CardDescription>

          </CardHeader>

          <CardContent className="space-y-3">

            <VerificationRow label="Email"   status={(me as any)?.email ? "verified" : "missing"} hint="confirmed at signup" />

            <VerificationRow label="Phone"   status={(me as any)?.phone_verified ? "verified" : "missing"} hint="OTP via Supabase" />

            <VerificationRow label="Aadhaar" status={verificationStatus(verifications, "aadhaar", "buyer")} hint="identity" />

            <VerificationRow label="PAN"     status={verificationStatus(verifications, "pan", "buyer")}     hint="tax invoicing" />

            <VerificationRow label="Bank"    status={verificationStatus(verifications, "bank", "buyer")}    hint="₹1 UPI verified" />

            {bp?.buyer_type === "business" && (

              <VerificationRow label="GSTIN" status={verificationStatus(verifications, "gstin", "buyer")} hint="business buyers" />

            )}

            <Button asChild variant="gradient" className="mt-2 w-full">
        <Link href="/onboarding/buyer">

                Manage buyer eKYC <ArrowRight className="h-4 w-4" />

              </Link>

            </Button>

          </CardContent>

        </Card>

      </div>

      <RecentContracts initial={contracts} role="buyer" currentUserId={currentUserId} />

      <WalletTransactionsList userId={currentUserId} initial={walletTransactions} compact />

    </>

  );

}

/* ------------------------------------------------------------------ */

/*  Both view                                                         */

/* ------------------------------------------------------------------ */

function BothHome({ contracts, workspaces, ep, bp, skills, points, tasksPosted, payments, verifications, me, currentUserId, wallet, walletTransactions, lifetimeFromWallet, fundedWorkspaces }: any) {

  const myBuyerContracts = (contracts ?? []).filter((c: any) => c.buyer_id === currentUserId);

  const myWorkspaces = (workspaces ?? []).filter((w: any) => w.buyer_id === currentUserId || w.employee_id === currentUserId);

  const activeContracts = myBuyerContracts.length;

  const lifetime = lifetimeFromWallet > 0 ? lifetimeFromWallet : ((ep as any)?.lifetime_earnings ?? 0);

  const openTasks = tasksPosted.filter((t: any) => t.status === "open").length;

  const myBuyerPayments = payments.filter((p: any) => p.contract?.buyer_id === currentUserId);

  const razorpaySpent = myBuyerPayments

    .filter((p: any) => p.status === "released" || p.status === "captured")

    .reduce((s: number, p: any) => s + (Number(p.amount ?? 0) / 100), 0);

  const escrowSpent = (fundedWorkspaces ?? []).reduce(

    (s: number, w: any) => s + (Number(w.escrow_amount_paise ?? 0) / 100),

    0

  );

  const totalSpent = razorpaySpent + escrowSpent;

  const paused = !!ep?.application_paused;

  const permanent = !!ep?.permanent_ban;

  const ladderStep = (ep as any)?.pause_ladder_step ?? 0;

  const pauseCount = (ep as any)?.pause_count ?? 0;

  const disputeLossCount = ep?.dispute_loss_count ?? 0;

  const cooldownDays = ladderStep === 1 ? 7 : ladderStep === 2 ? 30 : ladderStep === 3 ? 90 : 0;

  const lastPause = (ep as any)?.last_pause_at ?? (ep as any)?.application_paused_at;

  const daysRemaining = lastPause && cooldownDays > 0

    ? Math.max(0, Math.ceil((new Date(lastPause).getTime() + cooldownDays * 86400000 - Date.now()) / 86400000))

    : 0;

  return (

    <>

      {paused && (

        <div className={`flex items-start gap-3 rounded-lg border p-4 text-sm ${permanent ? "border-destructive/60 bg-destructive/10" : "border-amber-500/40 bg-amber-500/5"}`}>

          <AlertCircle className={`mt-0.5 h-5 w-5 shrink-0 ${permanent ? "text-destructive" : "text-amber-600"}`} />

          <div className="flex-1">

            <p className={`font-semibold ${permanent ? "text-destructive" : "text-amber-700"}`}>

              {permanent

                ? `Profile permanently banned (ladder step ${ladderStep})`

                : `Profile paused · ladder step ${ladderStep}/3 · ${disputeLossCount} dispute${disputeLossCount === 1 ? "" : "s"} lost`}

            </p>

            <p className="mt-0.5 text-xs text-muted-foreground">

              {ep?.application_paused_reason ?? "Your account is under admin review and you can't submit new applications."}

            </p>

            {!permanent && cooldownDays > 0 && (

              <p className="mt-1 text-xs">

                <span className="font-mono">{daysRemaining}</span> day{daysRemaining === 1 ? "" : "s"} until auto-unpause (cooldown: {cooldownDays}d).

                {" "}Ladder: <span className="font-mono">{pauseCount}</span> prior pause{pauseCount === 1 ? "" : "s"}.

              </p>

            )}

            <div className="mt-2 flex flex-wrap gap-2">

              <Button asChild size="sm" variant={permanent ? "destructive" : "default"}>
        <Link href="/support?category=account&subject=unpause-request">

                  {permanent ? "Request admin review" : "Request early unpause"}

                </Link>

              </Button>

              <Button asChild size="sm" variant="outline">
        <Link href="/support">Contact support</Link>

              </Button>

            </div>

          </div>

        </div>

      )}

      {/* Top row: combined KPIs */}

      <div data-tour="kpi-cards" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">

        <Link href="/dashboard/tasks" className="block">

          <KpiCard Icon={ListChecks} accent="primary" label="My Posted Tasks" value={String(openTasks)} hint="click to manage  ¢¬„¢" />

        </Link>

        <Link href="/dashboard/contracts" className="block">

          <KpiCard Icon={Briefcase} accent="success" label="Contracts" value={String(myBuyerContracts.length)} hint={`${myWorkspaces.length} workspaces`} />

        </Link>

        <KpiCard Icon={Wallet} accent="emerald" label="Earned (lifetime)" value={formatINR(Math.round(lifetime / 100))} hint="from completed work" />

        <KpiCard Icon={Star} label="Rating" value={(ep as any)?.avg_rating?.toFixed(2) ?? " — "} hint={`${(ep as any)?.total_reviews ?? 0} reviews`} />

      </div>

      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 [&>*]:min-w-0">

        <Link href="/dashboard/points" className="block">

          <KpiCard Icon={Award} accent="amber" label="Points balance" value={String((points as any)?.points_balance ?? 0)} hint="non-cash, redeemable  ¢¬„¢" />

        </Link>

        <KpiCard Icon={FileText} label="Spent (lifetime)" value={formatINR(totalSpent)} hint="on hired work" />

        <KpiCard Icon={ShieldCheck} accent="info" label="Verified skills" value={String(skills.filter((s: any) => s.verification_status === "verified").length)} hint={`${skills.length} total`} />

        <KpiCard Icon={IndianRupee} accent="sky" label="Wallet balance" value={formatINR(Math.round(((wallet as any)?.balance_paise ?? 0) / 100))} hint="available" />

        <KpiCard Icon={Users} label="Active role" value="Buyer + Employee" hint="toggle in the top right" />

      </div>

      <div className="grid gap-6 md:grid-cols-3 [&>*]:min-w-0">

        <Card>

          <CardHeader>

            <CardTitle>Buyer side</CardTitle>

            <CardDescription>All tasks you've posted on the platform.</CardDescription>

          </CardHeader>

          <CardContent className="space-y-3">

            {tasksPosted.length === 0 ? (

              <p className="text-sm text-muted-foreground">No tasks posted yet.</p>

            ) : tasksPosted.map((t: any) => (

              <Link href={`/browse/${t.id}`} key={t.id} className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-accent">

                <div className="min-w-0 flex-1">

                  <div className="truncate text-sm font-semibold">{t.title}</div>

                  <div className="text-xs text-muted-foreground">{t.category_name ?? t.category?.name} · {timeAgo(t.created_at)}</div>

                </div>

                <Badge variant={t.status === "open" ? "success" : "secondary"} className="capitalize">{t.status.replace("_", " ")}</Badge>

              </Link>

            ))}

            <Button asChild variant="outline" className="w-full">
        <Link href="/dashboard/tasks">All posted tasks <ArrowRight className="h-4 w-4" /></Link>

            </Button>

          </CardContent>

        </Card>

        <Card>

          <CardHeader>

            <CardTitle>Employee side</CardTitle>

            <CardDescription>Your latest skills and earnings.</CardDescription>

          </CardHeader>

          <CardContent className="space-y-3">

            {skills.length === 0 ? (

              <p className="text-sm text-muted-foreground">No skills verified yet.</p>

            ) : skills.slice(0, 3).map((s: any) => (

              <div key={s.id} className="flex items-center justify-between rounded-lg border p-3">

                <div>

                  <div className="text-sm font-semibold">{s.category?.name}</div>

                  <div className="text-xs text-muted-foreground capitalize">{s.verification_status.replace("_", " ")}</div>

                </div>

                <Badge variant={s.verification_status === "verified" ? "success" : "secondary"}>{formatPaise(s.current_wage_band_min)} — {formatPaise(s.current_wage_band_max)}</Badge>

              </div>

            ))}

            <Button asChild variant="outline" className="w-full">
        <Link href="/dashboard/skills">All skills <ArrowRight className="h-4 w-4" /></Link>

            </Button>

          </CardContent>

        </Card>

        <Card>

          <CardHeader>

            <CardTitle>Verification</CardTitle>

            <CardDescription>Required to post and apply.</CardDescription>

          </CardHeader>

          <CardContent className="space-y-4">

            {/* Employee side —  needed for applying to tasks */}

            <div>

              <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">

                <Hammer className="h-3 w-3" /> Employee

              </div>

              <div className="space-y-1.5">

                <VerificationRow label="Aadhaar" status={verificationStatus(verifications, "aadhaar", "employee")} hint="identity" />

                <VerificationRow label="PAN"     status={verificationStatus(verifications, "pan", "employee")}     hint="above ₹20,000" />

              </div>

              <Button asChild variant="outline" size="sm" className="mt-2 w-full">
        <Link href="/onboarding/employee">Complete employee KYC</Link>

              </Button>

            </div>

            {/* Buyer side —  needed for posting tasks */}

            <div className="border-t pt-3">

              <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">

                <Briefcase className="h-3 w-3" /> Buyer

              </div>

              <div className="space-y-1.5">

                <VerificationRow label="Phone"   status={(me as any)?.phone_verified ? "verified" : "missing"} hint="OTP via Supabase" />

                <VerificationRow label="Aadhaar" status={verificationStatus(verifications, "aadhaar", "buyer")} hint="identity" />

                <VerificationRow label="PAN"     status={verificationStatus(verifications, "pan", "buyer")}     hint="tax" />

                <VerificationRow label="Bank"    status={verificationStatus(verifications, "bank", "buyer")}    hint="₹1 UPI verified" />

                {bp?.buyer_type === "business" && (

                  <VerificationRow label="GSTIN" status={verificationStatus(verifications, "gstin", "buyer")} hint="business" />

                )}

              </div>

              <Button asChild variant="gradient" size="sm" className="mt-2 w-full">
        <Link href="/onboarding/buyer">Complete buyer eKYC</Link>

              </Button>

            </div>

          </CardContent>

        </Card>

      </div>

      <RecentContracts initial={contracts} role="both" currentUserId={currentUserId} />

      <WalletTransactionsList userId={currentUserId} initial={walletTransactions} compact />

    </>

  );

}

