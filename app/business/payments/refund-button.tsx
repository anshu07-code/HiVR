"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RefreshCcw, Loader2 } from "lucide-react";

export function RefundButton({ milestoneId, contractId, amountPaise }: { milestoneId: string; contractId: string; amountPaise: number }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function refund() {
    const reason = prompt(
      `Refund ₹${Math.round(amountPaise / 100)} to your business? This reverses the milestone payment.\n\nBriefly note why (will be shared with the employee):`,
      "Work didn't meet the agreed spec"
    );
    if (reason === null) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/business/contracts/${contractId}/milestones/${milestoneId}/refund`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: reason.slice(0, 1000) }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data?.error ?? "Failed"); setBusy(false); return; }
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1 flex flex-col items-end gap-1">
      <Button variant="ghost" size="sm" onClick={refund} disabled={busy} className="text-destructive hover:text-destructive">
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCcw className="h-3 w-3" />}
        Refund
      </Button>
      {err && <span className="text-[10px] text-destructive">{err}</span>}
    </div>
  );
}
