"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RotateCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Small client component for the admin webhook log. POSTs the event id to
 * /api/admin/webhooks/retry and refreshes the page on success.
 */
export function WebhookRetryButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function retry() {
    if (!confirm("Re-run this webhook event? Status transitions are idempotent, but check the result in the DB.")) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/admin/webhooks/retry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ event_id: eventId }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        setErr(d?.error ?? "Retry failed");
        setBusy(false);
        return;
      }
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" onClick={retry} disabled={busy}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
        Retry
      </Button>
      {err && <span className="text-[10px] text-destructive">{err}</span>}
    </div>
  );
}
