"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Zap, IndianRupee, Clock, Loader2, CheckCircle2, X, ChevronLeft, Handshake,
  AlertCircle, TrendingUp, Sparkles,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn, formatPaise } from "@/lib/utils";

type Offer = {
  id: string;
  contract_id: string;
  candidate_id: string;
  buyer_id: string;
  category_id: string;
  urgency: "normal" | "urgent" | "critical";
  rate_paise: number;
  status: "offered" | "accepted" | "declined" | "expired" | "cascaded";
  counter_round: number;
  max_rounds: number;
  cascade_position: number;
  offered_at: string;
  expires_at: string;
  responded_at: string | null;
  decline_reason: string | null;
  metadata?: { auto_accept?: boolean; cascade?: boolean; parent_round?: number } | null;
  buyer?: { id: string; full_name: string | null; avatar_url: string | null } | null;
  contract?: { id: string; agreed_price: number; pricing_model: string; task?: { id: string; title: string } | null } | null;
};

const URGENCY_LABEL: Record<string, string> = {
  normal: "Normal",
  urgent: "Urgent · 15-30 min response",
  critical: "Critical · 5-15 min response",
};
const URGENCY_TONE: Record<string, string> = {
  normal:  "bg-sky-500/10 text-sky-700",
  urgent:  "bg-amber-500/10 text-amber-700",
  critical:"bg-rose-500/10 text-rose-700",
};

