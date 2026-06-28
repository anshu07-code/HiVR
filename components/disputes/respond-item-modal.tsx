"use client";

import * as React from "react";
import { AlertTriangle, Loader2, X, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

type Item = {
  id: string;
  description: string;
  buyer_comment: string | null;
};

export function RespondItemModal({
  item, onClose, onDone,
}: {
  item: Item;
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
      body: JSON.stringify({ itemId: item.id, action, response, evidenceUrl }),
    });
    setBusy(false);
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) { setError(data?.error ?? "Failed"); return; }
    onDone();
  };

  const needsMore = action === "dispute" && !evidenceUrl && (response.trim().length < 5);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
            <AlertTriangle className="h-4 w-4 text-amber-600" />Respond to flagged item
          </h3>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          <strong>{item.description}</strong>
          {item.buyer_comment && <> — buyer said: <em>"{item.buyer_comment}"</em></>}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setAction("fix")}
            className={`rounded-md border p-2 text-left text-xs transition-colors ${action === "fix" ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}
          >
            <p className="font-semibold">Fix and redeliver</p>
            <p className="text-muted-foreground">Mark for buyer re-review.</p>
          </button>
          <button
            type="button"
            onClick={() => setAction("dispute")}
            className={`rounded-md border p-2 text-left text-xs transition-colors ${action === "dispute" ? "border-amber-500 bg-amber-500/5" : "hover:bg-muted/40"}`}
          >
            <p className="font-semibold">Dispute this item</p>
            <p className="text-muted-foreground">Admin will review.</p>
          </button>
        </div>
        <div className="mt-3 space-y-2">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Response</label>
            <Textarea
              className="mt-1"
              rows={3}
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              placeholder={action === "fix" ? "Describe what you changed" : "Explain why this was done"}
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
        {needsMore && <p className="mt-2 text-xs text-amber-700">Provide a response or evidence URL to dispute.</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" variant={action === "dispute" ? "outline" : "gradient"} disabled={busy || needsMore} onClick={submit}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {action === "fix" ? "Submit fix" : "Open dispute"}
          </Button>
        </div>
      </div>
    </div>
  );
}
