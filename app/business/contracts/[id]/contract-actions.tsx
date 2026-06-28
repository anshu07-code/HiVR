"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { IndianRupee, Pause, Play, X, AlertCircle, Loader2 } from "lucide-react";
import { PayAdvanceButton } from "./pay-advance-button";

export function ContractActions({
  contractId, status, hasAdvance, advancePaid, advancePaise, hasDispute,
  businessName, employeeName,
}: {
  contractId: string;
  status: string;
  hasAdvance: boolean;
  advancePaid: boolean;
  advancePaise: number;
  hasDispute: boolean;
  businessName: string;
  employeeName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  async function act(action: "pause" | "resume" | "cancel" | "mark-complete") {
    setBusy(action); setErr(null);
    try {
      const res = await fetch(`/api/business/contracts/${contractId}/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data?.error ?? "Failed"); return; }
      if (data?.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        router.refresh();
      }
    } catch (e: any) {
      setErr(e?.message ?? "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {err && <span className="text-xs text-destructive">{err}</span>}
      {hasAdvance && !advancePaid && (status === "active" || status === "pending") && (
        <PayAdvanceButton
          contractId={contractId}
          advancePaise={advancePaise}
          businessName={businessName}
          employeeName={employeeName}
          disabled={hasDispute}
        />
      )}
      {status === "active" && !hasDispute && (
        <>
          <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => act("pause")}>
            <Pause className="h-3.5 w-3.5" /> Pause
          </Button>
          <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => act("mark-complete")}>
            <IndianRupee className="h-3.5 w-3.5" /> Mark complete
          </Button>
        </>
      )}
      {(status === "pending" || status === "active") && !hasDispute && (
        <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => act("cancel")}>
          <X className="h-3.5 w-3.5" /> Cancel
        </Button>
      )}
    </div>
  );
}
