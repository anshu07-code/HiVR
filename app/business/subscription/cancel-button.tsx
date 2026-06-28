"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { X, Loader2 } from "lucide-react";

export function CancelButton({ subscriptionId }: { subscriptionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function cancel() {
    if (!confirm("Cancel at end of billing period? You'll keep your plan features until then.")) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/business/subscription/cancel", { method: "POST" });
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
    <div className="flex flex-col items-end gap-1">
      <Button variant="ghost" size="sm" onClick={cancel} disabled={busy}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
        Cancel subscription
      </Button>
      {err && <span className="text-xs text-destructive">{err}</span>}
    </div>
  );
}
