"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Pause, Play, X, Archive, RefreshCcw } from "lucide-react";

export function JobAdminActions({ jobId, status, positions, positionsFilled }: { jobId: string; status: string; positions: number; positionsFilled: number }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function update(next: string) {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/business/jobs/${jobId}/status`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: next }) });
      const data = await res.json();
      if (!res.ok) { setErr(data?.error ?? "Failed to update"); return; }
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {err && <span className="text-xs text-destructive">{err}</span>}
      {status === "open" && (
        <>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => update("paused")}><Pause className="h-3.5 w-3.5" /> Pause</Button>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => update("closed")}><Archive className="h-3.5 w-3.5" /> Close</Button>
        </>
      )}
      {status === "paused" && (
        <>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => update("open")}><Play className="h-3.5 w-3.5" /> Resume</Button>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => update("closed")}><Archive className="h-3.5 w-3.5" /> Close</Button>
        </>
      )}
      {status === "closed" && (
        <Button variant="outline" size="sm" disabled={busy} onClick={() => update("open")}><RefreshCcw className="h-3.5 w-3.5" /> Reopen</Button>
      )}
    </div>
  );
}
