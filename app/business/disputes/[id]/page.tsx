import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, AlertTriangle, Clock, FileText, User, Calendar, IndianRupee, CheckCircle2, XCircle, Hourglass, ShieldAlert, MessageCircle } from "lucide-react";
import { formatINR } from "@/lib/utils";
import { DisputeActions } from "./dispute-actions";
import { AddEvidenceButton } from "./add-evidence-button";

export const metadata = { title: "HiVR Business — Dispute" };
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

export default async function BusinessDisputeDetailPage({ params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect(`/auth/signin?next=/business/disputes/${params.id}`);
  const { data: bp } = await sb.from("business_profiles").select("id, brand_name, legal_name, is_suspended")
    .eq("owner_user_id", user.id).maybeSingle();
  if (!bp) redirect("/onboarding/business");

  const { data: dispute } = await sb.from("business_disputes")
    .select("*, contract:contracts!business_disputes_contract_id_fkey(id, agreed_price, status, started_at, employee:users!contracts_employee_id_fkey(id, full_name, trust_tier, is_verified, employee_profiles(headline, bio)), raised_by:users!business_disputes_raised_by_user_id_fkey(id, full_name, trust_tier)")
    .eq("id", params.id).eq("business_id", bp.id).maybeSingle();
  if (!dispute) notFound();

  // Pull evidence
  const { data: evidence } = await sb.from("business_dispute_evidence")
    .select("id, content, evidence_type, file_url, submitted_by, submitted_by_role, created_at, submitter:users!business_dispute_evidence_submitted_by_fkey(full_name)")
    .eq("dispute_id", params.id)
    .order("created_at", { ascending: true });

  // Pull related messages (most recent 5)
  const { data: messages } = await sb.from("messages")
    .select("id, content, sender_id, created_at, blocked")
    .eq("contract_id", (dispute as any).contract_id)
    .order("created_at", { ascending: false })
    .limit(5);

  const d = dispute as any;
  const emp = d.contract?.employee;
  const daysLeft = d.auto_decide_at
    ? Math.max(0, Math.ceil((new Date(d.auto_decide_at).getTime() - Date.now()) / 86400_000))
    : null;
  const isOpen = d.status === "open" || d.status === "under_review";
  const isClosed = !isOpen;

  return (
    <div className="container max-w-4xl space-y-5 py-8">
      <Button asChild variant="ghost" size="sm">
        <Link href="/business/disputes"><ArrowLeft className="h-4 w-4" /> Back to disputes</Link>
      </Button>

      <header className="flex flex-wrap items-start gap-3">
        <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-lg ${isOpen ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-600"}`}>
          {isOpen ? <AlertTriangle className="h-6 w-6" /> : <CheckCircle2 className="h-6 w-6" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h1 className="font-display text-2xl font-semibold tracking-tight">Dispute on contract</h1>
            <Badge variant={STATUS_VARIANT[d.status] ?? "outline"} className="capitalize">{d.status.replace("_", " ")}</Badge>
            {d.strikes_added > 0 && <Badge variant="destructive" className="text-[10px]">+{d.strikes_added} strike to employee</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            with <Link href={`/business/employees/${emp?.id}`} className="text-primary underline">{emp?.full_name}</Link>
            {" · "}
            <Link href={`/business/contracts/${d.contract_id}`} className="text-primary underline">View contract</Link>
          </p>
        </div>
        {isOpen && (
          <Button asChild size="sm" variant="outline">
            <Link href={`/business/messages/${emp?.id}`}><MessageCircle className="h-3.5 w-3.5" /> Message employee</Link>
          </Button>
        )}
      </header>

      {/* Auto-decide countdown */}
      {isOpen && daysLeft !== null && (
        <Card className={daysLeft <= 2 ? "border-amber-500/40 bg-amber-500/5" : "border-blue-500/30 bg-blue-500/5"}>
          <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
            <div className="flex items-center gap-2">
              <Clock className={`h-4 w-4 ${daysLeft <= 2 ? "text-amber-600" : "text-blue-600"}`} />
              <span>
                {daysLeft === 0
                  ? "Auto-decide is due — admin will review and decide within 24h."
                  : `Auto-decide in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`}
              </span>
            </div>
            {daysLeft > 0 && (
              <span className="text-xs text-muted-foreground">on {new Date(d.auto_decide_at).toLocaleDateString()}</span>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-5 lg:col-span-2">
          {/* Reason */}
          <Card>
            <CardHeader>
              <CardTitle>Reason for dispute</CardTitle>
              <CardDescription>
                Raised by {d.raised_by?.full_name ?? "—"} on {new Date(d.created_at).toLocaleString()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{d.reason}</p>
            </CardContent>
          </Card>

          {/* Evidence */}
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>Evidence</CardTitle>
                <CardDescription>{(evidence as any[])?.length ?? 0} item{((evidence as any[])?.length ?? 0) === 1 ? "" : "s"} submitted</CardDescription>
              </div>
              {isOpen && <AddEvidenceButton disputeId={d.id} />}
            </CardHeader>
            <CardContent>
              {(!evidence || (evidence as any[]).length === 0) ? (
                <p className="text-sm text-muted-foreground">No evidence submitted yet.</p>
              ) : (
                <ol className="space-y-2">
                  {(evidence as any[]).map((e: any) => (
                    <li key={e.id} className="rounded-md border p-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Badge variant="outline" className="text-[10px] capitalize">{e.evidence_type}</Badge>
                        <Badge variant={e.submitted_by_role === "business" ? "default" : "secondary"} className="text-[10px] capitalize">{e.submitted_by_role}</Badge>
                        <span className="font-medium">{e.submitter?.full_name}</span>
                        <span className="text-muted-foreground">· {new Date(e.created_at).toLocaleString()}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{e.content}</p>
                      {e.file_url && (
                        <a href={e.file_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-primary underline">
                          View attached file
                        </a>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          {/* Resolution (if closed) */}
          {isClosed && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-4 w-4" /> Resolution</CardTitle>
                <CardDescription>
                  Resolved {d.resolved_at ? new Date(d.resolved_at).toLocaleString() : "—"} · {d.resolved_in_favor_of ?? d.status.replace("resolved_", "")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {d.resolution_notes && <p className="whitespace-pre-wrap text-muted-foreground">{d.resolution_notes}</p>}
                {d.funds_released_at && (
                  <p className="text-xs text-emerald-600">
                    Funds released on {new Date(d.funds_released_at).toLocaleString()} to {d.funds_released_to}
                  </p>
                )}
                {d.auto_decide_result && (
                  <p className="text-xs text-muted-foreground">Auto-decide result: {d.auto_decide_result}</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Contract</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Value" value={formatINR(Math.round((d.contract?.agreed_price ?? 0) / 100))} />
              <Row label="Status" value={d.contract?.status} />
              <Row label="Started" value={d.contract?.started_at ? new Date(d.contract.started_at).toLocaleDateString() : "—"} />
              <Row label="Funds held" value={d.funds_held ? "Yes (in escrow)" : "Released"} highlight={d.funds_held} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Employee</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {(emp?.full_name ?? "?").slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium">{emp?.full_name}</p>
                  <p className="text-xs text-muted-foreground">{emp?.employee_profiles?.headline ?? "—"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {isOpen && (
            <DisputeActions
              disputeId={d.id}
              contractId={d.contract_id}
              status={d.status}
              employeeName={emp?.full_name ?? "Employee"}
              raisedByRole={d.raised_by_role}
            />
          )}

          {/* Recent messages from the contract thread */}
          {messages && (messages as any[]).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent messages</CardTitle>
                <CardDescription>From the contract chat</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {(messages as any[]).map((m: any) => (
                  <div key={m.id} className="rounded-md border p-2 text-xs">
                    <p className="line-clamp-2 text-muted-foreground">{m.content}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">{new Date(m.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={highlight ? "font-medium text-amber-600" : "font-medium capitalize"}>{value}</span>
    </div>
  );
}
