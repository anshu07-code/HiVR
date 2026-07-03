"use client";

import * as React from "react";
import {
  Send, CheckCircle2, XCircle, IndianRupee, Clock, Loader2, MessageSquare,
  AlertCircle, ChevronRight, Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn, formatPaise } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

type Round = {
  id: string;
  application_id: string;
  round_number: number;
  offered_by: "buyer" | "employee";
  amount_paise: number;
  time_minutes: number | null;
  message: string | null;
  status: "pending" | "accepted" | "declined" | "countered" | "expired";
  parent_round_id: string | null;
  created_at: string;
};

type SettlementEngineProps = {
  open: boolean;
  onClose: () => void;
  applicationId: string;
  taskTitle: string;
  budgetMin: number;
  budgetMax: number;
  pricingModel: string;
  estimatedHours: number | null;
  currentUserId: string;
  buyerId: string;
  employeeId: string;
  buyerName: string;
  employeeName: string;
  onDone: (result: { accepted?: boolean; contractId?: string; declined?: boolean }) => void;
};

export function SettlementEngine({
  open, onClose, applicationId, taskTitle, budgetMin, budgetMax,
  pricingModel, estimatedHours, currentUserId, buyerId, employeeId,
  buyerName, employeeName, onDone,
}: SettlementEngineProps) {
  const isBuyer = currentUserId === buyerId;
  const [rounds, setRounds] = React.useState<Round[]>([]);
  const [loadingRounds, setLoadingRounds] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [counterAmount, setCounterAmount] = React.useState<number>(Math.round(budgetMin / 100));
  const [counterTime, setCounterTime] = React.useState<number>(estimatedHours ? estimatedHours * 60 : 60);
  const [counterMessage, setCounterMessage] = React.useState("");
  const sbRef = React.useRef<ReturnType<typeof createClient> | null>(null);

  const fetchRounds = React.useCallback(async () => {
    if (!applicationId) return;
    try {
      const r = await fetch(`/api/applications/settlement?application_id=${applicationId}`);
      const data = await r.json();
      if (data.rounds) {
        setRounds(data.rounds);
        const first = data.rounds[0];
        if (first) {
          setCounterAmount(Math.round(first.amount_paise / 100));
          if (first.time_minutes) setCounterTime(first.time_minutes);
        }
      }
    } catch { /* ignore */ }
  }, [applicationId]);

  // Fetch on mount
  React.useEffect(() => {
    if (!open || !applicationId) return;
    setLoadingRounds(true);
    setError(null);
    fetchRounds().finally(() => setLoadingRounds(false));
  }, [open, applicationId, fetchRounds]);

  // Realtime subscription for settlement_rounds
  React.useEffect(() => {
    if (!open || !applicationId) return;
    if (!sbRef.current) sbRef.current = createClient();
    const channel = sbRef.current
      .channel(`settlement-rt-${applicationId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "settlement_rounds", filter: `application_id=eq.${applicationId}` },
        () => { setLoadingRounds(true); fetchRounds().finally(() => setLoadingRounds(false)); },
      )
      .subscribe();
    return () => { sbRef.current?.removeChannel(channel); };
  }, [open, applicationId, fetchRounds]);

  const lastRound = rounds[0] ?? null;

  // Auto-expire after 24 hours of inactivity
  const hasExpired: boolean = (() => {
    if (!lastRound) return false;
    if (lastRound.status !== "pending" && lastRound.status !== "countered") return false;
    const created = new Date(lastRound.created_at).getTime();
    return Date.now() - created > 24 * 3600 * 1000;
  })();

  // Auto-call expire API once
  const expiredRef = React.useRef(false);
  React.useEffect(() => {
    if (hasExpired && !expiredRef.current && lastRound && (lastRound.status === "pending" || lastRound.status === "countered")) {
      expiredRef.current = true;
      fetch("/api/applications/settlement", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "decline", application_id: applicationId, auto_expire: true }),
      }).then(() => fetchRounds()).catch(() => {});
    }
  }, [hasExpired, lastRound, applicationId, fetchRounds]);

  const isMyTurn =
    lastRound == null
      ? isBuyer
      : (lastRound.offered_by === "buyer" && !isBuyer) || (lastRound.offered_by === "employee" && isBuyer);
  const isMyOffer = lastRound != null && ((lastRound.offered_by === "buyer" && isBuyer) || (lastRound.offered_by === "employee" && !isBuyer));
  const isActive = lastRound?.status === "pending" && !hasExpired;
  const canCounter = isMyTurn && isActive && rounds.length < 3;
  const canAccept = !isMyOffer && isActive && rounds.length > 0;
  const canDecline = !isMyOffer && isActive && rounds.length > 0;

  // Auto-set counter from latest round
  React.useEffect(() => {
    if (lastRound) {
      setCounterAmount(Math.round(lastRound.amount_paise / 100));
      if (lastRound.time_minutes) setCounterTime(lastRound.time_minutes);
    }
  }, [lastRound]);

  function calcFinalAmount(r: Round): number {
    if (pricingModel === "hourly" && r.time_minutes) {
      return Math.round(r.amount_paise * (r.time_minutes / 60));
    }
    return r.amount_paise;
  }

  async function handleStart() {
    setBusy(true); setError(null);
    const amountPaise = counterAmount * 100;
    if (amountPaise < budgetMin || amountPaise > budgetMax) {
      setError(`Amount must be between ₹${(budgetMin / 100).toFixed(2)} and ₹${(budgetMax / 100).toFixed(2)}`);
      setBusy(false); return;
    }
    const r = await fetch("/api/applications/settlement", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "start", application_id: applicationId,
        amount_paise: amountPaise, time_minutes: pricingModel === "hourly" ? counterTime : null,
        message: counterMessage.trim() || null,
      }),
    });
    const data = await r.json();
    setBusy(false);
    if (!r.ok || !data.ok) { setError(data.error ?? "Failed"); return; }
    setRounds([data.round, ...rounds]);
    setCounterMessage("");
  }

  async function handleCounter() {
    if (!lastRound) return;
    setBusy(true); setError(null);
    const amountPaise = counterAmount * 100;
    if (amountPaise < budgetMin || amountPaise > budgetMax) {
      setError(`Counter must be between ₹${(budgetMin / 100).toFixed(2)} and ₹${(budgetMax / 100).toFixed(2)}`);
      setBusy(false); return;
    }
    const r = await fetch("/api/applications/settlement", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "counter", application_id: applicationId,
        amount_paise: amountPaise,
        time_minutes: pricingModel === "hourly" ? counterTime : lastRound.time_minutes,
        message: counterMessage.trim() || null,
      }),
    });
    const data = await r.json();
    setBusy(false);
    if (!r.ok || !data.ok) { setError(data.error ?? "Failed"); return; }
    setRounds([data.round, ...rounds]);
    setCounterMessage("");
  }

  async function handleAccept() {
    if (!lastRound) return;
    setBusy(true); setError(null);
    const r = await fetch("/api/applications/settlement", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "accept", application_id: applicationId }),
    });
    const data = await r.json();
    setBusy(false);
    if (!r.ok || !data.ok) { setError(data.error ?? "Failed"); return; }
    onDone({ accepted: true, contractId: data.contract_id });
  }

  async function handleDecline() {
    if (!lastRound) return;
    setBusy(true); setError(null);
    const r = await fetch("/api/applications/settlement", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "decline", application_id: applicationId }),
    });
    setBusy(false);
    const data = await r.json();
    if (!r.ok || !data.ok) { setError(data.error ?? "Failed"); return; }
    onDone({ declined: true });
  }

  if (!open) return null;

  if (loadingRounds && rounds.length === 0) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
        <div className="flex items-center gap-2 rounded-lg border bg-card px-6 py-4 shadow-xl text-sm" onClick={(e) => e.stopPropagation()}>
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading settlement rounds...
        </div>
      </div>
    );
  }

  const settled = lastRound?.status === "accepted";
  const declined = lastRound?.status === "declined" && !settled;
  const expired = !settled && !declined && (hasExpired || lastRound?.status === "expired");
  const finalAmount = lastRound ? calcFinalAmount(lastRound) : 0;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-2 sm:p-4" onClick={onClose}>
      <div
        className="flex max-h-[90dvh] w-full max-w-lg flex-col rounded-lg border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Live Monitoring */}
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/10">
            <IndianRupee className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold leading-tight">Settlement</h3>
            <p className="truncate text-[11px] text-muted-foreground">{taskTitle}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="shrink-0 border-rose-300 bg-rose-50 text-[9px] text-rose-700">
              <Shield className="mr-0.5 h-2.5 w-2.5" />Live monitoring
            </Badge>
            {!settled && !declined && (
              <Badge variant="outline" className="shrink-0 text-[10px]">
                Round {rounds.length}/3
              </Badge>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 scrollbar-none">
          {/* Settled: show final price + who accepted */}
          {settled && lastRound && (
            <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-5 text-center">
              <p className="text-xs font-medium uppercase tracking-wider text-emerald-700">Offer accepted</p>
              <p className="mt-1 text-xs text-emerald-600">
                by {isBuyer ? (lastRound.offered_by === "employee" ? employeeName : buyerName) : (lastRound.offered_by === "buyer" ? buyerName : employeeName)}
              </p>
              <p className="mt-2 font-display text-3xl font-bold text-emerald-700">
                {formatPaise(finalAmount)}
              </p>
              {pricingModel === "hourly" && lastRound.time_minutes && (
                <p className="mt-0.5 text-xs text-emerald-600">
                  {formatPaise(lastRound.amount_paise)}/hr × {lastRound.time_minutes} min
                </p>
              )}
              <p className="mt-2 flex items-center justify-center gap-1 text-xs text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" />Contract created successfully
              </p>
            </div>
          )}

          {/* Declined: show who declined + final proposed price */}
          {declined && !expired && lastRound && (
            <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/5 p-5 text-center">
              <p className="text-xs font-medium uppercase tracking-wider text-rose-700">Offer declined</p>
              <p className="mt-1 text-xs text-rose-600">
                by {isBuyer ? (lastRound.offered_by === "employee" ? employeeName : buyerName) : (lastRound.offered_by === "buyer" ? buyerName : employeeName)}
              </p>
              <p className="mt-2 font-display text-2xl font-bold text-rose-700">
                {formatPaise(finalAmount)}
              </p>
              <p className="mt-0.5 text-[10px] text-rose-600">
                was the proposed price
              </p>
            </div>
          )}

          {/* Expired: no response within 24h */}
          {expired && (
            <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-700">
              <Clock className="h-4 w-4 shrink-0" />
              This settlement offer expired — no response within 24 hours.
            </div>
          )}

          {/* Budget range info (hide when settled/declined/expired) */}
          {!settled && !declined && !expired && (
            <div className="mb-3 rounded-md border bg-muted/20 p-2.5 text-[11px]">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Task budget range</span>
                <span className="font-medium text-foreground">
                  {formatPaise(budgetMin)} – {formatPaise(budgetMax)}
                </span>
              </div>
              {pricingModel === "hourly" && (
                <div className="mt-0.5 flex items-center justify-between text-muted-foreground">
                  <span>Estimated time</span>
                  <span className="font-medium text-foreground">{estimatedHours ?? "?"} hr{estimatedHours !== 1 ? "s" : ""}</span>
                </div>
              )}
            </div>
          )}

          {/* Round timeline */}
          {rounds.length > 0 && (
            <div className="mb-3 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Negotiation history</p>
              <div className="relative space-y-2 pl-4 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-border">
                {[...rounds].reverse().map((r) => {
                  const fromMe = (r.offered_by === "buyer" && isBuyer) || (r.offered_by === "employee" && !isBuyer);
                  const name = r.offered_by === "buyer" ? buyerName : employeeName;
                  const isAcceptedRound = r.status === "accepted";
                  return (
                    <div key={r.id} className="relative">
                      <span className={cn(
                        "absolute -left-4 top-1 grid h-3.5 w-3.5 place-items-center rounded-full ring-2 ring-card text-[7px] font-bold",
                        r.offered_by === "buyer" ? "bg-sky-500/15 text-sky-700" : "bg-amber-500/15 text-amber-700",
                      )}>
                        {r.offered_by === "buyer" ? "B" : "E"}
                      </span>
                      <div className={cn(
                        "rounded-md border p-2 text-[11px]",
                        isAcceptedRound && "border-emerald-500/30 bg-emerald-500/5",
                        r.status === "declined" && "border-rose-500/30 bg-rose-500/5",
                        r.status === "countered" && "border-amber-500/30 bg-amber-500/5",
                        r.status === "pending" && "border-primary/20 bg-primary/[0.04]",
                      )}>
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn(
                            "font-semibold",
                            fromMe ? "text-emerald-700" : "text-foreground",
                          )}>
                            {fromMe ? "You" : name}
                          </span>
                          <span className={cn(
                            "text-[9px] font-medium",
                            isAcceptedRound ? "text-emerald-600" :
                            r.status === "declined" ? "text-rose-600" :
                            r.status === "countered" ? "text-amber-600" :
                            "text-primary"
                          )}>
                            {isAcceptedRound ? "Accepted" : r.status === "declined" ? "Declined" : r.status === "countered" ? "Countered" : "Pending"}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-baseline gap-2">
                          <span className={cn("font-mono text-xs font-bold", isAcceptedRound && "text-lg text-emerald-700")}>
                            {formatPaise(isAcceptedRound ? finalAmount : calcFinalAmount(r))}
                          </span>
                          {pricingModel === "hourly" && r.time_minutes && (
                            <span className="text-[10px] text-muted-foreground">
                              ({formatPaise(r.amount_paise)}/hr × {r.time_minutes} min)
                            </span>
                          )}
                          {pricingModel !== "hourly" && (
                            <span className="text-[10px] text-muted-foreground">
                              Round {r.round_number}
                            </span>
                          )}
                        </div>
                        {r.message && (
                          <p className="mt-1 flex items-start gap-1 text-[10px] text-muted-foreground">
                            <MessageSquare className="mt-0.5 h-2.5 w-2.5 shrink-0" />
                            {r.message}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* My turn: show counter form */}
          {isMyTurn && lastRound?.status === "pending" && rounds.length < 3 && rounds.length > 0 && (
            <div className="space-y-3 rounded-md border border-primary/20 bg-primary/[0.03] p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold">
                <ChevronRight className="h-3.5 w-3.5 text-primary" />
                Your turn to counter
              </p>
              <p className="text-[10px] text-muted-foreground">
                {isBuyer
                  ? `${employeeName} proposed ₹${(lastRound.amount_paise / 100).toFixed(2)}. Adjust the amount and add a message.`
                  : `Buyer proposed ₹${(lastRound.amount_paise / 100).toFixed(2)}. You can counter within ₹${(budgetMin / 100).toFixed(2)}–₹${(budgetMax / 100).toFixed(2)}.`
                }
              </p>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {pricingModel === "hourly" ? "Rate per hour (₹)" : "Amount (₹)"}
                </label>
                <Input
                  type="number"
                  min={Math.round(budgetMin / 100)}
                  max={Math.round(budgetMax / 100)}
                  value={counterAmount}
                  onChange={(e) => setCounterAmount(Number(e.target.value))}
                  className="mt-1 h-9 text-sm"
                />
                <p className="mt-0.5 text-[9px] text-muted-foreground">
                  Must be within ₹{(budgetMin / 100).toFixed(2)} – ₹{(budgetMax / 100).toFixed(2)}
                  {counterAmount * 100 < budgetMin && (
                    <span className="ml-1 text-destructive">(below minimum)</span>
                  )}
                  {counterAmount * 100 > budgetMax && (
                    <span className="ml-1 text-destructive">(above maximum)</span>
                  )}
                </p>
              </div>
              {pricingModel === "hourly" && (
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Estimated time
                  </label>
                  <div className="mt-1 flex items-center gap-2">
                    <Input type="number" min={0} max={8} value={Math.floor(counterTime / 60)} onChange={(e) => setCounterTime(Number(e.target.value) * 60 + (counterTime % 60))} className="h-9 w-16 text-sm" />
                    <span className="text-xs text-muted-foreground">hr</span>
                    <Input type="number" min={0} max={59} value={counterTime % 60} onChange={(e) => setCounterTime(Math.floor(counterTime / 60) * 60 + Number(e.target.value))} className="h-9 w-16 text-sm" />
                    <span className="text-xs text-muted-foreground">min</span>
                  </div>
                </div>
              )}
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Message</label>
                <Textarea
                  className="mt-1 text-xs"
                  rows={2}
                  placeholder={isBuyer ? "Let them know why this is fair..." : "Explain why the rate or time needs adjustment..."}
                  value={counterMessage}
                  onChange={(e) => setCounterMessage(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* First round (buyer starts) */}
          {isBuyer && rounds.length === 0 && (
            <div className="space-y-3 rounded-md border border-primary/20 bg-primary/[0.03] p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold">
                <Send className="h-3.5 w-3.5 text-primary" />
                Send initial offer to {employeeName}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Start at ₹{(budgetMin / 100).toFixed(2)} (min budget) — the employee can counter.
              </p>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {pricingModel === "hourly" ? "Rate per hour (₹)" : "Amount (₹)"}
                </label>
                <Input
                  type="number"
                  min={Math.round(budgetMin / 100)}
                  max={Math.round(budgetMax / 100)}
                  value={counterAmount}
                  onChange={(e) => setCounterAmount(Number(e.target.value))}
                  className="mt-1 h-9 text-sm"
                />
                <p className="mt-0.5 text-[9px] text-muted-foreground">
                  Task budget: ₹{(budgetMin / 100).toFixed(2)} – ₹{(budgetMax / 100).toFixed(2)}
                </p>
              </div>
              {pricingModel === "hourly" && (
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Estimated time
                  </label>
                  <div className="mt-1 flex items-center gap-2">
                    <Input type="number" min={0} max={8} value={Math.floor(counterTime / 60)} onChange={(e) => setCounterTime(Number(e.target.value) * 60 + (counterTime % 60))} className="h-9 w-16 text-sm" />
                    <span className="text-xs text-muted-foreground">hr</span>
                    <Input type="number" min={0} max={59} value={counterTime % 60} onChange={(e) => setCounterTime(Math.floor(counterTime / 60) * 60 + Number(e.target.value))} className="h-9 w-16 text-sm" />
                    <span className="text-xs text-muted-foreground">min</span>
                  </div>
                </div>
              )}
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Message</label>
                <Textarea
                  className="mt-1 text-xs"
                  rows={2}
                  placeholder="I'd like you to do this task. Here's the offer..."
                  value={counterMessage}
                  onChange={(e) => setCounterMessage(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Waiting for other party */}
          {!isMyTurn && lastRound?.status === "pending" && rounds.length > 0 && rounds.length < 3 && (
            <div className="flex items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-800">
              <Clock className="h-4 w-4 shrink-0" />
              <span>Waiting for {isBuyer ? employeeName : buyerName} to respond to the latest offer.</span>
            </div>
          )}

          {/* Max rounds reached - show Accept/Decline prompt */}
          {rounds.length >= 3 && lastRound?.status === "pending" && (
            <div className="flex items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-xs font-medium text-amber-800">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Maximum 3 rounds reached. {isMyOffer ? "Waiting for the other party to accept or decline." : "Accept or decline the latest offer below."}</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-3 flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-700">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t px-4 py-3">
          <Button size="sm" variant="ghost" onClick={onClose} disabled={busy}>
            {settled ? "Close" : "Cancel"}
          </Button>

          {/* Start button (buyer, first round) */}
          {isBuyer && rounds.length === 0 && (
            <Button size="sm" variant="gradient" onClick={handleStart} disabled={busy || counterAmount * 100 < budgetMin || counterAmount * 100 > budgetMax}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Send offer at ₹{counterAmount.toFixed(2)}
            </Button>
          )}

          {/* Counter button */}
          {canCounter && rounds.length > 0 && (
            <Button size="sm" variant="default" onClick={handleCounter} disabled={busy || counterAmount * 100 < budgetMin || counterAmount * 100 > budgetMax}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronRight className="h-3.5 w-3.5" />}
              Counter at ₹{counterAmount.toFixed(2)}
            </Button>
          )}

          {/* Accept button */}
          {canAccept && (
            <Button size="sm" variant="gradient" onClick={handleAccept} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Accept & create contract
            </Button>
          )}

          {/* Decline button */}
          {canDecline && (
            <Button size="sm" variant="outline" onClick={handleDecline} disabled={busy} className="text-rose-600 hover:bg-rose-500/10">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
              Decline
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}