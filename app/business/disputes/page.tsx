import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Clock, FileText, CheckCircle2, XCircle, Hourglass } from "lucide-react";
import { formatINR } from "@/lib/utils";

export const metadata = { title: "HiVR Business — Disputes" };
export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  open: "destructive",
  under_review: "secondary",
  resolved_business: "outline",
  resolved_employee: "default",
  split: "outline",
  auto_split: "outline",
  cancelled: "outline",
};

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  under_review: "Under review",
  resolved_business: "Resolved (business)",
  resolved_employee: "Resolved (employee)",
  split: "Split",
  auto_split: "Auto-split (30d)",
  cancelled: "Cancelled",
};

export default async function BusinessDisputesPage({ searchParams }: { searchParams: { status?: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/business/disputes");
  const { data: bp } = await sb.from("business_profiles").select("id, brand_name, legal_name").eq("owner_user_id", user.id).maybeSingle();
  if (!bp) redirect("/onboarding/business");

  // Pull disputes
  const { data: disputes } = await sb.from("business_disputes")
    .select("id, status, reason, raised_by_role, raised_by_user_id, raised_at, auto_decide_at, resolved_at, resolved_in_favor_of, funds_held, strikes_added, contract_id, contract:contracts!business_disputes_contract_id_fkey(id, agreed_price, status, employee:users!contracts_employee_id_fkey(id, full_name, trust_tier))")
    .eq("business_id", bp.id)
    .order("created_at", { ascending: false });

  // Counts
  const all = (disputes as any[]) ?? [];
  const open = all.filter(d => d.status === "open" || d.status === "under_review");
  const resolved = all.filter(d => d.status !== "open" && d.status !== "under_review");
  const autoDecideSoon = open.filter(d => d.auto_decide_at && new Date(d.auto_decide_at).getTime() - Date.now() < 7 * 86400_000);

  // Status filter
  const filter = searchParams?.status ?? "all";
  const filtered = filter === "open"
    ? all.filter(d => d.status === "open" || d.status === "under_review")
    : filter === "resolved"
    ? all.filter(d => d.status !== "open" && d.status !== "under_review")
    : all;

  return (
    <div className="container max-w-5xl space-y-5 py-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Disputes</h1>
        <p className="text-sm text-muted-foreground">
          Mediated resolution for contracts in dispute. Funds are held in escrow until resolved.
        </p>
      </header>

      {/* KPI tiles */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase text-muted-foreground">Open</p>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </div>
            <p className="mt-1 font-display text-2xl font-semibold">{open.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">awaiting resolution</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase text-muted-foreground">Auto-decide soon</p>
              <Clock className="h-4 w-4 text-amber-600" />
            </div>
            <p className="mt-1 font-display text-2xl font-semibold">{autoDecideSoon.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">within the next 7 days</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase text-muted-foreground">Resolved</p>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mt-1 font-display text-2xl font-semibold">{resolved.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">all-time</p>
          </CardContent>
        </Card>
      </div>

      {/* Explainer */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">How disputes work</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1">
          <p>• <strong>7-day auto-decide:</strong> if neither party escalates with new evidence within 7 days, the system auto-decides based on the evidence already submitted.</p>
          <p>• <strong>30-day auto-split:</strong> unresolved disputes past 30 days automatically split the funds 50/50.</p>
          <p>• <strong>3-strike employee pause ladder:</strong> each lost dispute adds 1 strike. Strike 1 = 7-day pause, 2 = 30-day, 3 = 90-day, 4+ = permanent ban.</p>
        </CardContent>
      </Card>

      {/* Status filters */}
      <div className="flex flex-wrap gap-2">
        {["all", "open", "resolved"].map(s => (
          <Link key={s} href={`/business/disputes?status=${s}`}>
            <Badge variant={filter === s ? "default" : "secondary"} className="px-3 py-1 capitalize">{s}</Badge>
          </Link>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <FileText className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {filter === "open" ? "No open disputes. Nice." : "No disputes yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((d: any) => {
            const daysLeft = d.auto_decide_at
              ? Math.max(0, Math.ceil((new Date(d.auto_decide_at).getTime() - Date.now()) / 86400_000))
              : null;
            return (
              <Link key={d.id} href={`/business/disputes/${d.id}`}>
                <Card className="transition-colors hover:border-primary/50">
                  <CardContent className="flex flex-wrap items-start gap-3 p-4">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 font-semibold text-primary">
                      {(d.contract?.employee?.full_name ?? "?").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="font-semibold">{d.contract?.employee?.full_name ?? "Employee"}</p>
                        <Badge variant={STATUS_VARIANT[d.status] ?? "outline"} className="capitalize">
                          {STATUS_LABEL[d.status] ?? d.status}
                        </Badge>
                        {d.strikes_added > 0 && (
                          <Badge variant="destructive" className="text-[10px]">+{d.strikes_added} strike</Badge>
                        )}
                        {d.raised_by_role === "business" ? (
                          <Badge variant="outline" className="text-[10px]">You raised this</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">Raised by employee</Badge>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{d.reason}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span>Contract value: {formatINR(Math.round((d.contract?.agreed_price ?? 0) / 100))}</span>
                        {daysLeft !== null && (
                          <span className={daysLeft <= 2 ? "font-medium text-amber-600" : ""}>
                            Auto-decide in {daysLeft}d
                          </span>
                        )}
                        {d.funds_held && <span>· Funds held</span>}
                      </div>
                    </div>
                    <ArrowRight />
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

function ArrowRight() {
  return (
    <div className="grid h-8 w-8 shrink-0 place-items-center text-muted-foreground">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
    </div>
  );
}
