"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Ban, Loader2, ShieldAlert, CheckCircle2, X, AlertTriangle, Lock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatINR, formatPaise } from "@/lib/utils";

type Props = {
  contractId: string;
  workspaceId: string;
  currentUserId: string;
  buyerId: string;
  employeeId: string;
  currentUserRole: "buyer" | "employee";
  workspaceStatus: string;
  cancellable: boolean;
  cancellationPolicy: "cancellable" | "non-cancellable";
  agreedPaise: number;
  totalDeliverables: number;
  approvedDeliverables: number;
};

export function CancellationPanel({
  contractId, workspaceId, currentUserId, buyerId, employeeId,
  currentUserRole, workspaceStatus, cancellable, cancellationPolicy,
  agreedPaise, totalDeliverables, approvedDeliverables,
}: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{
    refund_paise: number; penalty_paise: number;
    earned_paise: number; approved_count: number;
  } | null>(null);

  const isTerminal = workspaceStatus === "completed" || workspaceStatus === "cancelled" || workspaceStatus === "frozen";
  const isBuyer = currentUserRole === "buyer";

  if (isTerminal && workspaceStatus === "cancelled" && result) {
    return (
      <Card className="border-rose-500/30 bg-rose-500/5">
        <CardContent className="flex items-start gap-3 p-4 text-sm">
          <Ban className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <div className="space-y-1">
            <p className="font-semibold text-rose-700">Workspace cancelled</p>
            <p className="text-xs text-rose-700/80">
              {result.approved_count} of {totalDeliverables} deliverables approved.
              {isBuyer
                ? <> You received <strong>{formatPaise(result.refund_paise)}</strong> as refund.</>
                : <> You earned <strong>{formatPaise(result.earned_paise)}</strong> for approved work.</>}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Non-cancellable
  if (cancellationPolicy === "non-cancellable" && !isTerminal) {
    return (
      <Card className="border-sky-500/30 bg-sky-500/5">
        <CardContent className="flex items-start gap-3 p-4 text-sm">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
          <div>
            <p className="font-semibold text-sky-700">Non-cancellable contract</p>
            <p className="text-xs text-sky-700/80">
              Once funded, the full amount is locked. No refunds or cancellations permitted.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!cancellable || isTerminal) return null;

  const deliverablePrice = totalDeliverables > 0 ? Math.floor(agreedPaise / totalDeliverables) : 0;
  const remaining = agreedPaise - (deliverablePrice * approvedDeliverables);
  const penaltyEstimate = Math.floor(remaining * 0.20);
  const refundEstimate = remaining - penaltyEstimate;

  async function handleCancel() {
    setError(null);
    setSubmitting(true);
    try {
      const r = await fetch("/api/workspace/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setError(data?.error ?? "Cancellation failed");
        return;
      }
      setResult({
        refund_paise: data.refund_paise,
        penalty_paise: data.penalty_paise,
        earned_paise: data.earned_paise,
        approved_count: data.approved_count,
      });
      router.refresh();
    } catch (e: any) {
      setError(e.message ?? "Cancellation failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="border-rose-500/30">
      <CardHeader className="pb-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <div>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Ban className="h-4 w-4 text-rose-600" />
              Cancel this contract
            </CardTitle>
            <CardDescription>
              {isBuyer
                ? `Cancel and get a partial refund. ${approvedDeliverables}/${totalDeliverables} deliverables approved.`
                : `Cancel and forfeit remaining balance. ${approvedDeliverables}/${totalDeliverables} deliverables approved.`}
            </CardDescription>
          </div>
          <span className="text-xs text-muted-foreground">{expanded ? "Hide" : "Details"}</span>
        </button>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-3 pb-4 text-sm">
          <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Contract amount</span>
              <span className="font-medium">{formatPaise(agreedPaise)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Deliverables</span>
              <span className="font-medium">{approvedDeliverables} of {totalDeliverables} approved</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Earned by employee</span>
              <span className="font-medium">{formatPaise(deliverablePrice * approvedDeliverables)}</span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span className="text-muted-foreground">Remaining</span>
              <span className="font-medium">{formatPaise(remaining)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cancellation fee (20% of remaining)</span>
              <span className="font-medium text-rose-600">-{formatPaise(penaltyEstimate)}</span>
            </div>
            <div className="flex justify-between border-t pt-2 text-sm">
              <span className="font-semibold">Estimated refund to buyer</span>
              <span className="font-semibold text-emerald-600">{formatPaise(refundEstimate)}</span>
            </div>
            {!isBuyer && (
              <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
                <AlertTriangle className="mr-1 inline h-3 w-3 text-amber-600" />
                If you cancel, <strong>{formatPaise(penaltyEstimate)} (20%)</strong> is charged as a penalty on the remaining balance.
              </div>
            )}
          </div>

          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">{error}</p>
          )}

          <Button
            size="sm"
            variant="destructive"
            onClick={handleCancel}
            disabled={submitting}
            className="w-full"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
            {isBuyer ? `Cancel & refund ${formatINR(Math.round(refundEstimate / 100))}` : "Cancel contract"}
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
