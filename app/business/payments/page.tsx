import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IndianRupee, ArrowDownRight, ArrowUpRight, Wallet, Search, RefreshCcw, ListChecks, Clock, CheckCircle2, XCircle, AlertTriangle, FileText } from "lucide-react";
import { formatINR } from "@/lib/utils";
import { RefundButton } from "./refund-button";

export const metadata = { title: "HiVR Business — Payments" };
export const dynamic = "force-dynamic";

const TYPE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  advance: "secondary",
  release: "default",
  refund:  "destructive",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  captured: "default",
  in_escrow: "secondary",
  released: "default",
  refunded: "destructive",
  failed: "destructive",
  pending: "secondary",
};

export default async function BusinessPaymentsPage({ searchParams }: { searchParams: { q?: string; type?: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/business/payments");
  const { data: bp } = await sb.from("business_profiles")
    .select("id, brand_name, legal_name, is_suspended").eq("owner_user_id", user.id).maybeSingle();
  if (!bp) redirect("/onboarding/business");

  // Pull all contracts + their milestones to build a unified tx list
  const [{ data: contracts }, { data: milestones }] = await Promise.all([
    sb.from("contracts")
      .select("id, status, agreed_price, advance_paise, advance_paid_at, advance_payment_id, employee:users!contracts_employee_id_fkey(id, full_name, trust_tier), job:business_jobs!contracts_business_job_id_fkey(id, title)")
      .eq("business_id", bp.id)
      .order("started_at", { ascending: false }),
    sb.from("business_milestones")
      .select("id, title, amount_paise, status, paid_at, payment_id, contract_id, contract:contracts!business_milestones_contract_id_fkey(id, business_id, employee:users!contracts_employee_id_fkey(id, full_name), job:business_jobs!contracts_business_job_id_fkey(id, title))")
      .eq("contract.business_id", bp.id)
      .order("paid_at", { ascending: false, nullsFirst: false }),
  ]);

  // Also pull any explicit payment rows (for refunds or future flows)
  const { data: paymentRows } = await sb.from("payments")
    .select("id, amount, platform_fee_amount, status, razorpay_payment_id, created_at, contract_id, contract:contracts!payments_contract_id_fkey(id, business_id, employee:users!contracts_employee_id_fkey(id, full_name), job:business_jobs!contracts_business_job_id_fkey(id, title))")
    .eq("contract.business_id", bp.id)
    .order("created_at", { ascending: false });

  type Tx = {
    id: string;
    type: "advance" | "release" | "refund";
    status: string;
    amountPaise: number;
    at: string;
    employeeName: string;
    jobTitle: string;
    contractId: string;
    milestoneId?: string;
    razorpayId?: string;
    canRefund: boolean;
  };

  const txs: Tx[] = [];

  // Advances
  for (const c of (contracts as any[]) ?? []) {
    if (c.advance_paid_at && c.advance_paise > 0) {
      txs.push({
        id: `adv_${c.id}`,
        type: "advance",
        status: "in_escrow",
        amountPaise: Number(c.advance_paise),
        at: c.advance_paid_at,
        employeeName: c.employee?.full_name ?? "Employee",
        jobTitle: c.job?.title ?? "—",
        contractId: c.id,
        razorpayId: c.advance_payment_id,
        canRefund: false,
      });
    }
  }

  // Milestone releases
  for (const m of (milestones as any[]) ?? []) {
    if (m.paid_at && (m.status === "paid" || m.status === "approved")) {
      txs.push({
        id: `ms_${m.id}`,
        type: "release",
        status: m.status,
        amountPaise: Number(m.amount_paise),
        at: m.paid_at,
        employeeName: m.contract?.employee?.full_name ?? "Employee",
        jobTitle: m.contract?.job?.title ?? "—",
        contractId: m.contract_id,
        milestoneId: m.id,
        razorpayId: m.payment_id,
        canRefund: true,
      });
    }
  }

  // Refunds (from payments table where status=refunded)
  for (const p of (paymentRows as any[]) ?? []) {
    if (p.status === "refunded") {
      txs.push({
        id: `rf_${p.id}`,
        type: "refund",
        status: "refunded",
        amountPaise: Number(p.amount),
        at: p.created_at,
        employeeName: p.contract?.employee?.full_name ?? "Employee",
        jobTitle: p.contract?.job?.title ?? "—",
        contractId: p.contract_id,
        razorpayId: p.razorpay_payment_id,
        canRefund: false,
      });
    }
  }

  // Sort newest first
  txs.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  // Filters
  const q = (searchParams?.q ?? "").toLowerCase().trim();
  const type = (searchParams?.type ?? "all") as "all" | "advance" | "release" | "refund";
  const filtered = txs.filter(t => {
    if (type !== "all" && t.type !== type) return false;
    if (q && !(t.employeeName.toLowerCase().includes(q) || t.jobTitle.toLowerCase().includes(q))) return false;
    return true;
  });

  // Aggregates
  const totalReleased = txs.filter(t => t.type === "release").reduce((s, t) => s + t.amountPaise, 0);
  const totalInEscrow = txs.filter(t => t.type === "advance" && t.status === "in_escrow").reduce((s, t) => s + t.amountPaise, 0);
  const totalRefunded = txs.filter(t => t.type === "refund").reduce((s, t) => s + t.amountPaise, 0);

  return (
    <div className="container max-w-5xl space-y-5 py-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Payments</h1>
        <p className="text-sm text-muted-foreground">
          Advance payments, milestone releases, and refunds. All transactions through HiVR.
        </p>
      </header>

      {/* KPI tiles */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase text-muted-foreground">In escrow</p>
              <Wallet className="h-4 w-4 text-amber-600" />
            </div>
            <p className="mt-1 font-display text-2xl font-semibold">{formatINR(Math.round(totalInEscrow / 100))}</p>
            <p className="mt-1 text-xs text-muted-foreground">awaiting milestone release</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase text-muted-foreground">Released</p>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mt-1 font-display text-2xl font-semibold">{formatINR(Math.round(totalReleased / 100))}</p>
            <p className="mt-1 text-xs text-muted-foreground">across {txs.filter(t => t.type === "release").length} milestones</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase text-muted-foreground">Refunded</p>
              <RefreshCcw className="h-4 w-4 text-destructive" />
            </div>
            <p className="mt-1 font-display text-2xl font-semibold">{formatINR(Math.round(totalRefunded / 100))}</p>
            <p className="mt-1 text-xs text-muted-foreground">{txs.filter(t => t.type === "refund").length} refunds total</p>
          </CardContent>
        </Card>
      </div>

      {/* Type filters + search */}
      <div className="flex flex-wrap items-center gap-2">
        {["all", "advance", "release", "refund"].map(t => (
          <Link key={t} href={`/business/payments?type=${t}`}>
            <Badge variant={type === t ? "default" : "secondary"} className="px-3 py-1 capitalize">{t}</Badge>
          </Link>
        ))}
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            name="q"
            defaultValue={searchParams?.q}
            placeholder="Search by employee or job…"
            className="h-9 w-64 rounded-md border bg-background pl-8 pr-3 text-sm"
          />
        </div>
      </div>

      {/* TX list */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <IndianRupee className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {q || type !== "all" ? "No transactions match your filters." : "No payments yet. Once you send an offer and pay the advance, it'll show up here."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => {
            const Icon = t.type === "advance" ? Clock : t.type === "release" ? ArrowUpRight : ArrowDownRight;
            const colour = t.type === "advance" ? "text-amber-600" : t.type === "release" ? "text-emerald-600" : "text-destructive";
            return (
              <Card key={t.id}>
                <CardContent className="flex flex-wrap items-center gap-3 p-3">
                  <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted ${colour}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="font-medium">
                        {t.type === "advance" && "Advance paid"}
                        {t.type === "release" && "Milestone released"}
                        {t.type === "refund" && "Refund issued"}
                      </p>
                      <Badge variant={TYPE_VARIANT[t.type]} className="text-[10px] capitalize">{t.type}</Badge>
                      <Badge variant={STATUS_VARIANT[t.status] ?? "outline"} className="text-[10px] capitalize">{t.status.replace("_", " ")}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <Link href={`/business/contracts/${t.contractId}`} className="text-primary underline">{t.jobTitle}</Link>
                      {" · "}
                      {t.employeeName}
                      {" · "}
                      {new Date(t.at).toLocaleString()}
                    </p>
                    {t.razorpayId && (
                      <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{t.razorpayId}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-display text-lg font-semibold">
                      <span className={t.type === "refund" ? "text-destructive" : ""}>
                        {t.type === "refund" ? "−" : "+"}{formatINR(Math.round(t.amountPaise / 100))}
                      </span>
                    </p>
                    {t.canRefund && (
                      <RefundButton milestoneId={t.milestoneId!} contractId={t.contractId} amountPaise={t.amountPaise} />
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="flex items-start gap-2 p-4 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <p><strong>Refunds are serious.</strong> Refunding a released milestone reverses the payment to you, may damage the relationship with the employee, and triggers a strike on the employee's account. Reach out to the employee first via messages — most disputes resolve amicably.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
