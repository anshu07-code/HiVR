"use client";

import * as React from "react";
import { Clock, Loader2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatPaise, timeUntil } from "@/lib/utils";

export type NegotiationOffer = {
  id: string;
  offer_type: "instant_hire_pushback" | "custom_scope_negotiation";
  round_number: number;
  proposed_price: number;
  comment: string | null;
  status: string;
  created_by: string;
  created_at: string;
  responded_at: string | null;
  task_post_id: string;
  employee_id: string;
  buyer_id: string;
};

export function NegotiationModal({
  offer, currentUserId, taskId, employeeName, standingRate, boundPct, onResponded, onClose,
}: {
  offer: NegotiationOffer;
  currentUserId: string;
  taskId: string;
  employeeName: string;
  standingRate: number | null;
  boundPct: number;
  onResponded: (offerId: string) => void;
  onClose: () => void;
}) {
  const isBuyer = currentUserId === offer.buyer_id;
  const isEmployee = currentUserId === offer.employee_id;
  const isCustom = offer.offer_type === "custom_scope_negotiation";
  const maxRounds = isCustom ? 2 : 3;
  const expiresAt = React.useMemo(() => {
    const created = new Date(offer.created_at).getTime();
    return new Date(created + 24 * 3600 * 1000).toISOString();
  }, [offer.created_at]);

  const [comment, setComment] = React.useState("");
  const [counterPrice, setCounterPrice] = React.useState<number>(offer.proposed_price / 100);
  const [busy, setBusy] = React.useState<"accept" | "decline" | "counter" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const rate = standingRate ?? offer.proposed_price;
  const min = Math.round(rate * (1 - boundPct));
  const max = Math.round(rate * (1 + boundPct));
  const counterOutOfRange = isCustom
    ? (Math.round(counterPrice * 100) < min || Math.round(counterPrice * 100) > max)
    : false;

  const send = async (response: "accept" | "decline" | "counter") => {
    setBusy(response);
    setError(null);
    const body: any = { negotiationOfferId: offer.id, response };
    if (response !== "decline") body.comment = comment || undefined;
    if (response === "counter") body.revisedPricePaise = Math.round(counterPrice * 100);
    const r = await fetch("/api/negotiation/respond", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(null);
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) {
      setError(data?.error ?? "Failed");
      return;
    }
    if (data.contract_id) {
      window.location.href = `/dashboard/contracts/${data.contract_id}`;
      return;
    }
    onResponded(offer.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold">
            {isCustom ? "Custom-scope offer" : "Instant Hire pushback"}
          </h3>
          <span className="rounded-full border bg-muted/40 px-2 py-0.5 text-[10px] font-medium">
            Round {offer.round_number} of {maxRounds}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {isBuyer
            ? isCustom ? "The employee proposed this price." : `Employee ${employeeName} pushed back on the standing rate.`
            : isCustom ? "Buyer offered a custom-scope price." : `Buyer offered your standing rate of ${formatPaise(offer.proposed_price)}.`}
        </p>
        <div className="mt-3 rounded-md border bg-muted/20 p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Proposed price</span>
            <span className="font-display text-2xl font-bold">{formatPaise(offer.proposed_price)}</span>
          </div>
          {standingRate != null && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              Standing rate: {formatPaise(standingRate)} · Range: {formatPaise(min)}–{formatPaise(max)}
            </p>
          )}
          {offer.comment && (
            <div className="mt-2 rounded-md border bg-background/50 px-2 py-1.5 text-xs">
              <p className="text-[10px] font-medium text-muted-foreground">Comment</p>
              <p className="mt-0.5 whitespace-pre-wrap">{offer.comment}</p>
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          {new Date(expiresAt) > new Date() ? <>Expires {timeUntil(expiresAt)}</> : <span className="text-destructive">Expired</span>}
        </div>

        <div className="mt-3 space-y-2">
          {isCustom && (isBuyer ? offer.round_number < 2 : offer.round_number < 1) === false && (
            <p className="text-[10px] text-muted-foreground">No more counter rounds left — accept or decline.</p>
          )}
          {!isCustom && offer.round_number >= 3 && (
            <p className="text-[10px] text-muted-foreground">No more pushback rounds left — accept or decline.</p>
          )}

          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Comment (optional)</label>
            <Textarea
              className="mt-1"
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a note for the other side"
            />
          </div>

          {((isEmployee && !isCustom) || (isBuyer && isCustom && offer.round_number >= 2) || (isEmployee && isCustom && offer.round_number < 1)) && (
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Counter price (₹)</label>
              <Input
                type="number"
                min={1}
                value={counterPrice}
                onChange={(e) => setCounterPrice(Math.max(1, Number(e.target.value) || 0))}
                className="mt-1 h-9"
              />
              {isCustom && counterOutOfRange && (
                <p className="mt-1 text-[10px] text-destructive">
                  Counter must be between {formatPaise(min)} and {formatPaise(max)}.
                </p>
              )}
            </div>
          )}
        </div>

        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
          <Button variant="outline" size="sm" disabled={busy != null} onClick={() => send("decline")}>
            {busy === "decline" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Decline
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy != null || (isCustom && counterOutOfRange)}
            onClick={() => send("counter")}
            title="Counter"
          >
            {busy === "counter" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
            Counter
          </Button>
          <Button size="sm" variant="gradient" disabled={busy != null} onClick={() => send("accept")}>
            {busy === "accept" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
