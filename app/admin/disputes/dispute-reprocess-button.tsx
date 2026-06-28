"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RotateCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Small client component shown for resolved disputes whose Razorpay money
 * movement failed. Re-runs the Node helper that calls Razorpay.
 */
export function DisputeReprocessButton({ disputeId }: { disputeId: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);

  async function go() {
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      const r = await fetch(`/api/admin/disputes/${disputeId}/reprocess`, { method: "POST" });
      const d = await r.json();
      if (!r.ok || d.ok === false) {
        setErr(d?.error ?? "Reprocess failed");
        return;
      }
      setOk(d.escrow_source === "wallet" ? "Wallet credits already complete" : "Razorpay call succeeded");
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" onClick={go} disabled={busy} title="Re-run Razorpay money movement for a previously-resolved dispute">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
        Reprocess escrow
      </Button>
      {err && <span className="text-[10px] text-destructive">{err}</span>}
      {ok  && <span className="text-[10px] text-emerald-700">{ok}</span>}
    </div>
  );
}
