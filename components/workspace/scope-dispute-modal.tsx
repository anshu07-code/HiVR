"use client";

import * as React from "react";
import { ShieldAlert, Loader2, X, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

export function ScopeDisputeModal({
  contractId, onClose, onDone,
}: {
  contractId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = React.useState("");
  const [fileUrl, setFileUrl] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const evidence = fileUrl
      ? [{ evidence_type: "link", content: fileUrl, file_url: fileUrl }]
      : [];
    const r = await fetch("/api/disputes/scope-mismatch", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ contractId, reason, evidence }),
    });
    setBusy(false);
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) { setError(data?.error ?? "Failed"); return; }
    onDone();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
            <ShieldAlert className="h-4 w-4 text-amber-600" />File a scope-mismatch dispute
          </h3>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Cite specific discrepancies between the original brief and what the buyer is asking. An admin will review within 7 days.
        </p>
        <div className="mt-3 space-y-3">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Reason (min 10 characters)</label>
            <Textarea
              className="mt-1"
              rows={5}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Buyer added 3 extra logos after hire that weren't in the brief"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Evidence URL (optional)</label>
            <div className="relative mt-1">
              <Paperclip className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={fileUrl}
                onChange={(e) => setFileUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>
          </div>
        </div>
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" variant="gradient" disabled={busy || reason.trim().length < 10} onClick={submit}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldAlert className="h-3.5 w-3.5" />}
            Submit dispute
          </Button>
        </div>
      </div>
    </div>
  );
}
