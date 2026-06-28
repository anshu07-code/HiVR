import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, MessageCircle, Phone, FileText, Briefcase, Calendar, IndianRupee, ListChecks, TrendingUp, Wallet, User, Shield } from "lucide-react";
import { formatINR } from "@/lib/utils";

export const metadata = { title: "HiVR Business — Employee" };
export const dynamic = "force-dynamic";

const MILESTONE_STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending:     { label: "Pending",     variant: "outline" },
  in_progress: { label: "In progress", variant: "secondary" },
  submitted:   { label: "Submitted",   variant: "secondary" },
  approved:    { label: "Approved",    variant: "default" },
  rejected:    { label: "Rejected",    variant: "destructive" },
  paid:        { label: "Paid",        variant: "default" },
};

export default async function BusinessEmployeeDetailPage({ params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect(`/auth/signin?next=/business/employees/${params.id}`);
  const { data: bp } = await sb.from("business_profiles")
    .select("id, brand_name, legal_name, is_suspended").eq("owner_user_id", user.id).maybeSingle();
  if (!bp) redirect("/onboarding/business");

  // Verify the employee is a member of this business
  const { data: member } = await sb.from("business_members")
    .select("id, member_role, is_hired, hired_at, status")
    .eq("business_id", bp.id).eq("user_id", params.id).maybeSingle();
  if (!member) notFound();

  // Pull the employee
  const { data: employee } = await sb.from("users")
    .select("id, full_name, avatar_url, trust_tier, is_verified, current_mode, created_at, upi_id, upi_verified_at")
    .eq("id", params.id).maybeSingle();
  if (!employee) notFound();

  // Pull contracts + milestones + skills
  const [{ data: contracts }, { data: milestones }, { data: empProfile }] = await Promise.all([
    sb.from("contracts")
      .select("id, status, agreed_price, started_at, delivered_at, approved_at, payment_mode, job:business_jobs!contracts_business_job_id_fkey(id, title), category:skill_categories!contracts_category_id_fkey(name, tier)")
      .eq("business_id", bp.id).eq("employee_id", params.id)
      .order("started_at", { ascending: false }),
    sb.from("business_milestones")
      .select("id, title, amount_paise, status, due_date, paid_at, submitted_at, contract_id, contract:contracts!business_milestones_contract_id_fkey(id, status, employee_id)")
      .eq("contract.business_id", bp.id).eq("contract.employee_id", params.id)
      .order("created_at", { ascending: true }),
    sb.from("employee_profiles")
      .select("bio, headline, years_experience, skills")
      .eq("user_id", params.id).maybeSingle(),
  ]);

  const cs = (contracts as any[]) ?? [];
  const ms = (milestones as any[]) ?? [];

  // Aggregates
  const totalContractPaise = cs.reduce((s, c) => s + Number(c.agreed_price ?? 0), 0);
  const paidPaise = ms.filter(m => m.status === "paid" || m.status === "approved").reduce((s, m) => s + Number(m.amount_paise), 0);
  const pendingPaise = ms.filter(m => ["pending", "in_progress", "submitted"].includes(m.status)).reduce((s, m) => s + Number(m.amount_paise), 0);
  const activeContracts = cs.filter(c => c.status === "active" || c.status === "pending").length;
  const completedContracts = cs.filter(c => c.status === "completed").length;

  // Group milestones by contract for the timeline
  const milestonesByContract = new Map<string, any[]>();
  for (const m of ms) {
    const arr = milestonesByContract.get(m.contract_id) ?? [];
    arr.push(m);
    milestonesByContract.set(m.contract_id, arr);
  }

  // MTD / last 30d
  const now = Date.now();
  const last30d = ms.filter(m => m.paid_at && (now - new Date(m.paid_at).getTime()) < 30 * 86400_000);
  const last30dPaidPaise = last30d.reduce((s, m) => s + Number(m.amount_paise), 0);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const mtdPaidPaise = ms.filter(m => m.paid_at && new Date(m.paid_at) >= monthStart).reduce((s, m) => s + Number(m.amount_paise), 0);

  return (
    <div className="container max-w-4xl space-y-5 py-8">
      <Button asChild variant="ghost" size="sm">
        <Link href="/business/employees"><ArrowLeft className="h-4 w-4" /> Back to employees</Link>
      </Button>

      <header className="flex flex-wrap items-start gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
          {(employee.full_name ?? "?").slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h1 className="font-display text-2xl font-semibold tracking-tight">{employee.full_name}</h1>
            <Badge variant="outline" className="text-[10px]">{employee.trust_tier ?? "Unranked"}</Badge>
            {employee.is_verified && <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-600/30">Verified</Badge>}
            <Badge variant="secondary" className="capitalize">{(member as any).member_role}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {(empProfile as any)?.headline ?? "HiVR employee"} · {(employee as any).upi_verified_at ? "UPI verified" : "UPI not set"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="outline"><Link href={`/business/messages/${employee.id}`}><MessageCircle className="h-3.5 w-3.5" /> Message</Link></Button>
          <Button asChild size="sm" variant="outline"><Link href={`/business/calls?to=${employee.id}`}><Phone className="h-3.5 w-3.5" /> Call</Link></Button>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-5 lg:col-span-2">
          {/* Payroll KPIs */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Wallet className="h-4 w-4" /> Payroll breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Kpi label="Total contracts" value={String(cs.length)} sub={`${activeContracts} active`} />
                <Kpi label="Contract value" value={formatINR(Math.round(totalContractPaise / 100))} sub="agreed price" />
                <Kpi label="Released" value={formatINR(Math.round(paidPaise / 100))} sub="lifetime" />
                <Kpi label="In escrow" value={formatINR(Math.round(pendingPaise / 100))} sub="awaiting approval" />
              </div>
              <Separator className="my-4" />
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">This month</p>
                  <p className="font-display text-lg font-semibold">{formatINR(Math.round(mtdPaidPaise / 100))}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Last 30 days</p>
                  <p className="font-display text-lg font-semibold">{formatINR(Math.round(last30dPaidPaise / 100))}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Completed</p>
                  <p className="font-display text-lg font-semibold">{completedContracts}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Contracts + milestones timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Briefcase className="h-4 w-4" /> Contracts & milestones</CardTitle>
              <CardDescription>Per-day / per-task / per-milestone breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              {cs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No contracts with this employee yet.</p>
              ) : (
                <ol className="space-y-4">
                  {cs.map((c) => {
                    const list = milestonesByContract.get(c.id) ?? [];
                    return (
                      <li key={c.id} className="rounded-md border p-3">
                        <div className="flex flex-wrap items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Link href={`/business/contracts/${c.id}`} className="font-semibold text-primary hover:underline">
                                {c.job?.title ?? "Contract"}
                              </Link>
                              <Badge variant={
                                c.status === "active" ? "default" :
                                c.status === "completed" ? "outline" :
                                c.status === "cancelled" ? "outline" : "secondary"
                              } className="capitalize">{c.status}</Badge>
                              {c.category?.tier && (
                                <Badge variant="outline" className="text-[10px]">{c.category.tier}</Badge>
                              )}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                              <span className="inline-flex items-center gap-1"><IndianRupee className="h-3 w-3" />{formatINR(Math.round(c.agreed_price / 100))} total</span>
                              {c.started_at && <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(c.started_at).toLocaleDateString()}</span>}
                              {c.payment_mode && <span>· {c.payment_mode}</span>}
                            </div>
                          </div>
                        </div>
                        {list.length > 0 && (
                          <div className="mt-2 space-y-1.5 border-t pt-2">
                            {list.map((m) => {
                              const meta = MILESTONE_STATUS[m.status] ?? MILESTONE_STATUS.pending;
                              return (
                                <div key={m.id} className="flex flex-wrap items-center gap-2 text-xs">
                                  <Badge variant={meta.variant} className="text-[10px] capitalize">{meta.label}</Badge>
                                  <span className="min-w-0 flex-1 truncate">{m.title}</span>
                                  <span className="text-muted-foreground">{formatINR(Math.round(m.amount_paise / 100))}</span>
                                  {m.paid_at && <span className="text-emerald-600">{new Date(m.paid_at).toLocaleDateString()}</span>}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {(empProfile as any)?.bio && (
            <Card>
              <CardHeader><CardTitle className="text-base">About</CardTitle></CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{(empProfile as any).bio}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">Skills</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {((empProfile as any)?.skills as string[] ?? []).map((s: string) => (
                  <Badge key={s} variant="secondary">{s}</Badge>
                ))}
                {(!((empProfile as any)?.skills) || (empProfile as any).skills.length === 0) && (
                  <p className="text-sm text-muted-foreground">No skills listed.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Account</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Hired" value={(member as any).hired_at ? new Date((member as any).hired_at).toLocaleDateString() : "—"} />
              <Row label="Role" value={(member as any).member_role} />
              <Row label="Status" value={(member as any).status} />
              <Row label="HiVR member since" value={new Date((employee as any).created_at).toLocaleDateString()} />
              <Row label="Payout method" value={(employee as any).upi_id ? `${(employee as any).upi_id} (UPI)` : "—"} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-display text-xl font-semibold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium capitalize">{value}</span>
    </div>
  );
}
