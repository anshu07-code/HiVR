"use client";

import * as React from "react";
import Link from "next/link";
import {
  FileText, ShieldCheck, IndianRupee, CheckCircle2, Clock, Briefcase,
  Sparkles, Calendar, User, AlertTriangle, ChevronLeft, FolderKanban, ArrowRight, Download, Printer,
  Handshake, Ban, LogOut, Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CategoryIcon } from "@/components/marketing/category-icon";
import { GigRibbon } from "@/components/contract/gig-ribbon";
import { cn, formatPaise, timeAgo } from "@/lib/utils";

type Props = {
  contract: any;
  task: any | null;
  contractCategory: any | null;
  workspace: any | null;
  checklist: any[];
  buyer: any | null;
  employee: any | null;
  buyerAck: any | null;
  employeeAck: any | null;
  currentUserRole: "buyer" | "employee";
  walletBalancePaise: number | null;
  onSign?: () => void;
  onFundFromWallet?: () => void;
  onFundRazorpay?: () => void;
  onWithdraw?: () => void;
  withdrawing?: boolean;
  signing?: boolean;
};

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function ContractDocument({
  contract, task, contractCategory, workspace, checklist, buyer, employee, buyerAck, employeeAck,
  currentUserRole, walletBalancePaise, onSign, onFundFromWallet, onFundRazorpay, onWithdraw, withdrawing, signing,
}: Props) {
  const isFunded    = !!workspace?.escrow_funded;
  const isCompleted = workspace?.status === "completed";
  const isCancelled = contract?.status === "cancelled" || workspace?.status === "cancelled";
  const cancelledBy: string | null = (contract as any)?.cancelled_by ?? null;
  const cancellationReason: string | null = (contract as any)?.cancellation_reason ?? null;
  const taskCategory = task?.category ?? contractCategory ?? null;
  const taskIcon = taskCategory?.icon ?? "boxes";
  const agreedPaise = Number(contract?.agreed_price ?? 0);
  const incentivePaise = Number(contract?.incentive_amount_paise ?? task?.incentive_amount_paise ?? 0);
  const myAck    = currentUserRole === "buyer" ? buyerAck    : employeeAck;
  const theirAck = currentUserRole === "buyer" ? employeeAck : buyerAck;
  const theirRole = currentUserRole === "buyer" ? "Employee" : "Buyer";
  const theirUser = currentUserRole === "buyer" ? employee   : buyer;

  const briefChecklist: Array<{ key: string; text: string }> = task?.brief?.checklist_items ?? [];
  const briefNotes: string = task?.brief?.notes ?? "";

  const showFundingPrompt = !isFunded && workspace?.status === "awaiting_funding" && currentUserRole === "buyer";
  const walletHasEnough   = walletBalancePaise !== null && walletBalancePaise >= agreedPaise;

  function handlePrint() {
    if (typeof window === "undefined") return;
    const el = document.getElementById("print-contract");
    if (!el) { window.print(); return; }

    const styles = Array.from(document.styleSheets)
      .flatMap((s) => {
        try { return Array.from(s.cssRules || []).map((r) => r.cssText); } catch { return []; }
      })
      .join("\n");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Contract</title>
<style>${styles}</style>
<style>
  @page { margin: 20mm; }
  body { background:#fff!important;color:#000!important;padding:0;margin:0; }
  .no-print { display:none!important; }
  nav,aside,[data-tour="sidebar"]{display:none!important;}
  * { -webkit-print-color-adjust:exact!important;print-color-adjust:exact!important; }
</style>
</head><body>${el.innerHTML}</body></html>`;

    const w = window.open("", "_blank");
    if (!w) { window.print(); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 300);
  }

  return (
    <div className="container max-w-4xl space-y-4 py-6">
      <div className="no-print flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/contracts"><ChevronLeft className="h-3.5 w-3.5" />All contracts</Link>
        </Button>
        <div className="flex items-center gap-2">
          {workspace?.id && (
            <Button asChild size="sm" variant="outline">
              <Link href={`/dashboard/workspaces/${workspace.id}`}>
                <FolderKanban className="h-3.5 w-3.5" />Open workspace
                <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={handlePrint} disabled={!myAck || !theirAck} title={myAck && theirAck ? "Print or save as PDF" : "Signatures required from both parties to print"}>
            <Printer className="h-3.5 w-3.5" />Print
          </Button>
        </div>
      </div>

      {/* Status banner */}
      <div className="no-print">
        {isCancelled ? (
          <div className="flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-sm">
            <Ban className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            <div>
              <p className="font-semibold text-rose-700">
                Contract cancelled
                {cancelledBy ? <> &mdash; cancelled by <span className="capitalize">{cancelledBy}</span></> : null}.
              </p>
              <p className="text-xs text-rose-700/80">
                {cancelledBy === "buyer"
                  ? "The buyer raised this cancellation. The employee agreed. 70% of the escrowed amount has been refunded to the buyer's HiVR wallet; 30% was retained by HiVR as a platform fee."
                  : cancelledBy === "employee"
                    ? "The employee raised this cancellation. The buyer agreed. The buyer's HiVR wallet was refunded in full. The employee's trust rating has been reduced and 30% of the employee's fee on their very next contract will be withheld as a cancellation fee for this contract."
                    : "This contract was ended by mutual agreement between both parties."}
                {cancellationReason ? <> Reason: &ldquo;{cancellationReason}&rdquo;.</> : null}
              </p>
            </div>
          </div>
        ) : isCompleted ? (
          <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <div>
              <p className="font-semibold text-emerald-700">Contract completed.</p>
              <p className="text-xs text-emerald-700/80">Funds have been released to the employee. {fmtDate(workspace?.completed_at)}</p>
            </div>
          </div>
        ) : isFunded ? (
          <div className="flex items-start gap-2 rounded-md border border-sky-500/30 bg-sky-500/5 p-3 text-sm">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
            <div>
              <p className="font-semibold text-sky-700">Escrow funded.</p>
              <p className="text-xs text-sky-700/80">{formatPaise(agreedPaise)} held by HiVR. Will release to the employee on buyer approval.</p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="font-semibold text-amber-700">Awaiting funding.</p>
              <p className="text-xs text-amber-700/80">
                {currentUserRole === "buyer"
                  ? `Fund ${formatPaise(agreedPaise)} to the escrow so the employee can start work.`
                  : `The buyer hasn't funded the escrow yet. You'll be notified when work can begin.`}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* === THE DOCUMENT === */}
      <Card id="print-contract" className="overflow-hidden border-2 print:overflow-visible print:border print:border-gray-300 print:shadow-none relative">
        {contract?.gig_id && <GigRibbon />}
        {/* Letterhead */}
        <div className="border-b bg-gradient-to-br from-primary/[0.04] via-background to-primary/[0.02] px-8 py-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <CategoryIcon name={taskIcon} className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Service Agreement</p>
                <h1 className="font-display text-2xl font-bold tracking-tight">{task?.title ?? contractCategory?.name ?? "Contract"}</h1>
                <p className="text-[11px] text-muted-foreground">
                  Issued {fmtDate(contract.started_at ?? task?.created_at)}
                </p>
              </div>
            </div>
            <div className="text-right">
              <Badge variant={isCancelled ? "destructive" : isCompleted ? "success" : isFunded ? "secondary" : "outline"} className="text-[10px]">
                {isCancelled ? "Cancelled" : isCompleted ? "Completed" : isFunded ? "Active" : "Awaiting Funding"}
              </Badge>
            </div>
          </div>
        </div>

        <CardContent className="space-y-6 p-8">
          {/* Parties */}
          <section>
            <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Parties to this Agreement</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <PartyCard role="Buyer (Client)" user={buyer} />
              <PartyCard role="Employee (Service Provider)" user={employee} />
            </div>
          </section>

          {/* Scope of work */}
          <section>
            <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">1. Scope of Work</h2>
            {task?.description ? (
              <p className="text-sm leading-relaxed text-foreground/90">{task.description}</p>
            ) : (
              <p className="text-sm italic text-muted-foreground">No additional description provided.</p>
            )}
          </section>

          {/* Deliverables / checklist */}
          <section>
            <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">2. Deliverables &amp; Acceptance Criteria</h2>
            {briefChecklist.length === 0 ? (
              <p className="text-sm italic text-muted-foreground">No specific deliverables were itemised in the brief. The buyer must accept the work as a whole.</p>
            ) : (
              <ol className="space-y-2">
                {briefChecklist.map((it, i) => {
                  const matched = checklist.find((c) => c.brief_item_key === it.key);
                  const status = matched?.status ?? "pending";
                  return (
                    <li key={it.key + i} className="flex items-start gap-3 rounded-md border bg-muted/10 p-3 text-sm">
                      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">{i + 1}</span>
                      <div className="flex-1">
                        <p>{it.text}</p>
                        {matched && (
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            Status: <span className="font-medium capitalize text-foreground">{status.replace("_", " ")}</span>
                            {matched.buyer_comment && <> · Buyer note: &ldquo;{matched.buyer_comment}&rdquo;</>}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          {/* Notes from the brief */}
          {briefNotes && (
            <section>
              <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">3. Additional Notes</h2>
              <div className="rounded-md border bg-muted/10 p-3 text-sm whitespace-pre-wrap">{briefNotes}</div>
            </section>
          )}

          {/* Compensation */}
          <section>
            <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {briefNotes ? "4" : "3"}. Compensation &amp; Payment
            </h2>
            <div className="grid gap-3 md:grid-cols-3">
              <CompRow
                icon={IndianRupee}
                label="Agreed price"
                value={formatPaise(agreedPaise)}
                sub="Held in HiVR escrow until completion"
                tone="text-primary"
              />
              <CompRow
                icon={Briefcase}
                label="Pricing model"
                value={(task?.pricing_model ?? "fixed").replace("_", " ")}
                sub={
                  task?.pricing_model === "hourly"
                    ? `Estimated ${task.estimated_hours ?? "—"} hours`
                    : "Fixed total, no hourly billing"
                }
                tone="text-sky-600"
              />
              {incentivePaise > 0 ? (
                <CompRow
                  icon={Handshake}
                  label="Performance incentive"
                  value={formatPaise(incentivePaise)}
                  sub={
                    task?.incentive_condition_type === "time_based"
                      ? "On-time delivery bonus"
                      : task?.incentive_condition_type === "rating_based"
                        ? "5-star review bonus"
                        : "Bonus on full checklist completion"
                  }
                  tone="text-amber-600"
                />
              ) : (
                <CompRow
                  icon={CheckCircle2}
                  label="Delivery"
                  value="Acceptance required"
                  sub="Buyer must mark the work as done"
                  tone="text-emerald-600"
                />
              )}
            </div>
          </section>

          {/* Terms */}
          <section>
            <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {briefNotes ? "5" : "4"}. Terms
            </h2>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-foreground/90">
              <li><strong>Escrow.</strong> The buyer deposits the agreed price with HiVR upon signing. Funds are released to the employee only after the buyer marks the workspace as complete, or as otherwise required under HiVR&apos;s dispute resolution process.</li>
              <li><strong>No off-platform contact.</strong> All communication must remain inside the HiVR workspace. Sharing personal phone numbers, email addresses, or third-party payment handles is prohibited and will be auto-blocked.</li>
              <li><strong>Delivery.</strong> As an employee, I will complete the work on time as discussed. Late delivery can happen due to any unavoidable circumstance only.</li>
              <li><strong>Disputes.</strong> Either party may raise a dispute. HiVR will hold the escrow pending review by Trust &amp; Safety. All evidence (chat, vault files, checklist notes) is preserved on-platform.</li>
              <li><strong>Fund release.</strong> Once the buyer marks the workspace complete, HiVR releases the escrow (agreed price less the platform fee) to the employee&apos;s HiVR wallet immediately. The employee may then withdraw to their verified bank account or UPI at any time.</li>
            </ol>
          </section>

          {/* Signatures */}
          <section className="border-t pt-6">
            <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {briefNotes ? "6" : "5"}. Acknowledgement
            </h2>
            <p className="text-sm text-muted-foreground">
              By signing below, each party confirms they have read and agree to the terms of this contract. Signatures are stored against the contract record and timestamped.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <SignatureBlock role="Buyer (Client)" user={buyer} ack={buyerAck} />
              <SignatureBlock role="Employee (Service Provider)" user={employee} ack={employeeAck} />
            </div>
          </section>

          {/* Sign CTA */}
          {!myAck && onSign && (
            <div id="sign-contract" className="no-print rounded-md border border-primary/30 bg-primary/5 p-4">
              <p className="text-sm">
                <strong>Your signature is required</strong> to confirm you agree to the terms above. The contract is binding once both parties have signed.
              </p>
              <Button size="sm" variant="gradient" className="mt-3" onClick={onSign} disabled={signing}>
                {signing ? "Signing…" : "Sign this contract"}
              </Button>
            </div>
          )}

          {/* Withdraw CTA — either party, contract still cancellable */}
          {onWithdraw && !isCancelled && !isCompleted && (
            <div className="no-print rounded-md border border-zinc-500/30 bg-zinc-500/5 p-4">
              <div className="flex items-start gap-3">
                <LogOut className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm">
                    <strong>Withdraw from this contract</strong>. Unilateral — only you (the {currentUserRole}) will be charged a
                    <strong> ₹99 fee</strong>. The escrow is fully refunded to the buyer. No penalty is applied to the other party.
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    The fee is debited from your HiVR wallet if you have a balance, otherwise it&apos;s added to your pending balance
                    and deducted from your very next contract payout.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    onClick={onWithdraw}
                    disabled={withdrawing}
                  >
                    {withdrawing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
                    Withdraw from contract
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Funding CTA (buyer only, awaiting_funding) */}
          {showFundingPrompt && (
            <div className="no-print rounded-md border-2 border-amber-500/40 bg-gradient-to-br from-amber-50 via-background to-amber-50/40 p-4">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-500/20 text-amber-700">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold">Fund the escrow to start the contract</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatPaise(agreedPaise)} will be held in HiVR escrow. The employee can&apos;t withdraw until you mark the work as done.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="gradient" onClick={onFundFromWallet} disabled={!walletHasEnough}>
                      <ShieldCheck className="h-3.5 w-3.5" />
                      {walletHasEnough ? `Pay ${formatPaise(agreedPaise)} from wallet` : `Wallet ${walletBalancePaise !== null ? formatPaise(walletBalancePaise) : "—"} (insufficient)`}
                    </Button>
                    <Button size="sm" variant="outline" onClick={onFundRazorpay}>
                      <IndianRupee className="h-3.5 w-3.5" />Pay with Razorpay
                    </Button>
                  </div>
                  {!walletHasEnough && (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      <Link href="/dashboard#wallet" className="text-primary hover:underline">Add money to your wallet</Link>
                      {" "}or pay directly with UPI / Card / Netbanking via Razorpay.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Counterparty sign status */}
          {theirAck && !myAck && (
            <div className="no-print flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <p className="text-emerald-700">
                <strong>{theirUser?.full_name ?? theirRole}</strong> ({theirRole.toLowerCase()}) has signed this contract on {fmtDate(theirAck.signed_at)}.
                Your signature is still pending.
              </p>
            </div>
          )}

          {/* Footer / metadata */}
          <div className="border-t pt-4 text-[10px] text-muted-foreground">
            <p>HiVR · Contract {contract.id}</p>
            <p>Generated {fmtDateTime(contract.started_at ?? new Date().toISOString())} · Stored immutably on HiVR</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PartyCard({ role, user }: { role: string; user: any }) {
  return (
    <div className="rounded-md border bg-muted/10 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{role}</p>
      <div className="mt-1 flex items-center gap-2">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
          {(user?.full_name ?? "?").split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{user?.full_name ?? "—"}</p>
          {user?.email && <p className="truncate text-[10px] text-muted-foreground">Email hidden for privacy</p>}
        </div>
      </div>
    </div>
  );
}

function CompRow({ icon: Icon, label, value, sub, tone }: { icon: any; label: string; value: string; sub: string; tone: string }) {
  return (
    <div className="rounded-md border bg-muted/10 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("mt-1 inline-flex items-center gap-1 text-lg font-bold", tone)}>
        <Icon className="h-4 w-4" />{value}
      </p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function SignatureBlock({ role, user, ack }: { role: string; user: any; ack: any }) {
  return (
    <div className="rounded-md border bg-muted/10 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{role}</p>
      <p className="mt-1 text-sm font-semibold">{user?.full_name ?? "—"}</p>
      {ack ? (
        <div className="mt-3">
          <p className="font-display text-2xl italic text-primary" style={{ fontFamily: "cursive" }}>
            {ack.signature_name ?? user?.full_name ?? "Signed"}
          </p>
          <div className="mt-1 border-t pt-1 text-[10px] text-muted-foreground">
            <p>Signed {fmtDateTime(ack.signed_at)}</p>

          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-md border-2 border-dashed border-muted-foreground/30 bg-background/50 p-4 text-center text-xs italic text-muted-foreground">
          Awaiting signature
        </div>
      )}
    </div>
  );
}
