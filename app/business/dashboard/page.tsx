import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Briefcase, Users, FileText, AlertTriangle, TrendingUp, CreditCard,
  Building2, ArrowRight, Sparkles, Activity, Phone, MessageSquare,
  PlusCircle, Crown,
} from "lucide-react";
import { formatINR } from "@/lib/utils";

export const metadata = { title: "HiVR Business — Dashboard" };
export const dynamic = "force-dynamic";

export default async function BusinessDashboard() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/business/dashboard");

  // Pull the business profile + subscription + counts in parallel
  const { data: bp } = await sb.from("business_profiles")
    .select("*").eq("owner_user_id", user.id).maybeSingle();
  if (!bp) redirect("/onboarding/business");

  const [subRes, jobsRes, openAppsRes, contractsRes, employeesRes, disputesRes, paymentsRes, recentJobsRes, recentAppsRes, recentContractsRes, recentCallsRes, recentMessagesRes, recentDisputesRes] = await Promise.all([
    sb.from("business_subscriptions").select("plan_key, status, current_period_end, current_period_start, month_to_date_spend_paise, lifetime_spend_paise, seats_used, active_jobs_count, active_contracts_count")
      .eq("business_id", bp.id).in("status", ["active", "trialing"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("business_jobs").select("id", { count: "exact", head: true }).eq("business_id", bp.id).eq("status", "open"),
    sb.from("business_applicants").select("id, status").eq("status", "pending"),
    sb.from("contracts").select("id, agreed_price, status").eq("business_id", bp.id),
    sb.from("business_members").select("id, is_hired, status").eq("business_id", bp.id).eq("status", "active").eq("is_hired", true),
    sb.from("business_disputes").select("id, status").eq("business_id", bp.id).in("status", ["open", "under_review"]),
    sb.from("payments").select("amount_inr, status").eq("status", "captured"),
    sb.from("business_jobs").select("id, title, status, positions, positions_filled, created_at, employment_type, wage_min_paise, wage_max_paise").eq("business_id", bp.id).order("created_at", { ascending: false }).limit(5),
    sb.from("business_applicants").select("id, cover_note, applied_at, status, job_id, user:users!business_applicants_user_id_fkey(full_name, avatar_url)").eq("job_id", "(SELECT id FROM business_jobs WHERE business_id = '" + bp.id + "' ORDER BY created_at DESC LIMIT 1)").order("applied_at", { ascending: false }).limit(5),
    sb.from("contracts").select("id, agreed_price, status, started_at, employee_id, employee:users!contracts_employee_id_fkey(full_name, avatar_url)").eq("business_id", bp.id).order("started_at", { ascending: false }).limit(5),
    sb.from("business_calls").select("id, status, started_at, duration_sec, business_user_id, employee_user_id").eq("business_id", bp.id).order("started_at", { ascending: false }).limit(5),
    sb.from("messages").select("id, content, created_at, sender_id, contract_id").order("created_at", { ascending: false }).limit(5),
    sb.from("business_disputes").select("id, reason, status, created_at, raised_by_role").eq("business_id", bp.id).order("created_at", { ascending: false }).limit(5),
  ]);

  const sub = (subRes as any)?.data ?? null;
  const planKey = sub?.plan_key ?? "business_free";
  const planLimits: Record<string, { jobs: number; contracts: number; seats: number }> = {
    business_free:       { jobs: 1,  contracts: 1,  seats: 1 },
    business_pro:        { jobs: 10, contracts: 10, seats: 5 },
    business_enterprise: { jobs: -1, contracts: -1, seats: -1 },
  };
  const limits = planLimits[planKey];

  // Active counts
  const activeJobs = jobsRes?.count ?? 0;
  const pendingApplications = (openAppsRes as any)?.data?.length ?? 0;
  const contracts = (contractsRes as any)?.data ?? [];
  const activeContracts = contracts.filter((c: any) => c.status === "active").length;
  const totalContractValuePaise = contracts.reduce((s: number, c: any) => s + Number(c.agreed_price ?? 0), 0);
  const hiredEmployees = (employeesRes as any)?.data?.length ?? 0;
  const openDisputes = (disputesRes as any)?.data?.length ?? 0;
  const lifetimeSpendPaise = (sub as any)?.lifetime_spend_paise ?? bp.total_spend_paise ?? 0;
  const mtdSpendPaise = (sub as any)?.month_to_date_spend_paise ?? 0;

  return (
    <div className="container max-w-6xl space-y-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            {bp.brand_name || bp.legal_name}
          </h1>
          <p className="text-sm text-muted-foreground">HiVR Business · {planKey === "business_enterprise" ? "Enterprise" : planKey === "business_pro" ? "Pro" : "Free"} plan</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/business/jobs/new"><PlusCircle className="h-4 w-4" /> Post a job</Link>
          </Button>
          <Button asChild variant="gradient">
            <Link href="/business/jobs"><Briefcase className="h-4 w-4" /> Manage jobs</Link>
          </Button>
        </div>
      </header>

      {/* Plan + trial banner */}
      {planKey === "business_free" && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-amber-600" />
              <div>
                <p className="font-semibold">You're on the Free plan</p>
                <p className="text-xs text-muted-foreground">Upgrade to Pro for unlimited jobs, priority support, and advanced analytics.</p>
              </div>
            </div>
            <Button asChild variant="gradient" size="sm">
              <Link href="/business/subscription"><Crown className="h-4 w-4" /> See plans</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* KPI tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi Icon={Briefcase} label="Active jobs"
          value={`${activeJobs}${limits.jobs > 0 ? `/${limits.jobs}` : ""}`}
          hint={limits.jobs < 0 ? "Unlimited" : `${limits.jobs - activeJobs} slot${(limits.jobs - activeJobs) === 1 ? "" : "s"} left`} />
        <Kpi Icon={Users} label="Pending applicants" value={String(pendingApplications)} hint="awaiting your review" />
        <Kpi Icon={FileText} label="Active contracts"
          value={`${activeContracts}${limits.contracts > 0 ? `/${limits.contracts}` : ""}`}
          hint={`${formatINR(Math.round(totalContractValuePaise / 100))} total value`} />
        <Kpi Icon={Users} label="Hired employees" value={String(hiredEmployees)} hint={`${limits.seats > 0 ? limits.seats : "∞"} seats`} />
        <Kpi Icon={TrendingUp} label="MTD spend" value={formatINR(Math.round(mtdSpendPaise / 100))} hint="month-to-date" />
        <Kpi Icon={CreditCard} label="Lifetime spend" value={formatINR(Math.round(lifetimeSpendPaise / 100))} hint="since signup" />
        <Kpi Icon={AlertTriangle} label="Open disputes" value={String(openDisputes)} hint="manual + auto-decide" />
        <Kpi Icon={Phone} label="Calls this week" value={String((recentCallsRes as any)?.data?.length ?? 0)} hint="mediated via Twilio" />
      </div>

      {/* Funnel */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Hiring funnel</CardTitle>
            <CardDescription>From job post to active contract</CardDescription>
          </CardHeader>
          <CardContent>
            <Funnel
              steps={[
                { label: "Jobs posted",       value: (recentJobsRes as any)?.data?.length ?? 0 },
                { label: "Applicants",       value: pendingApplications },
                { label: "Active contracts",  value: activeContracts },
                { label: "Hired employees",  value: hiredEmployees },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Last 5 events across your business</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              ...((recentJobsRes as any)?.data ?? []).map((j: any) => ({ kind: "job", at: j.created_at, title: j.title, sub: `${j.positions - j.positions_filled} of ${j.positions} positions open` })),
              ...((recentAppsRes as any)?.data ?? []).map((a: any) => ({ kind: "applicant", at: a.applied_at, title: a.user?.full_name ?? "Applicant", sub: a.cover_note?.slice(0, 80) })),
              ...((recentContractsRes as any)?.data ?? []).map((c: any) => ({ kind: "contract", at: c.started_at, title: c.employee?.full_name ?? "Employee", sub: `${formatINR(Math.round((c.agreed_price ?? 0) / 100))} · ${c.status}` })),
              ...((recentDisputesRes as any)?.data ?? []).map((d: any) => ({ kind: "dispute", at: d.created_at, title: d.reason?.slice(0, 60) ?? "Dispute", sub: d.status })),
            ]
              .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
              .slice(0, 8)
              .map((evt, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <Activity className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium">{evt.title}</p>
                    <p className="text-xs text-muted-foreground">{evt.sub}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{timeAgo(evt.at)}</p>
                </div>
              ))}
            {((recentJobsRes as any)?.data?.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground">No activity yet. Post your first job to get started.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ActionCard href="/business/jobs/new"    Icon={Briefcase}      label="Post a job"        hint="Reach verified employees in minutes" />
        <ActionCard href="/business/applicants" Icon={Users}          label="Review applicants" hint="Shortlist + interview" />
        <ActionCard href="/business/contracts"  Icon={FileText}       label="Manage contracts"  hint="Milestones + escrow" />
        <ActionCard href="/business/disputes"   Icon={AlertTriangle}  label="Disputes"          hint="Manual + auto-decide" />
        <ActionCard href="/business/messages"   Icon={MessageSquare}  label="Messages"          hint="Mediated by Trust & Safety" />
        <ActionCard href="/business/calls"      Icon={Phone}          label="Calls"             hint="Twilio-mediated, no number leak" />
        <ActionCard href="/business/files"      Icon={FileText}       label="Files"             hint="Deliverables + contracts" />
        <ActionCard href="/business/subscription" Icon={Crown}        label="Subscription"     hint="Upgrade for unlimited" />
      </div>
    </div>
  );
}

function Kpi({ Icon, label, value, hint }: { Icon: any; label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase text-muted-foreground">{label}</span>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="mt-2 font-display text-2xl font-semibold">{value}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function ActionCard({ href, Icon, label, hint }: { href: string; Icon: any; label: string; hint: string }) {
  return (
    <Link href={href}>
      <Card className="h-full transition-colors hover:border-primary/50">
        <CardContent className="flex items-start gap-3 p-4">
          <Icon className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-semibold">{label}</p>
            <p className="text-xs text-muted-foreground">{hint}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const max = Math.max(1, ...steps.map(s => s.value));
  return (
    <div className="space-y-3">
      {steps.map((s, i) => (
        <div key={s.label} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">{s.label}</span>
            <span className="text-muted-foreground">{s.value}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-primary"
              style={{ width: `${(s.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function timeAgo(d: string): string {
  const t = new Date(d).getTime();
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
