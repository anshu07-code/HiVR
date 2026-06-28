import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { MilestoneActions } from "./milestone-actions";
import { ContractActions } from "./contract-actions";
import { formatINR } from "@/lib/utils";
import {
  ArrowLeft, FileText, User, Briefcase, Calendar, IndianRupee, ListChecks, Clock,
  ShieldCheck, AlertCircle, MessageCircle, Phone, Folder, ScrollText, CheckCircle2,
  XCircle, Hourglass,
} from "lucide-react";

export const metadata = { title: "HiVR Business — Contract" };
export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  pending: "secondary",
  completed: "outline",
  cancelled: "outline",
  disputed: "destructive",
};

const MILESTONE_STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; Icon: any }> = {
  pending:      { label: "Pending",      variant: "outline",     Icon: Hourglass },
  in_progress:  { label: "In progress",  variant: "secondary",   Icon: Clock },
  submitted:    { label: "Submitted",    variant: "secondary",   Icon: ScrollText },
  approved:     { label: "Approved",     variant: "default",     Icon: CheckCircle2 },
  rejected:     { label: "Rejected",     variant: "destructive", Icon: XCircle },
  paid:         { label: "Paid",         variant: "default",     Icon: CheckCircle2 },
};

export default async function BusinessContractDetailPage({ params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect(`/auth/signin?next=/business/contracts/${params.id}`);

  const { data: bp } = await sb.from("business_profiles").select("id, brand_name, legal_name, kyc_status, is_suspended").eq("owner_user_id", user.id).maybeSingle();
  if (!bp) redirect("/onboarding/business");

  // Pull the contract + employee + job + category
  const { data: contract } = await sb.from("contracts")
    .select("*, employee:users!contracts_employee_id_fkey(id, full_name, avatar_url, trust_tier, is_verified), job:business_jobs!contracts_business_job_id_fkey(id, title, employment_type), category:skill_categories!contracts_category_id_fkey(name, slug, tier)")
    .eq("id", params.id).eq("business_id", bp.id).maybeSingle();
  if (!contract) notFound();

  // Milestones (ordered) + deliverables
  const [{ data: milestones }, { data: deliverables }, { data: dispute }] = await Promise.all([
    sb.from("business_milestones").select("*").eq("contract_id", contract.id).order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
    sb.from("business_deliverables").select("*, submitted_by_user:users!business_deliverables_submitted_by_fkey(full_name, avatar_url)")
      .eq("contract_id", contract.id).order("submitted_at", { ascending: false }),
    sb.from("business_disputes").select("id, reason, status, raised_by_role, created_at, auto_decide_at, auto_split_at")
      .eq("contract_id", contract.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const ms = (milestones as any[]) ?? [];
  const ds = (deliverables as any[]) ?? [];

  // Detect sandbox / bypass mode (BYPASS_RAZORPAY_PAYOUTS is true OR key is a placeholder)
  const isSandbox = !process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID.includes("your-key") || process.env.BYPASS_RAZORPAY_PAYOUTS === "true";

  const totalPaise = ms.reduce((s, m) => s + Number(m.amount_paise), 0);
  const paidPaise = ms.filter(m => m.status === "paid").reduce((s, m) => s + Number(m.amount_paise), 0);
  const pendingPaise = totalPaise - paidPaise;
  const advancePaise = (contract as any).advance_paise ?? 0;
  const advancePaid = !!(contract as any).advance_paid_at;

  // Earliest pending / submitted milestone = "next action" for business
  const nextActionable = ms.find(m => m.status === "submitted" || m.status === "approved");

  return (
    <div className="container max-w-4xl space-y-5 py-8">
      <Button asChild variant="ghost" size="sm">
        <Link href="/business/contracts"><ArrowLeft className="h-4 w-4" /> Back to contracts</Link>
      </Button>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              {(contract as any).job?.title ?? "Contract"}
            </h1>
            <Badge variant={STATUS_VARIANT[(contract as any).status] ?? "outline"} className="capitalize">{(contract as any).status}</Badge>
            {(contract as any).category?.tier && (
              <Badge variant="outline" className="text-[10px]">{(contract as any).category.tier} · {(contract as any).category.name}</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            with <span className="font-medium text-foreground">{(contract as any).employee?.full_name}</span>
            {(contract as any).employee?.trust_tier && (
              <> · <Badge variant="outline" className="text-[10px]">{(contract as any).employee.trust_tier}</Badge></>
            )}
            {(contract as any).employee?.is_verified && <Badge variant="outline" className="ml-1 text-[10px] text-emerald-600 border-emerald-600/30">Verified</Badge>}
          </p>
        </div>
        <ContractActions
          contractId={(contract as any).id}
          status={(contract as any).status}
          hasAdvance={advancePaise > 0}
          advancePaid={advancePaid}
          advancePaise={advancePaise}
          hasDispute={!!(dispute as any)?.id}
          businessName={bp.brand_name || bp.legal_name}
          employeeName={(contract as any).employee?.full_name ?? "Employee"}
        />
      </header>

      {isSandbox && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex items-center gap-2 p-3 text-xs text-amber-700 dark:text-amber-300">
            <AlertCircle className="h-3.5 w-3.5" />
            <span>Sandbox mode — payments complete instantly without charging any card. Set <code className="rounded bg-amber-500/10 px-1 py-0.5">RAZORPAY_KEY_ID</code> in <code>.env.local</code> for real payments.</span>
          </CardContent>
        </Card>
      )}

      {!!(dispute as any)?.id && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <span className="font-medium">Dispute raised by {((dispute as any)?.raised_by_role ?? "—")}:</span>
              <span className="text-muted-foreground">{(dispute as any)?.reason}</span>
            </div>
            <Button asChild size="sm" variant="outline"><Link href="/business/disputes">View disputes</Link></Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-5 lg:col-span-2">
          {/* Milestones */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ListChecks className="h-4 w-4" /> Milestones</CardTitle>
              <CardDescription>
                {ms.length} milestone{ms.length === 1 ? "" : "s"} · {formatINR(Math.round(paidPaise / 100))} of {formatINR(Math.round(totalPaise / 100))} released
              </CardDescription>
            </CardHeader>
            <CardContent>
              {ms.length === 0 ? (
                <p className="text-sm text-muted-foreground">No milestones defined for this contract.</p>
              ) : (
                <ol className="space-y-3">
                  {ms.map((m, i) => {
                    const meta = MILESTONE_STATUS[m.status] ?? MILESTONE_STATUS.pending;
                    return (
                      <li key={m.id} className="rounded-md border p-3">
                        <div className="flex flex-wrap items-start gap-2">
                          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">{i + 1}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium">{m.title}</p>
                              <Badge variant={meta.variant} className="gap-1">
                                <meta.Icon className="h-3 w-3" /> {meta.label}
                              </Badge>
                            </div>
                            {m.description && <p className="mt-0.5 text-sm text-muted-foreground">{m.description}</p>}
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                              <span className="inline-flex items-center gap-1"><IndianRupee className="h-3 w-3" />{formatINR(Math.round(m.amount_paise / 100))}</span>
                              {m.due_date && <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />Due {new Date(m.due_date).toLocaleDateString()}</span>}
                              {m.submitted_at && <span>Submitted {new Date(m.submitted_at).toLocaleDateString()}</span>}
                              {m.paid_at && <span className="text-emerald-600">Paid {new Date(m.paid_at).toLocaleDateString()}</span>}
                            </div>
                          </div>
                          <MilestoneActions
                            contractId={(contract as any).id}
                            milestoneId={m.id}
                            status={m.status}
                            amountPaise={m.amount_paise}
                            nextActionable={m.id === nextActionable?.id}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardContent>
          </Card>

          {/* Deliverables */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ScrollText className="h-4 w-4" /> Deliverables</CardTitle>
              <CardDescription>{ds.length} submitted</CardDescription>
            </CardHeader>
            <CardContent>
              {ds.length === 0 ? (
                <p className="text-sm text-muted-foreground">No deliverables submitted yet.</p>
              ) : (
                <ul className="space-y-3">
                  {ds.map((d: any) => (
                    <li key={d.id} className="rounded-md border p-3">
                      <div className="flex flex-wrap items-start gap-2">
                        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {(d.submitted_by_user?.full_name ?? "?").slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{d.title}</p>
                            <Badge variant={
                              d.status === "approved" ? "default" :
                              d.status === "rejected" ? "destructive" :
                              d.status === "changes_requested" ? "secondary" : "outline"
                            } className="capitalize">{d.status.replace("_", " ")}</Badge>
                          </div>
                          <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">{d.summary}</p>
                          <p className="mt-1 text-xs text-muted-foreground">Submitted {new Date(d.submitted_at).toLocaleString()}</p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Escrow</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Contract value" value={formatINR(Math.round(totalPaise / 100))} />
              <Row label="Released so far" value={formatINR(Math.round(paidPaise / 100))} />
              <Row label="In escrow" value={formatINR(Math.round(pendingPaise / 100))} highlight />
              <Separator />
              <Row label="Advance" value={advancePaise > 0 ? formatINR(Math.round(advancePaise / 100)) : "—"} sub={advancePaise > 0 ? (advancePaid ? `paid ${new Date((contract as any).advance_paid_at).toLocaleDateString()}` : "pending payment") : undefined} />
              <div className="space-y-1">
                <div className="h-2 w-full rounded-full bg-muted">
                  <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${totalPaise > 0 ? (paidPaise / totalPaise) * 100 : 0}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">{totalPaise > 0 ? Math.round((paidPaise / totalPaise) * 100) : 0}% released</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Quick actions</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Button asChild variant="outline" className="w-full justify-start"><Link href={`/business/messages?with=${(contract as any).employee?.id}`}><MessageCircle className="h-4 w-4" /> Message</Link></Button>
              <Button asChild variant="outline" className="w-full justify-start"><Link href={`/business/calls?to=${(contract as any).employee?.id}`}><Phone className="h-4 w-4" /> Schedule call</Link></Button>
              <Button asChild variant="outline" className="w-full justify-start"><Link href={`/business/files?contract=${(contract as any).id}`}><Folder className="h-4 w-4" /> Files</Link></Button>
              {(contract as any).job && (
                <Button asChild variant="outline" className="w-full justify-start"><Link href={`/business/jobs/${(contract as any).job.id}`}><Briefcase className="h-4 w-4" /> View job</Link></Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Timeline</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Started" value={new Date((contract as any).started_at).toLocaleDateString()} />
              {(contract as any).delivered_at && <Row label="Delivered" value={new Date((contract as any).delivered_at).toLocaleDateString()} />}
              {(contract as any).approved_at && <Row label="Approved" value={new Date((contract as any).approved_at).toLocaleDateString()} />}
              <Row label="Pricing" value={(contract as any).pricing_model ?? "—"} />
              <Row label="Mode" value={(contract as any).payment_mode ?? "—"} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <div className="text-right">
        <p className={highlight ? "font-display text-base font-semibold text-primary" : "font-medium"}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}
