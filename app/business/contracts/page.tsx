import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Plus, Users, IndianRupee, Calendar, ListChecks, AlertCircle } from "lucide-react";
import { formatINR } from "@/lib/utils";

export const metadata = { title: "HiVR Business — Contracts" };
export const dynamic = "force-dynamic";

const STATUS_FILTERS = ["all", "active", "pending", "completed", "cancelled", "disputed"] as const;

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  pending: "secondary",
  completed: "outline",
  cancelled: "outline",
  disputed: "destructive",
  draft: "outline",
};

export default async function BusinessContractsListPage({ searchParams }: { searchParams: { status?: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/business/contracts");
  const { data: bp } = await sb.from("business_profiles").select("id").eq("owner_user_id", user.id).maybeSingle();
  if (!bp) redirect("/onboarding/business");

  const status = (searchParams?.status ?? "all") as typeof STATUS_FILTERS[number];

  // Pull contracts + employee + job + count of milestones + count of pending deliverables
  let q = sb.from("contracts")
    .select("id, status, agreed_price, started_at, delivered_at, approved_at, advance_paise, advance_paid_at, pricing_model, payment_mode, category_id, employee_id, business_job_id, employee:users!contracts_employee_id_fkey(id, full_name, avatar_url, trust_tier, is_verified), job:business_jobs!contracts_business_job_id_fkey(id, title)")
    .eq("business_id", bp.id)
    .order("started_at", { ascending: false });
  if (status !== "all") q = q.eq("status", status);
  const { data: contracts } = await q;

  // Aggregate counts per contract
  const ids = (contracts ?? []).map((c: any) => c.id);
  const [milestonesRes, deliverablesRes, activeSubRes] = await Promise.all([
    ids.length ? sb.from("business_milestones").select("id, contract_id, status, amount_paise").in("contract_id", ids) : { data: [] as any[] },
    ids.length ? sb.from("business_deliverables").select("id, contract_id, status").in("contract_id", ids) : { data: [] as any[] },
    sb.from("business_subscriptions").select("plan_key, status, active_contracts_count").eq("business_id", bp.id).in("status", ["active", "trialing"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const milestonesByContract = new Map<string, { total: number; pending: number; submitted: number; paid: number; pending_paise: number; paid_paise: number }>();
  for (const m of (milestonesRes.data as any[]) ?? []) {
    const entry = milestonesByContract.get(m.contract_id) ?? { total: 0, pending: 0, submitted: 0, paid: 0, pending_paise: 0, paid_paise: 0 };
    entry.total += 1;
    if (m.status === "pending" || m.status === "in_progress") { entry.pending += 1; entry.pending_paise += Number(m.amount_paise); }
    if (m.status === "submitted") entry.submitted += 1;
    if (m.status === "paid" || m.status === "approved") { entry.paid += 1; entry.paid_paise += Number(m.amount_paise); }
    milestonesByContract.set(m.contract_id, entry);
  }
  const pendingDeliverableByContract = new Map<string, number>();
  for (const d of (deliverablesRes.data as any[]) ?? []) {
    if (d.status === "submitted" || d.status === "under_review") {
      pendingDeliverableByContract.set(d.contract_id, (pendingDeliverableByContract.get(d.contract_id) ?? 0) + 1);
    }
  }

  const planKey = (activeSubRes as any)?.plan_key ?? "business_free";
  const activeContracts = (activeSubRes as any)?.active_contracts_count ?? 0;
  const planLimits: Record<string, number> = { business_free: 1, business_pro: 10, business_enterprise: -1 };
  const limit = planLimits[planKey];

  return (
    <div className="container max-w-5xl space-y-5 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Contracts</h1>
          <p className="text-sm text-muted-foreground">
            {contracts?.length ?? 0} contract{(contracts?.length ?? 0) === 1 ? "" : "s"}
            {limit > 0 && (
              <> · <span className="font-medium text-foreground">{activeContracts}/{limit}</span> active on your plan</>
            )}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/business/applicants"><Plus className="h-4 w-4" /> Send a new offer</Link>
        </Button>
      </header>

      {limit > 0 && activeContracts >= limit && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <span>You're on the Free plan ({limit} active contract{limit === 1 ? "" : "s"}). Upgrade to Pro for 10 active contracts.</span>
            </div>
            <Button asChild size="sm" variant="gradient"><Link href="/business/subscription">Upgrade</Link></Button>
          </CardContent>
        </Card>
      )}

      {/* Status filters */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map(s => (
          <Link key={s} href={`/business/contracts?status=${s}`}>
            <Badge variant={status === s ? "default" : "secondary"} className="px-3 py-1 capitalize">{s}</Badge>
          </Link>
        ))}
      </div>

      {(!contracts || contracts.length === 0) ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <FileText className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No contracts yet. Send an offer to an applicant to create one.</p>
            <Button asChild variant="gradient"><Link href="/business/applicants">Review applicants</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {contracts.map((c: any) => {
            const ms = milestonesByContract.get(c.id) ?? { total: 0, pending: 0, submitted: 0, paid: 0, pending_paise: 0, paid_paise: 0 };
            const pendingDeliverables = pendingDeliverableByContract.get(c.id) ?? 0;
            return (
              <Link key={c.id} href={`/business/contracts/${c.id}`}>
                <Card className="transition-colors hover:border-primary/50">
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 font-semibold text-primary">
                        {(c.employee?.full_name ?? "?").slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">{c.employee?.full_name ?? "Employee"}</h3>
                          <Badge variant={c.employee?.trust_tier === "Tier A" ? "default" : c.employee?.trust_tier === "Tier B" ? "secondary" : "outline"} className="text-[10px]">
                            {c.employee?.trust_tier ?? "Unranked"}
                          </Badge>
                          <Badge variant={STATUS_VARIANT[c.status] ?? "outline"} className="capitalize">{c.status}</Badge>
                          {pendingDeliverables > 0 && (
                            <Badge variant="destructive" className="text-[10px]">
                              {pendingDeliverables} deliverable{pendingDeliverables === 1 ? "" : "s"} to review
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {(c.job as any)?.title ?? "—"}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1"><IndianRupee className="h-3 w-3" />{formatINR(Math.round((c.agreed_price ?? 0) / 100))} total</span>
                          {ms.total > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <ListChecks className="h-3 w-3" />
                              {ms.paid}/{ms.total} milestones paid
                              {ms.submitted > 0 && <span className="text-amber-600">· {ms.submitted} submitted</span>}
                            </span>
                          )}
                          {c.advance_paise > 0 && (
                            <span className="inline-flex items-center gap-1">
                              Advance: {c.advance_paid_at ? <span className="text-emerald-600">paid</span> : <span className="text-amber-600">pending</span>}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />Started {new Date(c.started_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Released</p>
                        <p className="font-display text-lg font-semibold">{formatINR(Math.round(ms.paid_paise / 100))}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
