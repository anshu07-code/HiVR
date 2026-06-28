"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Ban, Loader2, ShieldAlert, CheckCircle2, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn, formatPaise } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

type Cancellation = {
  id: string;
  contract_id: string;
  requested_by: string;
  responded_by: string | null;
  reason: string;
  status: "pending" | "agreed" | "rejected" | "withdrawn" | "expired";
  refund_paise: number;
  platform_retained_paise: number;
  employee_penalty_paise: number;
  created_at: string;
  responded_at: string | null;
  completed_at: string | null;
};

type Props = {
  contractId: string;
  workspaceId: string;
  currentUserId: string;
  buyerId: string;
  employeeId: string;
  currentUserRole: "buyer" | "employee";
  workspaceStatus: string;
  /** True if the contract is in a state where a cancellation can still be initiated. */
  cancellable: boolean;
  /** Optional: the agreed_price (for showing the refund/penalty preview). */
  agreedPaise: number;
};

export function CancellationPanel({
  contractId, workspaceId, currentUserId, buyerId, employeeId,
  currentUserRole, workspaceStatus, cancellable, agreedPaise,
}: Props) {
  const router = useRouter();
  const sbRef = React.useRef<ReturnType<typeof createClient> | null>(null);
  const [cancellation, setCancellation] = React.useState<Cancellation | null>(null);
  const [reason, setReason] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [responding, setResponding] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState(false);

  const counterpartyId = currentUserRole === "buyer" ? employeeId : buyerId;

  const fetchCancellation = React.useCallback(async () => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const { data } = await sb
      .from("contract_cancellations")
      .select("id, contract_id, requested_by, responded_by, reason, status, refund_paise, platform_retained_paise, employee_penalty_paise, created_at, responded_at, completed_at")
      .eq("contract_id", contractId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setCancellation((data ?? null) as Cancellation | null);
  }, [contractId]);

  React.useEffect(() => { fetchCancellation(); }, [fetchCancellation]);

  React.useEffect(() => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const ch = sb
      .channel(`cancellation-${contractId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "contract_cancellations", filter: `contract_id=eq.${contractId}` }, () => fetchCancellation())
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [contractId, fetchCancellation]);

  async function submitRequest() {
    if (reason.trim().length < 3) {
      setError("Please provide a reason (at least 3 characters).");
      return;
    }
    setError(null);
    setSubmitting(true);
    const r = await fetch(`/api/contracts/${contractId}/cancel/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    setSubmitting(false);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(data?.error ?? "Failed to submit request");
      return;
    }
    setReason("");
    setExpanded(false);
    await fetchCancellation();
  }

  async function respond(agree: boolean) {
    if (!cancellation) return;
    setError(null);
    setResponding(true);
    const r = await fetch(`/api/contracts/${contractId}/cancel/respond`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cancellation_id: cancellation.id, agree }),
    });
    setResponding(false);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(data?.error ?? "Failed to respond");
      return;
    }
    await fetchCancellation();
    router.refresh();
  }

  const isTerminal = workspaceStatus === "completed" || workspaceStatus === "cancelled" || workspaceStatus === "frozen";
  const showInitiator = cancellable && !cancellation && !isTerminal;

  // ---- Render: terminal cancellation (agreed) ----
  if (cancellation && cancellation.status === "agreed" && isTerminal) {
    const iRequestedIt = cancellation.requested_by === currentUserId;
    return (
      <Card className="border-rose-500/30 bg-rose-500/5">
        <CardContent className="flex items-start gap-3 p-4 text-sm">
          <Ban className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <div className="space-y-1">
            <p className="font-semibold text-rose-700">
              Contract cancelled by mutual agreement
              {iRequestedIt ? " (you raised the request)" : " (the other party raised the request)"}.
            </p>
            <p className="text-xs text-rose-700/80">
              Reason on file: &ldquo;{cancellation.reason}&rdquo;
            </p>
            {cancellation.refund_paise > 0 && (
              <p className="text-xs text-rose-700/80">
                {formatPaise(cancellation.refund_paise)} was credited to the buyer&apos;s HiVR wallet.
                {cancellation.platform_retained_paise > 0 && (
                  <> HiVR retained {formatPaise(cancellation.platform_retained_paise)} as a platform fee.</>
                )}
              </p>
            )}
            {cancellation.employee_penalty_paise > 0 && (
              <p className="text-xs text-rose-700/80">
                A cancellation fee of {formatPaise(cancellation.employee_penalty_paise)} has been recorded
                against the employee and will reduce their payout on their next contract.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // ---- Render: pending request that the current user must respond to ----
  if (cancellation && cancellation.status === "pending" && cancellation.requested_by !== currentUserId) {
    const requesterLabel = cancellation.requested_by === buyerId ? "Buyer" : "Employee";
    return (
      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm text-amber-800">
            <Ban className="h-4 w-4 text-amber-600" />
            {requesterLabel} requested to cancel this contract
          </CardTitle>
          <CardDescription>
            Both parties must agree for a mutual cancellation to take effect.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pb-4 text-sm">
          <div className="rounded-md border bg-background/50 p-3 text-xs">
            <p className="font-medium text-foreground/80">Reason given</p>
            <p className="mt-1 text-muted-foreground">&ldquo;{cancellation.reason}&rdquo;</p>
          </div>
          <div className="rounded-md border border-sky-500/30 bg-sky-500/5 p-3 text-xs text-sky-700">
            <ShieldAlert className="mr-1 inline h-3.5 w-3.5" />
            <strong>What happens if you agree:</strong>{" "}
            {cancellation.requested_by === buyerId
              ? `The buyer will be refunded 70% of the escrowed amount (${formatPaise(Math.floor(agreedPaise * 0.7))}) to their HiVR wallet; HiVR will retain 30% (${formatPaise(Math.floor(agreedPaise * 0.3))}) as a platform fee.`
              : `The buyer will be refunded the full escrowed amount (${formatPaise(agreedPaise)}) to their HiVR wallet. The employee will receive a penalty on their next contract.`}
          </div>
          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">{error}</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="destructive" onClick={() => respond(true)} disabled={responding}>
              {responding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Agree to cancel
            </Button>
            <Button size="sm" variant="outline" onClick={() => respond(false)} disabled={responding}>
              <X className="h-3.5 w-3.5" />Decline
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ---- Render: pending request raised by ME (awaiting other party) ----
  if (cancellation && cancellation.status === "pending" && cancellation.requested_by === currentUserId) {
    return (
      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardContent className="flex items-start gap-3 p-3 text-sm">
          <Ban className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold text-amber-800">Cancellation request sent</p>
            <p className="text-xs text-amber-700/80">
              Reason: &ldquo;{cancellation.reason}&rdquo;. Waiting for the other party to respond.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ---- Render: rejected request ----
  if (cancellation && cancellation.status === "rejected") {
    return (
      <Card>
        <CardContent className="flex items-start gap-3 p-3 text-sm">
          <X className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-medium text-foreground">Previous cancellation request was declined</p>
            <p className="text-xs text-muted-foreground">The contract continues normally.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ---- Render: cancellable + no current request (initiator UI) ----
  if (showInitiator) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center justify-between text-left"
          >
            <div>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Ban className="h-4 w-4 text-rose-600" />
                Request mutual cancellation
              </CardTitle>
              <CardDescription>
                Both parties must agree. {currentUserRole === "buyer"
                  ? "If you raise it and the employee agrees, you'll be refunded 70% to your HiVR wallet; HiVR retains 30%."
                  : "If you raise it and the buyer agrees, the buyer is fully refunded and a 30% cancellation fee is recorded against you for your next contract."}
              </CardDescription>
            </div>
            <span className="text-xs text-muted-foreground">{expanded ? "Hide" : "Open"}</span>
          </button>
        </CardHeader>
        {expanded && (
          <CardContent className="space-y-3 pb-4 text-sm">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Tell the other party why you want to cancel (visible to both)…"
              maxLength={500}
              rows={3}
              className="w-full rounded-md border bg-background p-2 text-sm outline-none focus:ring-1 focus:ring-primary"
            />
            {error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">{error}</p>
            )}
            <Button size="sm" variant="destructive" onClick={submitRequest} disabled={submitting}>
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
              Send cancellation request
            </Button>
          </CardContent>
        )}
      </Card>
    );
  }

  return null;
}
