import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wallet, Briefcase, Award, TrendingUp, ShieldCheck, Star, ArrowRight, ListChecks, FileText, MessageSquare, Plus, Users, Clock, CheckCircle2, AlertCircle, Sparkles, Hammer, UserSearch, EyeOff, IndianRupee } from "lucide-react";
import { formatPaise, formatINR, timeAgo } from "@/lib/utils";
import { WalletSection } from "@/components/wallet-section";
import { RealtimeActivityPanel, type Activity } from "@/components/dashboard/realtime-activity-panel";
import { MonthlyStatsPanel } from "@/components/dashboard/monthly-stats-panel";
import { ModeSwitcher } from "./mode-switcher";
import { AnonymousRequestButton } from "@/components/dashboard/anonymous-request-button";
import { RecentContracts } from "@/components/dashboard/recent-contracts";
import { ActiveContractsRealtime } from "@/components/dashboard/active-contracts-realtime";
import { WalletTransactionsList } from "@/components/dashboard/wallet-transactions-list";
import { PaymentNotificationBanner } from "@/components/dashboard/payment-notification-banner";
import { RealtimeDashboardRefresh } from "@/components/dashboard/realtime-dashboard-refresh";

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
    if (ep?.bio && (ep as any).bio.length > 20) profileCompleteness += 15;
    if (ep?.headline) profileCompleteness += 5;
    if ((ep as any)?.location) profileCompleteness += 5;
    if ((ep as any)?.hourly_rate_paise) profileCompleteness += 5;
    if ((skills ?? []).length >= 1) profileCompleteness += 15;
    if ((skills ?? []).length >= 3) profileCompleteness += 5;
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
  // — only count escrows where the user funded them (is the buyer)
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

  return (
    <RealtimeDashboardRefresh userId={user.id}>
    <div className="container max-w-6xl space-y-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight md:text-3xl">
            Welcome back, {name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "employee" && "Here's what's happening with your work today."}
            {mode === "buyer"    && "Here's what's happening with your posted tasks today."}
            {mode === "both"     && "Here's a unified view of your buyer + employee activity."}
          </p>
        </div>
        {/* Compact mode switcher in the header (for users who
            can only be in one mode, this becomes a "Become an
            Employee" prompt instead). */}
        <div className="flex flex-col items-start gap-2 md:flex-row md:items-center">
          {(mode === "employee" || mode === "both") && (
            <AnonymousRequestButton
              status={(anonymousProfile as any)?.status ?? "none"}
              displayId={(anonymousProfile as any)?.display_id}
            />
          )}
          <ModeSwitcher roles={roles} currentMode={me?.current_mode} />
        </div>
      </header>

      {hasEmployee && profileCompleteness < 60 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-500/40 bg-rose-500/5 p-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-rose-500/15 text-rose-600">
              <AlertCircle className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-rose-700">You can't apply to tasks until your profile is at least 60% complete</p>
              <p className="text-xs text-rose-700/80">
                Currently {profileCompleteness}% complete — finish the basics, add skills with rates, and link a portfolio. This unlocks the apply button everywhere.
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
              <p className="text-sm font-semibold">Profile ready — you can apply to tasks!</p>
              <p className="text-xs text-muted-foreground">
                {profileCompleteness}% complete — add a few more sections to stand out in <Link href="/find-people" className="text-primary hover:underline">Find people</Link>.
              </p>
            </div>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/profile">Polish profile</Link>
          </Button>
        </div>
      )}

      {mode === "employee" && <EmployeeHome contracts={contracts ?? []} ep={ep} skills={skills ?? []} points={points} verifications={verifications ?? []} currentUserId={user.id} wallet={wallet} walletTransactions={walletTransactions ?? []} lifetimeFromWallet={lifetimeEarningsFromWallet} />}
      {mode === "buyer"    && <BuyerHome    tasksPosted={tasksPosted ?? []} contracts={contracts ?? []} payments={payments ?? []} verifications={verifications ?? []} bp={bp} me={me} currentUserId={user.id} walletTransactions={walletTransactions ?? []} fundedWorkspaces={fundedWorkspaces ?? []} />}
      {mode === "both"     && <BothHome     contracts={contracts ?? []} ep={ep} bp={bp} skills={skills ?? []} points={points} tasksPosted={tasksPosted ?? []} payments={payments ?? []} verifications={verifications ?? []} me={me} currentUserId={user.id} wallet={wallet} walletTransactions={walletTransactions ?? []} lifetimeFromWallet={lifetimeEarningsFromWallet} fundedWorkspaces={fundedWorkspaces ?? []} />}

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

      <RealtimeActivityPanel
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
      />

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
        title: `Offer ${o.status} to ${o.employee?.full_name ?? "candidate"} · ₹${Math.round((o.rate_paise ?? 0) / 100)}`,
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
        title: `Offer received · ₹${Math.round((o.rate_paise ?? 0) / 100)} for "${o.task?.title ?? "task"}"`,
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
      title: `Payment ${p.status} · ₹${Math.round((p.amount ?? 0) / 100)}`,
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
      subtitle: `${c.task?.title ?? "Contract"} · ₹${Math.round((c.agreed_price ?? 0) / 100)}`,
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
      title: `You gave ${r.rating}★ to ${r.reviewee?.full_name ?? "counterparty"}`,
      subtitle: r.comment?.slice(0, 60) ?? "—",
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
  const buyerActivitySeries = days.map((d) => ({ ...d }));
  for (const t of tasksPosted) {
    const day = t.created_at?.slice(0, 10);
    const i = day ? dayIdx.get(day) : undefined;
    if (i != null) buyerActivitySeries[i].value += 1;
  }
  for (const c of contracts) {
    const day = c.started_at?.slice(0, 10);
    const i = day ? dayIdx.get(day) : undefined;
    if (i != null) buyerActivitySeries[i].value += 1;
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
  // We never estimate or divide a lifetime number — every chart point
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
  const tasksCompletedLast30d = tasksPosted.filter((t) => t.status === "completed" && new Date(t.created_at) >= new Date(thirtyDaysAgo)).length;
  const contractsSignedLast30d = contracts.filter((c) => new Date(c.started_at ?? c.completed_at) >= new Date(thirtyDaysAgo)).length;
  const uniqueEmployeesHiredLast30d = new Set(
    contracts.filter((c) => c.buyer_id === userId && new Date(c.started_at ?? c.completed_at) >= new Date(thirtyDaysAgo)).map((c) => c.employee_id)
  ).size;
  const contractsCompletedLast30d = contracts.filter(
    (c) => c.employee_id === userId && c.status === "completed" && new Date(c.completed_at ?? c.started_at) >= new Date(thirtyDaysAgo)
  ).length;
  const contractsActive = contracts.filter((c) => c.status === "active").length;
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

function EmployeeHome({ contracts, ep, skills, points, verifications, currentUserId, wallet, walletTransactions, lifetimeFromWallet }: any) {
  const active = contracts.filter((c: any) => c.status === "active").length;
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

      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <ActiveContractsRealtime userId={currentUserId} initialCount={active} />
        <KpiCard Icon={Wallet}    accent="success" label="Earnings (lifetime)" value={formatINR(Math.round(lifetime / 100))} hint="after fees" />
        <KpiCard Icon={IndianRupee} accent="sky" label="Wallet balance" value={formatINR(Math.round(((wallet as any)?.balance_paise ?? 0) / 100))} hint="available" />
        <Link href="/dashboard/points" className="block">
          <KpiCard Icon={Award} label="Points balance" value={String((points as any)?.points_balance ?? 0)} hint="non-cash, redeemable →" />
        </Link>
        <KpiCard Icon={Star}      label="Rating" value={(ep as any)?.avg_rating?.toFixed(2) ?? "—"} hint={`${(ep as any)?.total_reviews ?? 0} reviews`} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
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
                  {formatPaise(s.current_wage_band_min)}–{formatPaise(s.current_wage_band_max)}
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

function BuyerHome({ tasksPosted, contracts, payments, verifications, bp, me, currentUserId, walletTransactions, fundedWorkspaces }: any) {
  const openTasks = tasksPosted.filter((t: any) => t.status === "open").length;
  const activeContracts = contracts.filter((c: any) => c.status === "active").length;
  const myPayments = payments.filter((p: any) => p.contract?.buyer_id === currentUserId);
  const razorpaySpent = myPayments
    .filter((p: any) => p.status === "released" || p.status === "captured")
    .reduce((s: number, p: any) => s + (Number(p.amount ?? 0) / 100), 0);
  // Wallet-funded escrows don't create payments rows — use workspaces table
  const escrowSpent = (fundedWorkspaces ?? []).reduce(
    (s: number, w: any) => s + (Number(w.escrow_amount_paise ?? 0) / 100),
    0
  );
  const totalSpent = razorpaySpent + escrowSpent;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard Icon={ListChecks} accent="primary" label="Open tasks"         value={String(openTasks)}                 hint={`${tasksPosted.length} total posted`} />
        <KpiCard Icon={Briefcase}   accent="success" label="Contracts"  value={String(activeContracts)}           hint={`${contracts.length} total`} />
        <KpiCard Icon={Wallet}      label="Total spent"                      value={formatINR(totalSpent)}            hint="lifetime" />
        <KpiCard Icon={FileText}    label="Payments & escrow"               value={String(myPayments.length + (fundedWorkspaces ?? []).length)} hint={`${fundedWorkspaces.length} funded escrows`} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
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

function BothHome({ contracts, ep, bp, skills, points, tasksPosted, payments, verifications, me, currentUserId, wallet, walletTransactions, lifetimeFromWallet, fundedWorkspaces }: any) {
  const activeContracts = contracts.filter((c: any) => c.status === "active").length;
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard Icon={Briefcase} accent="primary" label="Contracts"   value={String(activeContracts)} hint="as buyer or employee" />
        <KpiCard Icon={Wallet}    accent="success" label="Earned (lifetime)"   value={formatINR(Math.round(lifetime / 100))} hint="from completed work" />
        <Link href="/dashboard/points" className="block">
          <KpiCard Icon={Award} label="Points balance" value={String((points as any)?.points_balance ?? 0)} hint="non-cash, redeemable →" />
        </Link>
        <KpiCard Icon={Star}      label="Rating"                            value={(ep as any)?.avg_rating?.toFixed(2) ?? "—"} hint={`${(ep as any)?.total_reviews ?? 0} reviews`} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <KpiCard Icon={ListChecks} accent="primary" label="Open tasks"         value={String(openTasks)}          hint={`${tasksPosted.length} posted`} />
        <KpiCard Icon={FileText}    label="Spent (lifetime)"                  value={formatINR(totalSpent)}     hint="on hired work" />
        <KpiCard Icon={ShieldCheck} label="Verified skills"                  value={String(skills.filter((s: any) => s.verification_status === "verified").length)} hint={`${skills.length} total`} />
        <KpiCard Icon={IndianRupee} accent="sky" label="Wallet balance"       value={formatINR(Math.round(((wallet as any)?.balance_paise ?? 0) / 100))} hint="available" />
        <KpiCard Icon={Users}       label="Active role"                      value="Buyer + Employee" hint="toggle in the top right" />
      </div>

      <div className="grid gap-6 md:grid-cols-3">
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
                <Badge variant={s.verification_status === "verified" ? "success" : "secondary"}>{formatPaise(s.current_wage_band_min)}–{formatPaise(s.current_wage_band_max)}</Badge>
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
            {/* Employee side — needed for applying to tasks */}
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
            {/* Buyer side — needed for posting tasks */}
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



