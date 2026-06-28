"use client";

import * as React from "react";
import { AlertTriangle, Loader2, X, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

export function RespondItemModal({
  item, onClose, onDone,
}: {
  item: { id: string; description: string; status: string };
  onClose: () => void;
  onDone: () => void;
}) {
  const [action, setAction] = React.useState<"fix" | "dispute">("fix");
  const [response, setResponse] = React.useState("");
  const [evidenceUrl, setEvidenceUrl] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const r = await fetch("/api/delivery/respond-item", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId: item.id, action, response, evidenceUrl: evidenceUrl || null }),
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
            <AlertTriangle className="h-4 w-4 text-amber-600" />Respond to feedback
          </h3>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          <span className="font-medium">Item:</span> {item.description}
        </p>
        <div className="mt-3 space-y-3">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Action</label>
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={() => setAction("fix")}
                className={`flex-1 rounded-md border px-3 py-2 text-xs font-medium ${action === "fix" ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"}`}
              >
                Fix &amp; redeliver
              </button>
              <button
                type="button"
                onClick={() => setAction("dispute")}
                className={`flex-1 rounded-md border px-3 py-2 text-xs font-medium ${action === "dispute" ? "border-amber-500 bg-amber-500/10 text-amber-700" : "hover:bg-muted"}`}
              >
                Dispute this item
              </button>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Response</label>
            <Textarea
              className="mt-1"
              rows={4}
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              placeholder="What did you do / why is this disputed?"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Evidence URL (optional)</label>
            <div className="relative mt-1">
              <Paperclip className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={evidenceUrl}
                onChange={(e) => setEvidenceUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>
          </div>
        </div>
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" variant="gradient" disabled={busy || response.trim().length < 3} onClick={submit}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            Submit
          </Button>
        </div>
      </div>
    </div>
  );
}
