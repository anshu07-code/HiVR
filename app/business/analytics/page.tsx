import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Lock, Crown, TrendingUp, Users, Briefcase, IndianRupee, Clock, Star, AlertTriangle, CheckCircle2 } from "lucide-react";
import { getBusinessPlan } from "@/lib/plan-gate";
import { formatINR } from "@/lib/utils";

export const metadata = { title: "HiVR Business — Analytics" };
export const dynamic = "force-dynamic";

export default async function BusinessAnalyticsPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/business/analytics");
  const { data: bp } = await sb.from("business_profiles").select("id, brand_name, legal_name")
    .eq("owner_user_id", user.id).maybeSingle();
  if (!bp) redirect("/onboarding/business");

  const plan = await getBusinessPlan(bp.id);
  const hasAnalytics = plan.planKey === "business_pro" || plan.planKey === "business_enterprise";

  if (!hasAnalytics) {
    return (
      <div className="container max-w-2xl space-y-5 py-12">
        <header>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Analytics</h1>
        </header>
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-amber-500/10 text-amber-600">
              <Lock className="h-6 w-6" />
            </div>
            <div>
              <h2 className="font-display text-xl font-semibold">Analytics is a Pro feature</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Upgrade to Pro to unlock spend trends, time-to-hire, dispute rate, and employee retention dashboards.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="text-[10px]"><CheckCircle2 className="h-3 w-3" /> Spend over time</Badge>
              <Badge variant="outline" className="text-[10px]"><CheckCircle2 className="h-3 w-3" /> Time-to-hire</Badge>
              <Badge variant="outline" className="text-[10px]"><CheckCircle2 className="h-3 w-3" /> Employee retention</Badge>
              <Badge variant="outline" className="text-[10px]"><CheckCircle2 className="h-3 w-3" /> Dispute rate</Badge>
            </div>
            <Button asChild variant="gradient" size="lg">
              <Link href="/business/subscription"><Crown className="h-4 w-4" /> Upgrade to Pro — ₹999/mo</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // === Pro / Enterprise: full analytics ===

  // Pull all the data we need
  const [{ data: contracts }, { data: jobs }, { data: disputes }, { data: apps }] = await Promise.all([
    sb.from("contracts")
      .select("id, status, agreed_price, started_at, approved_at, employee:users!contracts_employee_id_fkey(id, full_name, trust_tier, is_verified)")
      .eq("business_id", bp.id),
    sb.from("business_jobs")
      .select("id, title, status, created_at, positions, positions_filled")
      .eq("business_id", bp.id),
    sb.from("business_disputes")
      .select("id, status, created_at, resolved_at, raised_by_role, contract_id, contract:contracts!business_disputes_contract_id_fkey(id, employee_id, business_id)")
      .eq("business_id", bp.id),
    sb.from("business_applicants")
      .select("id, status, applied_at")
      .eq("job_id", "(SELECT id FROM business_jobs WHERE business_id = '" + bp.id + "')"),
  ]);

  const cs = (contracts as any[]) ?? [];
  const js = (jobs as any[]) ?? [];
  const ds = (disputes as any[]) ?? [];
  const aps = (apps as any[]) ?? [];

  // === Spend over time (last 6 months) ===
  const now = new Date();
  const monthLabels: { label: string; year: number; month: number; start: number; end: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = d.getTime();
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    monthLabels.push({
      label: d.toLocaleDateString("en-IN", { month: "short" }),
      year: d.getFullYear(),
      month: d.getMonth(),
      start, end,
    });
  }
  // Pull paid milestones for spend
  const { data: paidMs } = await sb.from("business_milestones")
    .select("id, amount_paise, paid_at, contract:contracts!business_milestones_contract_id_fkey(id, business_id)")
    .eq("contract.business_id", bp.id).not("paid_at", "is", null);
  const spendByMonth = monthLabels.map(m => {
    const paise = ((paidMs as unknown) as any[])?.filter(x => {
      const t = new Date(x.paid_at).getTime();
      return t >= m.start && t < m.end;
    }).reduce((s, x) => s + Number(x.amount_paise), 0) ?? 0;
    return { label: m.label, paise };
  });
  const totalSpend = spendByMonth.reduce((s, m) => s + m.paise, 0);
  const maxSpend = Math.max(1, ...spendByMonth.map(m => m.paise));

  // === Time-to-hire (job-posted → first applicant hired) ===
  // We don't have a direct "hired_at" on jobs, so use "first contract started_at for this job" as a proxy
  // For each closed/filled job, compute days from job.created_at to first contract.started_at
  const timeToHire: number[] = [];
  for (const j of js) {
    const firstContract = cs
      .filter(c => c.job?.id === j.id || (c as any).job_id === j.id)
      .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime())[0];
    if (firstContract) {
      const days = Math.max(0, Math.floor((new Date(firstContract.started_at).getTime() - new Date(j.created_at).getTime()) / 86400_000));
      timeToHire.push(days);
    }
  }
  const avgTimeToHire = timeToHire.length > 0 ? Math.round(timeToHire.reduce((s, d) => s + d, 0) / timeToHire.length) : 0;

  // === Employee retention ===
  // = contracts that completed / not cancelled, as a % of all contracts that have ended
  const completedOrCancelled = cs.filter(c => c.status === "completed" || c.status === "cancelled");
  const completed = cs.filter(c => c.status === "completed");
  const retentionRate = completedOrCancelled.length > 0
    ? Math.round((completed.length / completedOrCancelled.length) * 100)
    : 0;

  // === Dispute rate ===
  const disputeRate = cs.length > 0 ? Math.round((ds.length / cs.length) * 100) : 0;

  // === Employee tier breakdown ===
  const tierCounts: Record<string, number> = {};
  for (const c of cs) {
    const t = c.employee?.trust_tier ?? "Unranked";
    tierCounts[t] = (tierCounts[t] ?? 0) + 1;
  }

  // === Applicant funnel ===
  const funnel = {
    applied: aps.length,
    shortlisted: aps.filter(a => a.status === "shortlisted").length,
    offered: aps.filter(a => a.status === "offered").length,
    hired: aps.filter(a => a.status === "hired").length,
  };

  return (
    <div className="container max-w-5xl space-y-5 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Spend trends, time-to-hire, employee retention, and applicant funnel.
          </p>
        </div>
        <Badge variant="default" className="px-3 py-1">
          <Crown className="mr-1 h-3 w-3" /> {plan.planName} plan
        </Badge>
      </header>

      {/* KPI tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi Icon={IndianRupee} label="6mo spend" value={formatINR(Math.round(totalSpend / 100))} sub="across all milestones" />
        <Kpi Icon={Clock} label="Avg time-to-hire" value={avgTimeToHire > 0 ? `${avgTimeToHire}d` : "—"} sub="job post → first contract" />
        <Kpi Icon={CheckCircle2} label="Retention" value={`${retentionRate}%`} sub="contracts completed vs cancelled" />
        <Kpi Icon={AlertTriangle} label="Dispute rate" value={`${disputeRate}%`} sub="disputes / total contracts" />
      </div>

      {/* Spend over time */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Spend over the last 6 months</CardTitle>
          <CardDescription>Total milestone payments per month</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-48 items-end gap-2">
            {spendByMonth.map((m, i) => {
              const h = maxSpend > 0 ? Math.max(2, (m.paise / maxSpend) * 100) : 0;
              return (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <div className="w-full rounded-t bg-gradient-to-b from-primary to-primary/40 transition-all" style={{ height: `${h}%` }} title={formatINR(Math.round(m.paise / 100))} />
                  <span className="text-[10px] text-muted-foreground">{m.label}</span>
                  <span className="text-[10px] font-medium">{m.paise > 0 ? formatINR(Math.round(m.paise / 100)) : "—"}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Hiring funnel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Briefcase className="h-4 w-4" /> Applicant funnel</CardTitle>
          <CardDescription>From application to hire</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <FunnelRow label="Applied" value={funnel.applied} max={Math.max(1, funnel.applied)} />
            <FunnelRow label="Shortlisted" value={funnel.shortlisted} max={Math.max(1, funnel.applied)} />
            <FunnelRow label="Offered" value={funnel.offered} max={Math.max(1, funnel.applied)} />
            <FunnelRow label="Hired" value={funnel.hired} max={Math.max(1, funnel.applied)} highlight />
          </div>
        </CardContent>
      </Card>

      {/* Employee tier breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="h-4 w-4" /> Employees by tier</CardTitle>
          <CardDescription>Distribution of your hired employees</CardDescription>
        </CardHeader>
        <CardContent>
          {Object.keys(tierCounts).length === 0 ? (
            <p className="text-sm text-muted-foreground">No hired employees yet.</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(tierCounts).map(([tier, count]) => {
                const max = Math.max(...Object.values(tierCounts));
                return (
                  <div key={tier} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{tier}</span>
                      <span className="text-muted-foreground">{count}</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted">
                      <div className="h-2 rounded-full bg-primary" style={{ width: `${(count / max) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>Your last 10 contracts</CardDescription>
        </CardHeader>
        <CardContent>
          {cs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No contracts yet.</p>
          ) : (
            <ul className="space-y-1">
              {cs.slice(0, 10).map(c => (
                <li key={c.id} className="flex items-center justify-between gap-2 border-b py-1.5 text-sm last:border-0">
                  <div className="flex items-center gap-2">
                    <Badge variant={c.status === "completed" ? "default" : c.status === "cancelled" ? "outline" : "secondary"} className="capitalize">{c.status}</Badge>
                    <span className="font-medium">{c.employee?.full_name}</span>
                    <span className="text-xs text-muted-foreground">{c.employee?.trust_tier}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatINR(Math.round(c.agreed_price / 100))}</span>
                    <span>· {new Date(c.started_at).toLocaleDateString()}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ Icon, label, value, sub }: { Icon: any; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase text-muted-foreground">{label}</p>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="mt-1 font-display text-2xl font-semibold">{value}</p>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function FunnelRow({ label, value, max, highlight }: { label: string; value: number; max: number; highlight?: boolean }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className={highlight ? "font-display text-lg font-semibold text-primary" : "text-muted-foreground"}>{value}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted">
        <div className={`h-2 rounded-full transition-all ${highlight ? "bg-primary" : "bg-primary/50"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