export function InstantHireOfferView({
  offer: initial, currentUserId, role,
}: { offer: Offer; currentUserId: string; role: "candidate" | "buyer" }) {
  const router = useRouter();
  const [offer, setOffer] = React.useState<Offer>(initial);
  const [secondsLeft, setSecondsLeft] = React.useState<number>(() => {
    const ms = new Date(initial.expires_at).getTime() - Date.now();
    return Math.max(0, Math.floor(ms / 1000));
  });
  const [busy, setBusy] = React.useState<"accept" | "decline" | "counter" | null>(null);
  const [counterRateText, setCounterRateText] = React.useState<string>(
    (Math.round(initial.rate_paise / 100)).toString()
  );
  const [declineReason, setDeclineReason] = React.useState<string>("");
  const [error, setError] = React.useState<string | null>(null);
  const [counterInputVisible, setCounterInputVisible] = React.useState(false);

  // 1-second countdown timer
  React.useEffect(() => {
    if (offer.status !== "offered") return;
    const t = setInterval(() => {
      const ms = new Date(offer.expires_at).getTime() - Date.now();
      const s = Math.max(0, Math.floor(ms / 1000));
      setSecondsLeft(s);
      if (s === 0 && offer.status === "offered") {
        clearInterval(t);
        // Try to mark expired on the server too (best-effort)
        fetch("/api/instant-hire/expire", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ offer_id: offer.id }),
        }).finally(() => router.refresh());
      }
    }, 1000);
    return () => clearInterval(t);
  }, [offer.status, offer.expires_at, offer.id, router]);

  async function respond(response: "accept" | "decline" | "counter") {
    setBusy(response); setError(null);
    const body: any = { offer_id: offer.id, response };
    if (response === "counter") {
      const inr = Number(counterRateText);
      if (!Number.isFinite(inr) || inr <= 0) { setBusy(null); setError("Enter a valid counter rate"); return; }
      body.counter_rate_paise = Math.round(inr * 100);
    }
    if (response === "decline" && declineReason.trim()) {
      body.decline_reason = declineReason.trim();
    }
    const r = await fetch("/api/instant-hire/respond", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(null);
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) { setError(d?.error ?? "Failed to respond"); return; }

    if (response === "counter" && d.new_offer_id) {
      // Navigate to the new round's offer
      router.push(`/dashboard/instant-hire/offer/${d.new_offer_id}`);
      return;
    }
    router.refresh();
    // Update local state
    setOffer(prev => ({ ...prev, status: response === "accept" ? "accepted" : "declined" }));
  }

  const isOffered = offer.status === "offered";
  const isTerminal = !isOffered;
  const isCandidate = role === "candidate";
  const isAutoAccepted = (offer as any).metadata?.auto_accept === true || isTerminal === false && offer.status === "accepted";

  return (
    <div className="container max-w-2xl space-y-4 py-8">
      <Button asChild variant="ghost" size="sm">
        <Link href="/dashboard">
          <ChevronLeft className="h-3.5 w-3.5" />Back
        </Link>
      </Button>

      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Zap className="h-5 w-5 text-primary" />
                {isCandidate ? "You have an Instant Hire offer" : "Your Instant Hire offer"}
              </CardTitle>
              <CardDescription>
                Round {offer.counter_round} of {offer.max_rounds} · {offer.cascade_position === 1 ? "1st" : offer.cascade_position === 2 ? "2nd" : "3rd"} choice in the cascade
              </CardDescription>
            </div>
            <Badge className={cn("text-[10px]", URGENCY_TONE[offer.urgency])}>
              {URGENCY_LABEL[offer.urgency]}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border bg-muted/20 p-3 text-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Task</p>
            <p className="mt-0.5 font-medium">{offer.contract?.task?.title ?? "—"}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border bg-muted/20 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Rate</p>
              <p className="mt-0.5 font-display text-2xl font-semibold tabular-nums">{formatPaise(offer.rate_paise)}</p>
              {isCandidate && (
                <p className="text-[10px] text-muted-foreground">what you'll be paid for this contract</p>
              )}
              {role === "buyer" && (
                <p className="text-[10px] text-muted-foreground">what you'll pay for this contract</p>
              )}
            </div>
            <div className="rounded-md border bg-muted/20 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Time left</p>
              <p className={cn(
                "mt-0.5 font-display text-2xl font-semibold tabular-nums",
                secondsLeft < 15 && isOffered && "text-rose-600 animate-pulse"
              )}>
                {isOffered ? formatCountdown(secondsLeft) : "—"}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {isOffered ? "until auto-expire" : "this offer is no longer active"}
              </p>
            </div>
            <div className="rounded-md border bg-muted/20 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Counterparty</p>
              <p className="mt-0.5 font-medium">
                {isCandidate ? (offer.buyer?.full_name ?? "—") : "Employee"}
              </p>
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-sm text-destructive">{error}</div>
          )}

          {isAutoAccepted && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                <div>
                  <p className="font-semibold text-emerald-800">
                    {isCandidate ? "You auto-accepted this offer" : "This candidate auto-accepted your offer"}
                  </p>
                  <p className="mt-1 text-xs text-emerald-700/80">
                    The contract is live. {isCandidate ? "You can start work immediately." : "No waiting — the workspace is ready."}
                  </p>
                  <Button asChild size="sm" className="mt-3">
                    <Link href={`/dashboard/contracts/${offer.contract_id}`}>
                      Open the contract
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          )}

          {isTerminal && !isAutoAccepted && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-medium">This offer is {offer.status}.</p>
              {offer.decline_reason && <p className="mt-1 text-xs text-muted-foreground">Reason: {offer.decline_reason}</p>}
            </div>
          )}

          {/* Candidate actions */}
          {isCandidate && isOffered && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => respond("accept")} disabled={busy !== null} variant="gradient">
                  {busy === "accept" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Accept · {formatPaise(offer.rate_paise)}
                </Button>
                <Button onClick={() => setCounterInputVisible(v => !v)} disabled={busy !== null} variant="outline">
                  <Handshake className="h-3.5 w-3.5" />
                  Counter · round {offer.counter_round} of {offer.max_rounds}
                </Button>
                <Button onClick={() => respond("decline")} disabled={busy !== null} variant="ghost">
                  {busy === "decline" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                  Decline
                </Button>
              </div>
              {counterInputVisible && offer.counter_round < offer.max_rounds && (
                <div className="rounded-md border bg-muted/20 p-3">
                  <Label htmlFor="counter-rate" className="text-xs">Your counter rate (₹)</Label>
                  <div className="mt-1 flex gap-2">
                    <div className="relative flex-1">
                      <IndianRupee className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="counter-rate"
                        type="number" min={0} step={50}
                        value={counterRateText}
                        onChange={(e) => setCounterRateText(e.target.value)}
                        className="pl-7"
                      />
                    </div>
                    <Button onClick={() => respond("counter")} disabled={busy !== null}>
                      {busy === "counter" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      Send counter
                    </Button>
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {offer.max_rounds - offer.counter_round} counter round{offer.max_rounds - offer.counter_round === 1 ? "" : "s"} remaining.
                    After that, accept or decline.
                  </p>
                </div>
              )}
              {counterInputVisible && offer.counter_round >= offer.max_rounds && (
                <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-amber-800">
                  <AlertCircle className="mr-1 inline h-3.5 w-3.5" />
                  Maximum negotiation rounds reached. Please accept or decline.
                </p>
              )}
            </div>
          )}

          {role === "buyer" && isOffered && offer.counter_round > 1 && (
            <p className="rounded-md border bg-muted/30 p-2.5 text-xs text-muted-foreground">
              <Clock className="mr-1 inline h-3 w-3" />
              The employee countered with a new rate. Open this page from your notifications to respond.
            </p>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-[10px] text-muted-foreground">
        Round {offer.counter_round} of {offer.max_rounds} · Max 3 counter rounds before accept or decline is required.
      </p>
    </div>
  );
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "0s";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
