"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Handshake, CheckCircle2, XCircle, MessageSquare, Clock, ExternalLink,
  Loader2, Shield, ChevronRight, AlertTriangle, Briefcase,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { timeAgo, formatPaise } from "@/lib/utils";

interface NegotiationOffer {
  id: string;
  task_post_id: string | null;
  gig_id: string | null;
  employee_id: string;
  buyer_id: string;
  round_number: number;
  proposed_price: number;
  status: string;
  created_at: string;
  comment: string | null;
  offer_type_new: string | null;
  gig_requirements: string | null;
  contract_id: string | null;
}

interface Props {
  offer: NegotiationOffer;
  otherName: string;
  otherAvatar: string | null;
  gigTitle: string | null;
  gigSlug: string | null;
  userId: string;
  viewOnly?: boolean;
  contractId?: string | null;
  signed?: boolean;
  workspaceId?: string | null;
}

export function NegotiationDialog({
  offer, otherName, otherAvatar, gigTitle, gigSlug, userId, viewOnly,
  contractId: propContractId, signed: propSigned, workspaceId: propWorkspaceId,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [rounds, setRounds] = React.useState<any[]>([]);
  const [counterPrice, setCounterPrice] = React.useState("");
  const [counterComment, setCounterComment] = React.useState("");
  const [counterDays, setCounterDays] = React.useState("");
  const [error, setError] = React.useState("");
  const [result, setResult] = React.useState<{ contractId?: string; action: string } | null>(null);
  const [contractId, setContractId] = React.useState<string | null>(offer.contract_id ?? propContractId ?? null);
  const [workspaceId, setWorkspaceId] = React.useState<string | null>(propWorkspaceId ?? null);
  const [signed, setSigned] = React.useState(propSigned ?? false);
  const [realtimeUpdate, setRealtimeUpdate] = React.useState(0);
  const [localStatus, setLocalStatus] = React.useState(offer.status);
  const [localPrice, setLocalPrice] = React.useState(offer.proposed_price);
  const { toast } = useToast();

  // Sync local state when offer prop changes (e.g. dialog re-opens with fresh data)
  React.useEffect(() => {
    setLocalStatus(offer.status);
    setLocalPrice(offer.proposed_price);
  }, [offer.status, offer.proposed_price]);

  const isIncoming = offer.employee_id === userId;
  const isBuyer = offer.buyer_id === userId;

  // Determine whose turn it is based on the last round's proposer
  const lastRound = rounds[rounds.length - 1];
  const lastProposedBy = lastRound?.proposed_by;
  const myTurn = localStatus === "pending"
    ? isIncoming  // initial offer from buyer — employee's turn
    : localStatus === "countered" && lastProposedBy
      ? (lastProposedBy === "buyer" ? isIncoming : isBuyer)  // opposite of who just proposed
      : false;  // accepted/declined/expired — no one's turn

  // Determine final-proposer and accepter names for the settlement header
  const finalProposerName = lastRound
    ? (lastRound.proposed_by === "buyer"
        ? (userId === offer.buyer_id ? "You" : otherName)
        : (userId === offer.employee_id ? "You" : otherName))
    : otherName;
  const accepterName = lastRound?.proposed_by === "buyer"
    ? (isIncoming ? "You" : otherName)   // employee accepted
    : (isBuyer ? "You" : otherName);     // buyer accepted

  // Parse agreed delivery days from the last round's comment
  let agreedDays: number | null = null;
  if (lastRound?.comment && typeof lastRound.comment === "string" && lastRound.comment.startsWith("{")) {
    try {
      const parsed = JSON.parse(lastRound.comment);
      agreedDays = parsed.expected_days || null;
    } catch {}
  }

  // Fetch rounds when open or realtimeUpdate changes
  React.useEffect(() => {
    if (!open) return;
    const sb = createClient();
    sb.from("negotiation_rounds")
      .select("*")
      .eq("negotiation_id", offer.id)
      .order("round_number", { ascending: true })
      .then(({ data }) => {
        setRounds(data ?? []);
      });
    // When contract_id is available, fetch workspace + sign status (only if not already provided via props)
    const cId = offer.contract_id || propContractId;
    if (cId && !propWorkspaceId) {
      ((sb.from("workspaces") as any).select("id").eq("contract_id", cId).maybeSingle() as Promise<any>)
        .then(({ data: ws }: any) => { if (ws) setWorkspaceId(ws.id); })
        .catch(() => {
          // Fallback: raw fetch to bypass stale SDK types
          fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/workspaces?select=id&contract_id=eq.${cId}&limit=1`, {
            headers: {
              apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
              Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            },
          }).then(r => r.json()).then((data: any) => {
            if (data?.[0]?.id) setWorkspaceId(data[0].id);
          }).catch(() => {});
        });
    }
    if (cId && !propSigned) {
      const myRole = isIncoming ? "employee" : "buyer";
      ((sb.from("contract_acknowledgements") as any).select("party_role")
        .eq("contract_id", cId).eq("party_role", myRole).maybeSingle() as Promise<any>)
        .then(({ data: ack }: any) => { if (ack) setSigned(true); })
        .catch(() => {
          fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/contract_acknowledgements?select=id&contract_id=eq.${cId}&party_role=eq.${myRole}&limit=1`, {
            headers: {
              apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
              Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            },
          }).then(r => r.json()).then((data: any) => {
            if (data?.[0]) setSigned(true);
          }).catch(() => {});
        });
    }
  }, [open, offer.id, offer.contract_id, offer.status, realtimeUpdate, propContractId, propWorkspaceId, propSigned]);

  // Realtime subscription (runs once when dialog opens)
  React.useEffect(() => {
    if (!open) return;
    const sb = createClient();
    const channel = sb.channel(`offer-${offer.id}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "negotiation_rounds", filter: `negotiation_id=eq.${offer.id}` },
        () => {
          setRealtimeUpdate(n => n + 1);
          toast({ type: "info", title: "New counter offer", description: `${otherName} sent a counter offer.` });
        }
      )
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "negotiation_offers", filter: `id=eq.${offer.id}` },
        (payload) => {
          const updated = payload.new as any;
          if (updated.status) setLocalStatus(updated.status);
          if (updated.proposed_price) setLocalPrice(updated.proposed_price);
          if (updated.status === "accepted") {
            toast({ type: "success", title: "Offer accepted!", description: `${otherName} accepted the offer.` });
          } else if (updated.status === "declined") {
            toast({ type: "error", title: "Offer declined", description: `${otherName} declined the offer.` });
          } else if (updated.status === "countered") {
            toast({ type: "info", title: "Offer countered", description: `${otherName} sent a counter offer.` });
          }
          setRealtimeUpdate(n => n + 1);
        }
      )
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [open, offer.id]);

  // Auto-close dialog shortly after accept/decline
  React.useEffect(() => {
    if (result && (result.action === "accepted" || result.action === "declined")) {
      const timer = setTimeout(() => {
        setOpen(false);
        router.refresh();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [result]);

  const handleRespond = async (action: "accept" | "decline" | "counter") => {
    setLoading(true);
    setError("");
    try {
      const body: any = {
        negotiation_id: offer.id,
        action,
      };
      if (action === "counter") {
        const priceNum = Number(counterPrice);
        if (!priceNum || priceNum <= 0) {
          setError("Enter a valid price");
          setLoading(false);
          return;
        }
        body.proposed_price = priceNum;
        const days = Number(counterDays);
        body.comment = days > 0
          ? JSON.stringify({ text: counterComment || "", expected_days: days })
          : (counterComment || null);
      }

      const res = await fetch("/api/gigs/negotiate/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Request failed");
      }
      const data = await res.json();
      setResult(data);

      // Update local status so buttons reflect the new state immediately
      if (action === "accept") setLocalStatus("accepted");
      else if (action === "decline") setLocalStatus("declined");
      else if (action === "counter") setLocalStatus("countered");

      // Optimistically add the new round when countering
      if (action === "counter") {
        const newRound = {
          id: `pending-${Date.now()}`,
          negotiation_id: offer.id,
          round_number: data.round || (rounds.length + 1),
          proposed_by: isIncoming ? "employee" : "buyer",
          proposed_price: Math.round(body.proposed_price * 100),
          comment: body.comment || null,
          created_at: new Date().toISOString(),
        };
        setRounds(prev => [...prev, newRound]);
      }

      // Re-fetch rounds from server to get the authoritative state
      const { data: updated } = await createClient().from("negotiation_rounds")
        .select("*")
        .eq("negotiation_id", offer.id)
        .order("round_number", { ascending: true });
      if (updated && updated.length > 0) setRounds(updated);
      // Reset counter form
      setCounterPrice("");
      setCounterDays("");
      setCounterComment("");

      if (action === "accept") {
        if (data.contract_id) setContractId(data.contract_id);
        if (data.workspace_id) setWorkspaceId(data.workspace_id);
      }

      router.refresh();
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const isExpired = offer.created_at && (Date.now() - new Date(offer.created_at).getTime()) > 24 * 60 * 60 * 1000;

  return (
    <>
      <Button
        size="sm"
        variant={viewOnly ? "outline" : "default"}
        className="h-7 text-xs gap-1 shrink-0"
        onClick={() => setOpen(true)}
      >
        {viewOnly ? <ExternalLink className="h-3 w-3" /> : <Handshake className="h-3 w-3" />}
        {viewOnly ? "View" : "Review"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" style={{ scrollbarWidth: "none" }}>
          <ToastProvider>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Handshake className="h-4 w-4 text-amber-600" />
              {gigTitle || offer.comment || "Job Offer"}
            </DialogTitle>
            <DialogDescription>
              From {otherName}
              {gigSlug ? (
                <Link href={`/gigs/${gigSlug}`} className="ml-1 text-primary hover:underline text-xs inline-flex items-center gap-0.5">
                  View Gig <ExternalLink className="h-3 w-3" />
                </Link>
              ) : offer.offer_type_new ? (
                <span className="ml-1 text-xs text-muted-foreground">
                  · {offer.offer_type_new === "gig_direct" ? "Direct hire" : "Negotiation"}
                </span>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          {/* Settlement engine header — terminal states only */}
          {localStatus === "accepted" || localStatus === "declined" || localStatus === "expired" ? (
            <div className={`rounded-lg border p-3 text-sm ${
              localStatus === "accepted" ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200" :
              localStatus === "declined" ? "bg-rose-50 dark:bg-rose-950/20 border-rose-200" :
              "bg-orange-50 dark:bg-orange-950/20 border-orange-200"
            }`}>
              <div className="flex items-center gap-2 font-medium">
                {localStatus === "accepted" ? (
                  <><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Offer Accepted</>
                ) : localStatus === "declined" ? (
                  <><XCircle className="h-4 w-4 text-rose-600" /> Offer Declined</>
                ) : (
                  <><AlertTriangle className="h-4 w-4 text-orange-600" /> Offer Expired</>
                )}
              </div>
              <p className="text-xs mt-1 text-muted-foreground">
                {localStatus === "accepted"
                  ? `Final price: ${formatPaise(localPrice)} (proposed by ${finalProposerName}) · Accepted by ${accepterName}.`
                  : localStatus === "declined"
                  ? `Declined by ${otherName}`
                  : "No response within 24 hours — auto-expired."}
              </p>
              {localStatus === "accepted" && agreedDays && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 rounded px-2 py-1.5 border border-amber-200 dark:border-amber-800">
                  <Clock className="h-3 w-3 shrink-0" />
                  <span>
                    <strong>{agreedDays} day{agreedDays > 1 ? "s" : ""}</strong> agreed delivery — {isIncoming ? "You must" : `${otherName} must`} complete within this timeframe, or it will affect ratings.
                  </span>
                </div>
              )}
              {localStatus === "accepted" && (
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" asChild>
                    <Link href={contractId ? `/dashboard/contracts/${contractId}` : "/dashboard/contracts"}>
                      <ExternalLink className="h-3 w-3 mr-1" />Open Contract
                    </Link>
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                    <Link href={workspaceId && signed ? `/dashboard/workspaces/${workspaceId}` : contractId ? `/dashboard/contracts/${contractId}${signed ? "" : "#sign-contract"}` : "/dashboard/contracts"}>
                      <Briefcase className="h-3 w-3 mr-1" />{workspaceId && signed ? "Workspace" : signed ? "Open Contract" : "Sign this contract"}
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          ) : null}

          {/* Price info */}
          <div className="rounded-lg border bg-card/50 p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Proposed price</span>
              <span className="text-base font-bold">{formatPaise(offer.proposed_price)}</span>
            </div>
            {gigTitle && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">For</span>
                <span className="text-xs font-medium">{gigTitle}</span>
              </div>
            )}
            {isExpired && localStatus === "pending" && (
              <div className="flex items-center gap-1.5 text-xs text-rose-600 pt-1">
                <Clock className="h-3 w-3" /> Expired — no response within 24 hours
              </div>
            )}
          </div>

          {/* Requirements */}
          {offer.gig_requirements && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Requirements</p>
              <p className="text-sm bg-muted/30 rounded-lg p-2.5 text-muted-foreground">{offer.gig_requirements}</p>
            </div>
          )}

          {/* Negotiation rounds */}
          {rounds.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Negotiation history</p>
              <div className="space-y-1.5">
                {rounds.map((round, i) => {
                  const isBuyerProposed = round.proposed_by === "buyer";
                  const roundOtherName = isBuyerProposed
                    ? (userId === offer.buyer_id ? "You" : otherName)
                    : (userId === offer.employee_id ? "You" : otherName);
                  // Parse expected_days from comment if stored as JSON
                  let roundComment = round.comment;
                  let roundDays: number | null = null;
                  if (round.comment && round.comment.startsWith("{")) {
                    try {
                      const parsed = JSON.parse(round.comment);
                      roundComment = parsed.text || "";
                      roundDays = parsed.expected_days || null;
                    } catch {}
                  }
                  return (
                    <div key={round.id} className={`rounded-lg border p-2.5 text-xs ${
                      round.proposed_by === "buyer" ? "bg-blue-50/50 dark:bg-blue-950/10" : "bg-amber-50/50 dark:bg-amber-950/10"
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          Round {round.round_number} — {roundOtherName} proposed
                        </span>
                        <span className="font-semibold">{formatPaise(round.proposed_price)}</span>
                      </div>
                      {roundComment && (
                        <p className="text-muted-foreground mt-1">{roundComment}</p>
                      )}
                      {roundDays && (
                        <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                          <Clock className="h-3 w-3" /> Expected delivery: {roundDays} day{roundDays > 1 ? "s" : ""}
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {timeAgo(round.created_at)} · {new Date(round.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Counter input form — show when it's the user's turn */}
          {!isExpired && !result && !myTurn && (
            <div className="rounded-lg border bg-muted/30 p-3 text-center text-xs text-muted-foreground">
              Waiting for {otherName} to respond.
            </div>
          )}
          {myTurn && !isExpired && !result && (
            <div className="space-y-3">
              <Separator />
              {offer.offer_type_new === "gig_direct" ? (
                // Direct hire: Accept or Decline
                <>
                  <p className="text-sm text-muted-foreground">
                    This is a direct hire offer. Accept to start working or decline if not interested.
                  </p>
                  {error && <p className="text-xs text-destructive">{error}</p>}
                  <div className="flex items-center gap-2 pt-1">
                    <Button onClick={() => handleRespond("accept")} disabled={loading}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white">
                      {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                      Accept Offer
                    </Button>
                    <Button onClick={() => handleRespond("decline")} disabled={loading} variant="outline">
                      <XCircle className="h-4 w-4 mr-2" />
                      Decline
                    </Button>
                  </div>
                </>
              ) : (
                  // Negotiation: both parties can counter when it's their turn
                <>
                  {error && <p className="text-xs text-destructive">{error}</p>}

                  {/* Counter inputs — hidden after max rounds */}
                  {rounds.length < 4 && (
                    <>
                      <div className="space-y-2">
                        <Label className="text-xs">Counter offer price (₹)</Label>
                        <Input
                          type="number"
                          placeholder="Enter your proposed price"
                          value={counterPrice}
                          onChange={(e) => setCounterPrice(e.target.value)}
                          min={1}
                          onWheel={(e) => (e.target as HTMLInputElement).blur()}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Expected delivery (days)</Label>
                        <Input
                          type="number"
                          min={1}
                          placeholder="e.g. 7"
                          value={counterDays}
                          onChange={(e) => setCounterDays(e.target.value)}
                          onWheel={(e) => (e.target as HTMLInputElement).blur()}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Comment (optional)</Label>
                        <textarea
                          className="w-full min-h-[60px] rounded-md border border-input bg-transparent px-3 py-2 text-xs"
                          placeholder="Add a note to your counter offer..."
                          value={counterComment}
                          onChange={(e) => setCounterComment(e.target.value)}
                        />
                      </div>
                    </>
                  )}

                  {rounds.length >= 4 && (
                    <p className="text-xs text-muted-foreground text-center">Maximum 4 negotiation rounds reached. You can accept or decline the final offer.</p>
                  )}

                  <div className="flex items-center gap-2">
                    <Button onClick={() => handleRespond("accept")} disabled={loading}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs">
                      {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                      Accept
                    </Button>
                    <Button onClick={() => handleRespond("counter")} disabled={loading || rounds.length >= 4}
                      variant="outline" className="h-8 text-xs">
                      {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <MessageSquare className="h-3 w-3 mr-1" />}
                      Counter ({rounds.length < 4 ? `${4 - rounds.length} left` : "max reached"})
                    </Button>
                    <Button onClick={() => handleRespond("decline")} disabled={loading}
                      variant="ghost" className="h-8 text-xs text-rose-600">
                      <XCircle className="h-3 w-3 mr-1" />
                      Decline
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Result state */}
          {result && (
            <div className={`rounded-lg border p-3 text-sm ${
              result.action === "accepted" ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200" :
              result.action === "declined" ? "bg-rose-50 dark:bg-rose-950/20 border-rose-200" :
              "bg-blue-50 dark:bg-blue-950/20 border-blue-200"
            }`}>
              <div className="flex items-center gap-2 font-medium">
                {result.action === "accepted" ? (
                  <><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Contract created!</>
                ) : result.action === "declined" ? (
                  <><XCircle className="h-4 w-4 text-rose-600" /> Offer declined</>
                ) : result.action === "countered" ? (
                  <><MessageSquare className="h-4 w-4 text-blue-600" /> Counter offer sent</>
                ) : (
                  <><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Offer accepted!</>
                )}
              </div>
              <p className="text-xs mt-1 text-muted-foreground">
                {result.action === "accepted"
                  ? "The contract has been created. You can view it in your workspace."
                  : result.action === "countered"
                  ? "Your counter offer has been sent. Wait for the other party to respond."
                  : "The offer has been processed."}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <Button size="sm" className="h-7 text-xs" asChild>
                  <Link href="/dashboard/job-offers">Back to Job Offers</Link>
                </Button>
                {result.contractId && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                    <Link href={`/dashboard/contracts/${result.contractId}`}>View Contract</Link>
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Info about rounds */}
          {offer.offer_type_new !== "gig_direct" && rounds.length > 0 && (
            <p className="text-[10px] text-muted-foreground text-center">
              {rounds.length}/4 rounds used · Both sides get 2 rounds each
            </p>
          )}
          </ToastProvider>
        </DialogContent>
      </Dialog>
    </>
  );
}
