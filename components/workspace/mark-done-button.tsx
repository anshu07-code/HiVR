"use client";

import * as React from "react";
import { CheckCircle2, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function MarkDoneButton({
  workspaceId, canMark, hint, onDone,
}: {
  workspaceId: string;
  canMark: boolean;
  hint?: string;
  onDone: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const r = await fetch("/api/workspace/mark-done", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceId }),
    });
    setBusy(false);
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) { setError(data?.error ?? "Failed"); return; }
    setConfirmOpen(false);
    onDone();
  };

  return (
    <>
      <Button
        variant="gradient"
        size="sm"
        disabled={!canMark}
        onClick={() => setConfirmOpen(true)}
        title={!canMark ? (hint ?? "Not available") : "Mark workspace as done"}
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        Mark as done
      </Button>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => !busy && setConfirmOpen(false)}>
          <div className="w-full max-w-md rounded-lg border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />Mark workspace as done?
              </h3>
              <Button variant="ghost" size="icon" onClick={() => setConfirmOpen(false)} disabled={busy}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Funds will be released to the employee and the chat will be locked. This cannot be undone.
            </p>
            {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmOpen(false)} disabled={busy}>Cancel</Button>
              <Button size="sm" variant="gradient" onClick={submit} disabled={busy}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
