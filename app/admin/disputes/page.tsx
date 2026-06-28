import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { clearApplicationPause, ladderCooldownDays } from "@/lib/auth-context";
import { revalidatePath } from "next/cache";
import { ShieldAlert, User2, RotateCcw, Ban, FileText } from "lucide-react";
import Link from "next/link";
import { DisputeResolutionForm } from "./dispute-resolution-form";
import { DisputeReprocessButton } from "./dispute-reprocess-button";
import { requireAdmin } from "@/lib/admin-auth";

export const metadata = { title: "Disputes — HiVR admin" };
export const dynamic = "force-dynamic";

export default async function AdminDisputes() {
  await requireAdmin();
  const sb = createClient();
  const { data: openDisputes } = await sb
    .from("disputes")
    .select("id, contract_id, raised_by, raised_by_role, dispute_type, reason, status, created_at, buyer_strike_applied, bad_faith_finding, refund_paise, payout_paise, platform_retained_paise, escrow_processed_at, escrow_processing_error, contract:contracts(buyer_id, employee_id, agreed_price, platform_fee_pct, status), users!disputes_raised_by_fkey(full_name, email, strike_count)")
    .in("status", ["open", "under_review"])
    .order("created_at");

  const { data: recentlyResolved } = await sb
    .from("disputes")
    .select("id, contract_id, status, resolved_at, refund_paise, payout_paise, platform_retained_paise, escrow_processed_at, escrow_processing_error, bad_faith_finding, contract:contracts(buyer_id, employee_id, agreed_price, status), users!disputes_raised_by_fkey(full_name, email)")
    .in("status", ["resolved_buyer", "resolved_employee", "split", "closed"])
    .order("resolved_at", { ascending: false })
    .limit(10);

  const openIds = (openDisputes ?? []).map((d: any) => d.id);
  const resolvedIds = (recentlyResolved ?? []).map((d: any) => d.id);
  const allIds = [...openIds, ...resolvedIds];

  // Pull evidence for both sets
  const evidenceByDispute: Record<string, any[]> = {};
  if (allIds.length > 0) {
    const { data: ev } = await sb
      .from("dispute_evidence")
      .select("id, dispute_id, submitted_by_role, evidence_type, content, file_url, created_at")
      .in("dispute_id", allIds)
      .order("created_at");
    for (const e of ev ?? []) {
      const k = (e as any).dispute_id;
      evidenceByDispute[k] = evidenceByDispute[k] ?? [];
      evidenceByDispute[k].push(e);
    }
  }

  // Pull the contract's payment row so we can preview the split
  const contractIds = Array.from(new Set([
    ...(openDisputes ?? []).map((d: any) => d.contract_id),
    ...(recentlyResolved ?? []).map((d: any) => d.contract_id),
  ]));
  const paymentByContract: Record<string, { amount: number; platform_fee_amount: number; razorpay_payment_id: string | null; status: string }> = {};
  if (contractIds.length > 0) {
    const { data: payments } = await sb
      .from("payments")
      .select("contract_id, amount, platform_fee_amount, razorpay_payment_id, status, created_at")
      .in("contract_id", contractIds)
      .order("created_at", { ascending: false });
    for (const p of payments ?? []) {
      const k = (p as any).contract_id;
      if (!paymentByContract[k]) paymentByContract[k] = p as any; // most recent
    }
  }

  const { data: paused } = await sb
    .from("employee_profiles")
    .select("user_id, application_paused_reason, application_paused_at, dispute_loss_count, pause_count, pause_ladder_step, last_pause_at, permanent_ban, unpause_log, users(full_name, email)")
    .eq("application_paused", true)
    .order("application_paused_at", { ascending: false });

  const { data: unpauseTickets } = await sb
    .from("support_tickets")
    .select("id, subject, status, priority, created_at, user_id, users(full_name, email)")
    .contains("tags", ["unpause_request"])
    .in("status", ["open", "pending", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div className="container max-w-4xl space-y-6 py-8">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Disputes</h1>
      <p className="text-sm text-muted-foreground">
        Resolve open disputes. The preview shows the refund / payout / retained split before you commit. Resolving against an employee increments their dispute-loss count and bumps the pause-ladder (7d → 30d → 90d → permanent). Resolved disputes with a failed Razorpay call can be reprocessed from the &quot;Recently resolved&quot; list below.
      </p>

      {/* Open disputes */}
      <div className="space-y-3">
        <h2 className="font-display text-xl font-semibold">Open</h2>
        {(openDisputes ?? []).length === 0 && <Card><CardContent className="p-6 text-sm text-muted-foreground">No open disputes. ✓</CardContent></Card>}
        {(openDisputes ?? []).map((d: any) => {
          const evidence = evidenceByDispute[d.id] ?? [];
          const disputedType = d.dispute_type ?? "general";
          const raisedByRole = d.raised_by_role ?? "employee";
          const buyerStrikeCount = d.users?.strike_count ?? 0;
          const payment = paymentByContract[d.contract_id];
          const disputedAmountPaise = Number(payment?.amount ?? d.contract?.agreed_price ?? 0);
          const platformFeePaise = Number(payment?.platform_fee_amount ?? Math.round(disputedAmountPaise * Number(d.contract?.platform_fee_pct ?? 0.20)));
          return (
            <Card key={d.id}>
              <CardContent className="space-y-3 p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-semibold">Dispute</div>
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {disputedType.replace("_", " ")}
                  </Badge>
                  <Badge variant={raisedByRole === "buyer" ? "destructive" : "secondary"} className="text-[10px] capitalize">
                    Raised by {raisedByRole}
                  </Badge>
                  {raisedByRole === "buyer" && (
                    <Badge variant="outline" className="text-[10px]">
                      Buyer strikes: <span className="ml-1 font-mono">{buyerStrikeCount}</span>
                    </Badge>
                  )}
                  {payment && (
                    <Badge variant="outline" className="text-[10px]">
                      Payment: <span className="ml-1 font-mono">{payment.status}</span>
                    </Badge>
                  )}
                  <div className="ml-auto text-xs text-muted-foreground">
                    raised by {d.users?.full_name ?? d.raised_by}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Reason</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{d.reason}</p>
                </div>
                {evidence.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
                      <FileText className="h-3 w-3" />Evidence ({evidence.length})
                    </p>
                    <ul className="mt-1 space-y-1 text-xs">
                      {evidence.map((e: any) => (
                        <li key={e.id} className="rounded-md border bg-muted/20 p-2">
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Badge variant="outline" className="text-[9px] capitalize">{e.submitted_by_role}</Badge>
                            <span className="capitalize">· {e.evidence_type}</span>
                            <span>· {new Date(e.created_at).toLocaleString()}</span>
                          </div>
                          {e.content && <p className="mt-1 whitespace-pre-wrap">{e.content}</p>}
                          {e.file_url && (
                            <a href={e.file_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-primary hover:underline">
                              {e.file_url}
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <DisputeResolutionForm
                  disputeId={d.id}
                  contractId={d.contract_id}
                  disputedAmountPaise={disputedAmountPaise}
                  platformFeePaise={platformFeePaise}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recently resolved (for reprocess + audit) */}
      <div className="space-y-3">
        <h2 className="font-display text-xl font-semibold">Recently resolved</h2>
        <p className="text-xs text-muted-foreground">
          Last 10 resolved disputes. If the Razorpay call failed, use the Reprocess button to retry.
        </p>
        {(recentlyResolved ?? []).length === 0 && <Card><CardContent className="p-5 text-sm text-muted-foreground">No recently resolved disputes.</CardContent></Card>}
        {(recentlyResolved ?? []).map((d: any) => {
          const inr = (p: number) => `₹${(p / 100).toFixed(2)}`;
          return (
            <Card key={d.id} className={d.escrow_processing_error ? "border-destructive/40" : ""}>
              <CardContent className="space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-semibold">Dispute</div>
                  <Badge variant="outline" className="text-[10px] capitalize">{d.status.replace("_", " ")}</Badge>
                  {d.bad_faith_finding && d.bad_faith_finding !== "none" && (
                    <Badge variant="destructive" className="text-[10px]">bad faith: {d.bad_faith_finding}</Badge>
                  )}
                  {d.escrow_processed_at
                    ? <Badge variant="success" className="text-[10px]">escrow processed</Badge>
                    : <Badge variant="outline" className="text-[10px]">escrow pending</Badge>}
                  {d.escrow_processing_error && (
                    <Badge variant="destructive" className="text-[10px]">Razorpay error</Badge>
                  )}
                  <div className="ml-auto text-xs text-muted-foreground">
                    resolved {d.resolved_at ? new Date(d.resolved_at).toLocaleString() : ""}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Refund {inr(Number(d.refund_paise ?? 0))} · Payout {inr(Number(d.payout_paise ?? 0))} · Retained {inr(Number(d.platform_retained_paise ?? 0))}
                </p>
                {d.escrow_processing_error && (
                  <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                    {d.escrow_processing_error}
                  </p>
                )}
                {(d.escrow_processing_error || !d.escrow_processed_at) && (
                  <DisputeReprocessButton disputeId={d.id} />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="space-y-3">
        <h2 className="font-display text-xl font-semibold">Unpause requests</h2>
        <p className="text-xs text-muted-foreground">
          Employees who have submitted proof or context to lift a pause. Review the ticket, then clear or keep the pause below.
        </p>
        {(unpauseTickets ?? []).length === 0 && <Card><CardContent className="p-5 text-sm text-muted-foreground">No open unpause requests. ✓</CardContent></Card>}
        {(unpauseTickets ?? []).map((t: any) => (
          <Card key={t.id} className="border-sky-500/30">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-start gap-2">
                <User2 className="mt-0.5 h-4 w-4 text-sky-600" />
                <div>
                  <p className="text-sm font-semibold">{(t.users as any)?.full_name ?? t.user_id}</p>
                  <p className="text-xs text-muted-foreground">{(t.users as any)?.email}</p>
                  <p className="mt-1 text-xs">
                    <Link href={`/admin/support/${t.id}`} className="text-sky-700 underline">{t.subject}</Link>
                    <span className="ml-2 text-muted-foreground capitalize">· {t.status.replace("_"," ")} · {t.priority}</span>
                  </p>
                </div>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link href={`/admin/support/${t.id}`}>Open ticket</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-3">
        <h2 className="font-display text-xl font-semibold">Paused employees</h2>
        <p className="text-xs text-muted-foreground">
          These accounts are blocked from submitting new applications. Ladder step & cooldown shown. Step 4+ is permanent and only admin can lift it.
        </p>
        {(paused ?? []).length === 0 && <Card><CardContent className="p-4 text-sm text-muted-foreground">No employees are currently paused. ✓</CardContent></Card>}
        {(paused ?? []).map((p: any) => {
          const step = (p as any).pause_ladder_step ?? 1;
          const cooldown = step >= 4 ? null : ladderCooldownDays(step);
          const lastPause = (p as any).last_pause_at ?? (p as any).application_paused_at;
          const daysRemaining = lastPause && cooldown
            ? Math.max(0, Math.ceil((new Date(lastPause).getTime() + cooldown * 86400000 - Date.now()) / 86400000))
            : null;
          return (
            <Card key={p.user_id} className={(p as any).permanent_ban ? "border-destructive/60" : "border-amber-500/30"}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex items-start gap-2">
                  {(p as any).permanent_ban
                    ? <Ban className="mt-0.5 h-4 w-4 text-destructive" />
                    : <ShieldAlert className="mt-0.5 h-4 w-4 text-amber-600" />}
                  <div>
                    <p className="text-sm font-semibold">{(p.users as any)?.full_name ?? p.user_id}</p>
                    <p className="text-xs text-muted-foreground">{(p.users as any)?.email}</p>
                    <p className={`mt-1 text-xs ${(p as any).permanent_ban ? "text-destructive" : "text-amber-700"}`}>{(p as any).application_paused_reason}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Ladder step <span className="font-mono">{step}/3</span> · prior pauses: <span className="font-mono">{(p as any).pause_count ?? 0}</span> · dispute losses: <span className="font-mono">{(p as any).dispute_loss_count ?? 0}</span>
                      {daysRemaining != null && <> · auto-unpause in <span className="font-mono">{daysRemaining}</span>d</>}
                      {(p as any).permanent_ban && <> · permanent</>}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <form action={async () => {
                    "use server";
                    await clearApplicationPause(p.user_id);
                    revalidatePath("/admin/disputes");
                  }}>
                    <Button type="submit" size="sm" variant="outline">Clear pause</Button>
                  </form>
                  <form action={async () => {
                    "use server";
                    await clearApplicationPause(p.user_id, { resetLadder: true, reason: "Admin reset (false positive)" });
                    revalidatePath("/admin/disputes");
                  }}>
                    <Button type="submit" size="sm" variant="ghost" title="Clear pause AND reset the ladder counter (e.g. for false positives)">
                      <RotateCcw className="h-3.5 w-3.5" />Reset ladder
                    </Button>
                  </form>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
