import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, IndianRupee, Briefcase, Calendar, Search, Wallet } from "lucide-react";
import { formatINR } from "@/lib/utils";
import { getBusinessPlan } from "@/lib/plan-gate";

export const metadata = { title: "HiVR Business — Employees" };
export const dynamic = "force-dynamic";

export default async function BusinessEmployeesPage({ searchParams }: { searchParams: { q?: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/business/employees");
  const { data: bp } = await sb.from("business_profiles").select("id, brand_name, legal_name").eq("owner_user_id", user.id).maybeSingle();
  if (!bp) redirect("/onboarding/business");

  const plan = await getBusinessPlan(bp.id);

  // Pull all business members marked as hired
  const { data: members } = await sb.from("business_members")
    .select("id, user_id, member_role, is_hired, hired_at, status, user:users!business_members_user_id_fkey(id, full_name, avatar_url, trust_tier, is_verified)")
    .eq("business_id", bp.id)
    .eq("status", "active")
    .order("hired_at", { ascending: false, nullsFirst: false });

  // For each hired employee, pull their active contract + paid milestones totals
  const employeeIds = (members ?? []).map((m: any) => m.user_id);
  const [{ data: contracts }, { data: milestones }] = await Promise.all([
    employeeIds.length ? sb.from("contracts")
      .select("id, employee_id, status, agreed_price, started_at, approved_at, category:skill_categories!contracts_category_id_fkey(name)")
      .eq("business_id", bp.id).in("employee_id", employeeIds)
      .order("started_at", { ascending: false }) : { data: [] as any[] },
    employeeIds.length ? sb.from("business_milestones")
      .select("id, business_id, amount_paise, status, contract_id, paid_at, contract:contracts!business_milestones_contract_id_fkey(id, employee_id, business_id)")
      .eq("contract.business_id", bp.id) : { data: [] as any[] },
  ]);

  // Build per-employee aggregates
  type Agg = {
    user: any;
    hiredAt: string | null;
    memberRole: string;
    contracts: any[];
    activeContracts: number;
    completedContracts: number;
    totalContractPaise: number;
    paidPaise: number;
    pendingPaise: number;
    lastPaidAt: string | null;
  };
  const byEmployee = new Map<string, Agg>();
  for (const m of (members ?? []) as any[]) {
    if (!m.user) continue;
    byEmployee.set(m.user_id, {
      user: m.user,
      hiredAt: m.hired_at,
      memberRole: m.member_role,
      contracts: [],
      activeContracts: 0,
      completedContracts: 0,
      totalContractPaise: 0,
      paidPaise: 0,
      pendingPaise: 0,
      lastPaidAt: null,
    });
  }
  for (const c of (contracts as any[]) ?? []) {
    const a = byEmployee.get(c.employee_id);
    if (!a) continue;
    a.contracts.push(c);
    a.totalContractPaise += Number(c.agreed_price ?? 0);
    if (c.status === "active" || c.status === "pending") a.activeContracts += 1;
    if (c.status === "completed") a.completedContracts += 1;
  }
  for (const m of (milestones as any[]) ?? []) {
    const empId = m.contract?.employee_id;
    if (!empId) continue;
    const a = byEmployee.get(empId);
    if (!a) continue;
    if (m.status === "paid" || m.status === "approved") {
      a.paidPaise += Number(m.amount_paise);
      if (m.paid_at && (!a.lastPaidAt || m.paid_at > a.lastPaidAt)) {
        a.lastPaidAt = m.paid_at;
      }
    } else if (m.status === "pending" || m.status === "in_progress" || m.status === "submitted") {
      a.pendingPaise += Number(m.amount_paise);
    }
  }

  const list = Array.from(byEmployee.values());
  const q = (searchParams?.q ?? "").toLowerCase().trim();
  const filtered = q
    ? list.filter(a => (a.user?.full_name ?? "").toLowerCase().includes(q))
    : list;

  // Total payroll stats
  const totalPaid = list.reduce((s, a) => s + a.paidPaise, 0);
  const totalPending = list.reduce((s, a) => s + a.pendingPaise, 0);
  const activeCount = list.reduce((s, a) => s + a.activeContracts, 0);

  return (
    <div className="container max-w-5xl space-y-5 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Employees</h1>
          <p className="text-sm text-muted-foreground">
            {list.length} hired · {list.filter(a => a.activeContracts > 0).length} currently active
          </p>
        </div>
      </header>

      {/* KPI tiles */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase text-muted-foreground">Total payroll paid</p>
            <p className="mt-1 font-display text-2xl font-semibold">{formatINR(Math.round(totalPaid / 100))}</p>
            <p className="mt-1 text-xs text-muted-foreground">across {list.length} employees</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase text-muted-foreground">In escrow / pending</p>
            <p className="mt-1 font-display text-2xl font-semibold">{formatINR(Math.round(totalPending / 100))}</p>
            <p className="mt-1 text-xs text-muted-foreground">awaiting milestone approval</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase text-muted-foreground">Active contracts</p>
            <p className="mt-1 font-display text-2xl font-semibold">{activeCount}</p>
            <p className="mt-1 text-xs text-muted-foreground">across {plan.planName} plan ({plan.maxActiveContracts === -1 ? "∞" : plan.maxActiveContracts} max)</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          name="q"
          defaultValue={searchParams?.q}
          placeholder="Search by name…"
          className="h-9 w-full rounded-md border bg-background pl-8 pr-3 text-sm"
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <Users className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {q ? "No employees match that search." : "No hired employees yet. Send an offer to an applicant to hire them."}
            </p>
            {!q && (
              <Link href="/business/applicants" className="text-sm font-medium text-primary underline">
                Review applicants →
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => (
            <Link key={a.user?.id} href={`/business/employees/${a.user?.id}`}>
              <Card className="transition-colors hover:border-primary/50">
                <CardContent className="flex flex-wrap items-center gap-3 p-4">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 font-semibold text-primary">
                    {(a.user?.full_name ?? "?").slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{a.user?.full_name}</p>
                      {a.user?.trust_tier && (
                        <Badge variant="outline" className="text-[10px]">{a.user.trust_tier}</Badge>
                      )}
                      {a.user?.is_verified && (
                        <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-600/30">Verified</Badge>
                      )}
                      <Badge variant="secondary" className="text-[10px] capitalize">{a.memberRole}</Badge>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Briefcase className="h-3 w-3" />{a.activeContracts} active · {a.completedContracts} completed
                      </span>
                      {a.hiredAt && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3" />Hired {new Date(a.hiredAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Released</p>
                    <p className="font-display text-lg font-semibold">{formatINR(Math.round(a.paidPaise / 100))}</p>
                    {a.pendingPaise > 0 && (
                      <p className="text-[10px] text-muted-foreground">
                        + {formatINR(Math.round(a.pendingPaise / 100))} pending
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
