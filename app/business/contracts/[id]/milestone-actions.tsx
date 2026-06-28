"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IndianRupee, CheckCircle2, ThumbsDown, Loader2 } from "lucide-react";

export function MilestoneActions({
  contractId, milestoneId, status, amountPaise, nextActionable,
}: { contractId: string; milestoneId: string; status: string; amountPaise: number; nextActionable: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  async function act(action: "approve" | "reject" | "release") {
    setBusy(action); setErr(null);
    try {
      const res = await fetch(`/api/business/contracts/${contractId}/milestones/${milestoneId}/${action}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) { setErr(data?.error ?? "Failed"); return; }
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Failed");
    } finally {
      setBusy(null);
    }
  }

  if (status === "paid") {
    return <Badge variant="default" className="text-[10px]">Settled</Badge>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {err && <span className="text-xs text-destructive">{err}</span>}
      {(status === "submitted" || status === "approved") && (
        <>
          {status === "submitted" && (
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => act("reject")}>
              {busy === "reject" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsDown className="h-3.5 w-3.5" />} Request changes
            </Button>
          )}
          {status === "approved" && (
            <Button size="sm" variant="gradient" disabled={busy !== null} onClick={() => act("release")}>
              {busy === "release" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <IndianRupee className="h-3.5 w-3.5" />} Release ₹{Math.round(amountPaise / 100)}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
