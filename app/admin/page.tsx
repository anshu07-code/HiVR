import { seedSampleTasks, clearSampleTasks } from "./sample-data-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Trash2, Database, Users, FileCheck2, Briefcase, AlertCircle, Wallet, ListChecks, TrendingUp, CreditCard, HandCoins, MessageSquare, CalendarCheck, Send, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { formatINR } from "@/lib/utils";
import { requireAdmin } from "@/lib/admin-auth";
import { AdminRevenueCharts } from "@/components/admin/admin-revenue-charts";

export default async function AdminOverview() {
  await requireAdmin();
  const sb = createClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();
  const [users, verifs, posts, contracts, openDisputes, categories, bankLast30d, bankRev, digilockerLast30d, employeePenalties, buyerPenalties, offers, applications, interviews, messages, completedContracts30d, revenueByCategory, withdrawalsLast30d, escrowReleasedLast30d, escrowReleasedLifetime] = await Promise.all([
    sb.from("users").select("id", { count: "exact", head: true }),
    sb.from("verifications").select("id", { count: "exact", head: true }).eq("status", "pending"),
    sb.from("task_posts").select("id", { count: "exact", head: true }).eq("status", "open"),
    sb.from("contracts").select("agreed_price, status"),
    sb.from("disputes").select("id", { count: "exact", head: true }).eq("status", "open"),
    sb.from("skill_categories").select("id, name, status", { count: "exact" }),
    sb.from("verifications").select("verified_at, metadata", { count: "exact" }).eq("doc_type", "bank").eq("status", "verified").gte("verified_at", thirtyDaysAgo),
    sb.from("platform_settings").select("value").eq("key", "bank_verification_revenue_total_paise").maybeSingle(),
    sb.from("verifications").select("verified_at", { count: "exact", head: true }).in("doc_type", ["aadhaar", "pan"]).eq("status", "verified").gte("verified_at", thirtyDaysAgo),
    sb.from("employee_profiles").select("penalty_balance_paise, withdrawal_penalty_paise, total_platform_fees"),
    sb.from("users").select("buyer_penalty_paise"),
    sb.from("application_offers").select("status"),
    sb.from("task_applications").select("status"),
    sb.from("application_interviews").select("status"),
    sb.from("messages").select("id", { count: "exact", head: true }),
    // Real per-day revenue source #1: completed workspaces in last 30d
    sb.from("workspaces").select("id, contract_id, completed_at").eq("status", "completed").not("completed_at", "is", null).gte("completed_at", thirtyDaysAgo),
    // Real per-category revenue: ONLY completed workspaces (lifetime)
    sb.from("workspaces").select("id, contract_id, completed_at").eq("status", "completed").not("completed_at", "is", null),
    // Real per-day withdraw fee source: penalty_paise from wallet_transactions metadata
    sb.from("wallet_transactions").select("amount_paise, kind, created_at, metadata").eq("direction", "debit").in("kind", ["withdraw_initiated", "withdraw_completed"]).gte("created_at", thirtyDaysAgo),
    // Real per-day escrow-release volume (the gross amount that moved through escrow)
    sb.from("wallet_transactions").select("amount_paise, kind, created_at").eq("kind", "escrow_release").gte("created_at", thirtyDaysAgo),
    // Lifetime escrow release total
    sb.from("wallet_transactions").select("amount_paise, kind").eq("kind", "escrow_release"),
  ]);

  const gmv = (contracts.data ?? []).reduce((s, c) => s + Number(c.agreed_price ?? 0), 0);
  const activeContracts = (contracts.data ?? []).filter(c => c.status === "active").length;
  const openTasks = posts.count ?? 0;

  // Penalty revenue
  const empPenaltyPaise = (employeePenalties.data ?? []).reduce((s: number, r: any) => s + Number(r.penalty_balance_paise ?? 0), 0);
  const buyerPenaltyPaise = (buyerPenalties.data ?? []).reduce((s: number, r: any) => s + Number(r.buyer_penalty_paise ?? 0), 0);
  const totalPenaltyPaise = empPenaltyPaise + buyerPenaltyPaise;

  // Offers summary
  const offerStatuses = (offers.data ?? []) as any[];
  const pendingOffers = offerStatuses.filter((o: any) => o.status === "pending").length;
  const acceptedOffers = offerStatuses.filter((o: any) => o.status === "accepted").length;
  const declinedOffers = offerStatuses.filter((o: any) => o.status === "declined").length;

  // Applications summary
  const appStatuses = (applications.data ?? []) as any[];
  const hiredApps = appStatuses.filter((a: any) => a.status === "hired").length;
  const totalApps = appStatuses.length;

  // Interviews summary
  const ivStatuses = (interviews.data ?? []) as any[];
  const completedInterviews = ivStatuses.filter((iv: any) => iv.status === "completed").length;
  const totalInterviews = ivStatuses.length;

  const totalMessages = messages.count ?? 0;

  // Bank verification revenue (last 30d)
  const lifetimeBankRevPaise = (bankRev as any)?.value?.value ?? 0;
  const bankDays: { day: string; paise: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60_000);
    bankDays.push({ day: d.toISOString().slice(0, 10), paise: 0 });
  }
  for (const row of (bankLast30d.data ?? []) as any[]) {
    if (!row.verified_at) continue;
    const day = row.verified_at.slice(0, 10);
    const target = bankDays.find(b => b.day === day);
    if (target) target.paise += Number((row.metadata as any)?.amount_paise ?? 100);
  }
  const last30dBankRevPaise = bankDays.reduce((s, d) => s + d.paise, 0);
  const last7dBankRevPaise = bankDays.slice(-7).reduce((s, d) => s + d.paise, 0);
  const maxDay = Math.max(1, ...bankDays.map(d => d.paise));

  // ============== Fetch contract details for completed workspaces ==============
  const wsCompleted30dArr = (completedContracts30d.data ?? []) as any[];
  const wsLifetimeArr = (revenueByCategory.data ?? []) as any[];
  const completedContractIds = new Set<string>();
  for (const w of [...wsCompleted30dArr, ...wsLifetimeArr]) {
    if (w.contract_id) completedContractIds.add(w.contract_id);
  }
  const completedContractIdsArr = Array.from(completedContractIds);
  const { data: completedContracts } = completedContractIdsArr.length > 0
    ? await sb.from("contracts").select("id, agreed_price, platform_fee_pct, category_id, task_post_id, category:skill_categories(name), task:task_posts!contracts_task_post_id_fkey(id, title)").in("id", completedContractIdsArr)
    : { data: [] };
  const contractMap = new Map((completedContracts ?? []).map((c: any) => [c.id, c]));

  // ============== Revenue time series (30 days) — REAL DATA ONLY ==============
  const days: { day: string; platformFeePaise: number; bankPaise: number; withdrawPaise: number; escrowPaise: number; totalPaise: number; revenuePaise: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60_000);
    days.push({ day: d.toISOString().slice(0, 10), platformFeePaise: 0, bankPaise: 0, withdrawPaise: 0, escrowPaise: 0, totalPaise: 0, revenuePaise: 0 });
  }
  const dayIndex = new Map(days.map((d, i) => [d.day, i]));

  // 1) Platform fees from completed workspaces.
  //    platform_fee_pct is stored as a decimal (e.g. 0.20 = 20%).
  for (const w of wsCompleted30dArr) {
    if (!w.completed_at) continue;
    const c = contractMap.get(w.contract_id);
    if (!c) continue;
    const day = w.completed_at.slice(0, 10);
    const i = dayIndex.get(day);
    if (i == null) continue;
    const feePct = Number(c.platform_fee_pct ?? 0);
    const fee = Math.round(Number(c.agreed_price ?? 0) * feePct);
    days[i].platformFeePaise += fee;
  }

  // 2) Withdraw penalties — use the actual stored `penalty_paise` from
  //    wallet_transactions.metadata (set at the time of withdrawal).
  for (const w of (withdrawalsLast30d.data ?? []) as any[]) {
    if (!w.created_at) continue;
    const day = w.created_at.slice(0, 10);
    const i = dayIndex.get(day);
    if (i == null) continue;
    const penalty = Number((w.metadata as any)?.penalty_paise ?? 0);
    if (penalty > 0) days[i].withdrawPaise += penalty;
  }

  // 3) Escrow volume moved per day
  for (const p of (escrowReleasedLast30d.data ?? []) as any[]) {
    if (!p.created_at) continue;
    const day = p.created_at.slice(0, 10);
    const i = dayIndex.get(day);
    if (i == null) continue;
    days[i].escrowPaise += Number(p.amount_paise ?? 0);
  }

  // 4) Bank verification fee (real, per-row)
  for (const d of bankDays) {
    const i = dayIndex.get(d.day);
    if (i == null) continue;
    days[i].bankPaise = d.paise;
  }

  for (const d of days) {
    d.totalPaise = d.platformFeePaise + d.escrowPaise + d.bankPaise + d.withdrawPaise;
    d.revenuePaise = d.platformFeePaise + d.bankPaise + d.withdrawPaise;
  }

  // Revenue by category — LIFETIME completed workspaces.
  const byCategoryMap = new Map<string, { name: string; revenuePaise: number; count: number }>();
  let lifetimeContractCount = 0;
  for (const w of wsLifetimeArr) {
    const c = contractMap.get(w.contract_id);
    if (!c) continue;
    const catName = c.category?.name ?? "Other";
    const cur = byCategoryMap.get(catName) ?? { name: catName, revenuePaise: 0, count: 0 };
    const feePct = Number(c.platform_fee_pct ?? 0);
    cur.revenuePaise += Math.round(Number(c.agreed_price ?? 0) * feePct);
    cur.count += 1;
    lifetimeContractCount += 1;
    byCategoryMap.set(catName, cur);
  }
  const revenueByCategoryArr = Array.from(byCategoryMap.values())
    .sort((a, b) => b.revenuePaise - a.revenuePaise)
    .slice(0, 8);

  const totalRevenue30d = days.reduce((s, d) => s + d.revenuePaise, 0);
  const platformFee30d = days.reduce((s, d) => s + d.platformFeePaise, 0);
  const withdrawFee30d = days.reduce((s, d) => s + d.withdrawPaise, 0);
  const bankFee30d = days.reduce((s, d) => s + d.bankPaise, 0);
  const escrowFee30d = days.reduce((s, d) => s + d.escrowPaise, 0);

  // Lifetime escrow total (real sum of escrow_release transactions)
  const lifetimeEscrowPaise = (escrowReleasedLifetime.data ?? []).reduce(
    (s: number, r: any) => s + Number(r.amount_paise ?? 0), 0
  );

  // Per-contract revenue breakdown (last 30 completed, sorted by completion date desc)
  const completedContractsList = wsLifetimeArr
    .filter((w: any) => w.completed_at && contractMap.get(w.contract_id))
    .sort((a: any, b: any) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime())
    .slice(0, 30)
    .map((w: any) => {
      const c = contractMap.get(w.contract_id)!;
      const feePct = Number(c.platform_fee_pct ?? 0);
      const fee = Math.round(Number(c.agreed_price ?? 0) * feePct);
      return {
        contractId: w.contract_id,
        taskName: (c.task as any)?.title ?? "Unknown task",
        categoryName: (c.category as any)?.name ?? "Other",
        feePaise: fee,
        agreedPricePaise: Number(c.agreed_price ?? 0),
        completedAt: w.completed_at,
      };
    });

  return (
    <div className="container max-w-6xl space-y-6 py-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Admin overview</h1>
        <p className="text-sm text-muted-foreground">Real-time platform KPIs.</p>
      </header>

      {/* Row 1 — Core platform */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi Icon={Users} label="Total users"       value={String(users.count ?? 0)} />
        <Kpi Icon={FileCheck2} label="Pending verifs" value={String(verifs.count ?? 0)} />
        <Kpi Icon={Briefcase} label="Open tasks"     value={String(openTasks)} />
        <Kpi Icon={AlertCircle} label="Open disputes" value={String(openDisputes.count ?? 0)} />
      </div>

      {/* Row 2 — Revenue & contracts */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi Icon={Wallet} label="GMV (lifetime)" value={formatINR(Math.round(gmv / 100))} hint={`${activeContracts} active contracts`} />
        <Kpi Icon={TrendingUp} label="Revenue · last 30d" value={formatINR(Math.round(totalRevenue30d / 100))} hint={`Platform fees ${formatINR(Math.round(platformFee30d / 100))} · Withdraw ${formatINR(Math.round(withdrawFee30d / 100))}`} accent="success" />
        <Kpi Icon={ListChecks} label="Categories" value={String((categories as any).count ?? 0)} hint={`${(categories.data ?? []).filter((c: any) => c.status === "active").length} live`} />
        <Kpi Icon={CreditCard} label="Bank verif revenue" value={formatINR(Math.round(lifetimeBankRevPaise / 100))} hint={`${bankLast30d.count ?? 0} verifications in last 30d`} accent="success" />
      </div>

      {/* Row 3 — Offers, applications, interviews, contracts */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi Icon={Send} label="Total offers" value={String(offerStatuses.length)} hint={`${pendingOffers} pending · ${acceptedOffers} accepted · ${declinedOffers} declined`} />
        <Kpi Icon={FileText} label="Applications" value={String(totalApps)} hint={`${hiredApps} hired`} />
        <Kpi Icon={CalendarCheck} label="Interviews" value={String(totalInterviews)} hint={`${completedInterviews} completed`} />
        <Kpi Icon={MessageSquare} label="Messages" value={String(totalMessages)} hint="platform-wide" />
      </div>

      {/* Row 4 — Penalty revenue card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <HandCoins className="h-5 w-5 text-warning" />
            <CardTitle>Penalty revenue</CardTitle>
          </div>
          <CardDescription>
            Platform fees charged for employee withdrawals and buyer rejections after sending an offer.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border bg-muted/30 p-3 text-center">
              <p className="text-[11px] uppercase text-muted-foreground">Total penalty revenue</p>
              <p className="mt-1 font-display text-2xl font-semibold">{formatINR(Math.round(totalPenaltyPaise / 100))}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-center">
              <p className="text-[11px] uppercase text-muted-foreground">Employee penalties</p>
              <p className="mt-1 font-display text-xl font-semibold text-rose-600">{formatINR(Math.round(empPenaltyPaise / 100))}</p>
              <p className="text-[10px] text-muted-foreground">Withdrawal fees</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-center">
              <p className="text-[11px] uppercase text-muted-foreground">Buyer penalties</p>
              <p className="mt-1 font-display text-xl font-semibold text-amber-600">{formatINR(Math.round(buyerPenaltyPaise / 100))}</p>
              <p className="text-[10px] text-muted-foreground">Reject-after-offer fees</p>
            </div>
          </div>

          {/* Horizontal stacked bar */}
          {totalPenaltyPaise > 0 ? (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Penalty breakdown</p>
              <div className="flex h-6 w-full overflow-hidden rounded-full">
                <div
                  className="bg-rose-500 transition-all"
                  style={{ width: `${(empPenaltyPaise / totalPenaltyPaise) * 100}%` }}
                  title={`Employee: ${formatINR(Math.round(empPenaltyPaise / 100))}`}
                />
                <div
                  className="bg-amber-500 transition-all"
                  style={{ width: `${(buyerPenaltyPaise / totalPenaltyPaise) * 100}%` }}
                  title={`Buyer: ${formatINR(Math.round(buyerPenaltyPaise / 100))}`}
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span><span className="inline-block h-2 w-2 rounded-full bg-rose-500" /> Employee: {formatINR(Math.round(empPenaltyPaise / 100))} ({totalPenaltyPaise > 0 ? Math.round((empPenaltyPaise / totalPenaltyPaise) * 100) : 0}%)</span>
                <span><span className="inline-block h-2 w-2 rounded-full bg-amber-500" /> Buyer: {formatINR(Math.round(buyerPenaltyPaise / 100))} ({totalPenaltyPaise > 0 ? Math.round((buyerPenaltyPaise / totalPenaltyPaise) * 100) : 0}%)</span>
              </div>
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground">No penalties recorded yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Bank verification sparkline (last 30 days) */}
      {lifetimeBankRevPaise > 0 || last7dBankRevPaise > 0 ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-success" />
              <CardTitle>Bank verification revenue · last 30 days</CardTitle>
            </div>
            <CardDescription>
              ₹1 per successful UPI verification. User pays, HiVR keeps the ₹1 (no refund).
              <span className="ml-2 text-foreground">Last 7 days: {formatINR(Math.round(last7dBankRevPaise / 100))} · Last 30 days: {formatINR(Math.round(last30dBankRevPaise / 100))} · Lifetime: {formatINR(Math.round(lifetimeBankRevPaise / 100))}</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-24 items-end gap-px">
              {bankDays.map((d, i) => {
                const h = Math.max(2, (d.paise / maxDay) * 96);
                return (
                  <div
                    key={d.day}
                    title={`${d.day}: ${formatINR(Math.round(d.paise / 100))} (${d.paise / 100} verifications)`}
                    className="flex-1 rounded-t bg-success/70 hover:bg-success"
                    style={{ height: `${h}px` }}
                  />
                );
              })}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>{bankDays[0]?.day}</span>
              <span>15d ago</span>
              <span>today</span>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Animated revenue charts — last 30 days breakdown + by category.
          All numbers are sourced from real wallet_transactions / verifications /
          completed-contracts rows. Empty days are real, not interpolated. */}
      <AdminRevenueCharts
        days={days.map((d) => ({
          day: d.day,
          platformFeePaise: d.platformFeePaise,
          bankPaise: d.bankPaise,
          withdrawPaise: d.withdrawPaise,
          escrowPaise: d.escrowPaise,
          totalPaise: d.totalPaise,
          revenuePaise: d.revenuePaise,
        }))}
        totalRevenue30dPaise={totalRevenue30d}
        byCategory={revenueByCategoryArr}
        totals={{
          total30dPaise: totalRevenue30d,
          platformFee30dPaise: platformFee30d,
          withdrawFee30dPaise: withdrawFee30d,
          bankFee30dPaise: bankFee30d,
          escrowFee30dPaise: escrowFee30d,
          lifetimeEscrowPaise,
          lifetimeCompletedContractCount: lifetimeContractCount,
        }}
        completedContractsList={completedContractsList}
      />

      {/* ONE-CLICK SAMPLE DATA */}
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle>Make the platform look alive</CardTitle>
          </div>
          <CardDescription>
            Seed 11 realistic sample tasks across all 6 Active categories. Visible immediately to every visitor on the homepage and /browse.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={async () => { "use server"; await seedSampleTasks(); }} className="flex flex-wrap gap-2">
            <Button type="submit" variant="gradient">
              <Database className="h-4 w-4" />
              {openTasks > 0 ? "Add more sample tasks" : "Add 11 sample tasks"}
            </Button>
          </form>
          <form action={async () => { "use server"; await clearSampleTasks(); }} className="mt-2">
            <Button type="submit" variant="ghost" size="sm">
              <Trash2 className="h-3.5 w-3.5" />Remove all tasks I created
            </Button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">
            Tasks are created under your account. They appear on <Link href="/browse" className="underline">/browse</Link> and on the <Link href="/" className="underline">homepage</Link> for everyone.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
            <CardDescription>The things you'll do most often.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            <AdminLink href="/admin/verifications">Review verifications →</AdminLink>
            <AdminLink href="/admin/disputes">Resolve disputes →</AdminLink>
            <AdminLink href="/dashboard/post">Post a task →</AdminLink>
            <AdminLink href="/admin/categories">Manage categories →</AdminLink>
            <AdminLink href="/admin/interviews">Tier B interviews →</AdminLink>
            <AdminLink href="/admin/contact">Contact panel →</AdminLink>
            <AdminLink href="/admin/tech">Tech panel →</AdminLink>
            <AdminLink href="/admin/resumes">Resumes →</AdminLink>
            <AdminLink href="/admin/wages">Wage bands →</AdminLink>
            <AdminLink href="/admin/webhooks">Webhook log →</AdminLink>
            <AdminLink href="/admin/finance">Finance dashboard →</AdminLink>
            <AdminLink href="/admin/subscriptions">Subscriptions →</AdminLink>
            <AdminLink href="/admin/support">Support console →</AdminLink>
            <AdminLink href="/admin/support/agents">Support agents →</AdminLink>
            <AdminLink href="/admin/settings">Platform settings →</AdminLink>
            <AdminLink href="/admin/users">User search →</AdminLink>
            <AdminLink href="/admin/legal">Legal pages →</AdminLink>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recently active categories</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {(categories.data ?? []).slice(0, 8).map((c: any) => (
                <li key={c.id} className="flex items-center justify-between">
                  <span>{c.name}</span>
                  <Badge variant={c.status === "active" ? "live" : "soon"}>{c.status === "active" ? "Live" : "Soon"}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ Icon, label, value, hint, accent }: { Icon: React.ComponentType<{ className?: string }>; label: string; value: string; hint?: string; accent?: "success" | "warning" | "primary" }) {
  const iconClass = accent === "success" ? "text-success" : accent === "warning" ? "text-warning" : accent === "primary" ? "text-primary" : "text-muted-foreground";
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase text-muted-foreground">{label}</span>
          <Icon className={`h-4 w-4 ${iconClass}`} />
        </div>
        <div className="mt-2 font-display text-2xl font-semibold">{value}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function AdminLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="rounded-md border p-3 text-sm font-medium transition-colors hover:border-primary/50 hover:bg-accent">
      {children}
    </Link>
  );
}
