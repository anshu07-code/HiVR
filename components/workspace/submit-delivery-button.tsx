"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Send, Loader2, X, FileText, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { formatPaise } from "@/lib/utils";

/**
 * Submit-delivery button with confirmation dialog.
 * Lists the employee's uploaded files so the user can verify what's
 * about to be sent for review. Calls /api/workspace/submit-delivery
 * which delegates to submit_workspace_delivery (which snapshots
 * uploaded_by = employee_id files into the reviewable set).
 */
export function SubmitDeliveryButton({
  workspaceId,
  disabled,
  hint,
  isResubmit = false,
  onDone,
}: {
  workspaceId: string;
  disabled: boolean;
  hint?: string;
  isResubmit?: boolean;
  onDone: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [files, setFiles] = React.useState<{ id: string; name: string; size: number | null }[]>([]);
  const [loadingFiles, setLoadingFiles] = React.useState(false);

  async function loadFiles() {
    setLoadingFiles(true);
    const sb = createClient();
    const { data: me } = await sb.auth.getUser();
    if (!me.user) { setLoadingFiles(false); return; }
    const { data } = await sb
      .from("workspace_vault")
      .select("id, name, original_name, file_size, is_folder, delivered_at")
      .eq("workspace_id", workspaceId)
      .eq("uploaded_by", me.user.id)
      .eq("is_folder", false)
      .is("delivered_at", null) // not yet submitted
      .order("created_at", { ascending: false });
    setFiles(((data ?? []) as any[]).map((f) => ({
      id: f.id,
      name: f.original_name ?? f.name,
      size: f.file_size,
    })));
    setLoadingFiles(false);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/workspace/submit-delivery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) {
        setError(data?.error ?? "Failed to submit");
        return;
      }
      setOpen(false);
      onDone();
    } finally {
      setBusy(false);
    }
  }

  function openDialog() {
    setError(null);
    setOpen(true);
    void loadFiles();
  }

  if (!open) {
    return (
      <Button
        size="sm"
        variant="gradient"
        disabled={disabled}
        onClick={openDialog}
        title={disabled ? (hint ?? "Not available") : "Submit delivery for review"}
      >
        <Send className="h-3.5 w-3.5" />
        {isResubmit ? "Re-submit delivery" : "Submit delivery"}
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => !busy && setOpen(false)}>
      <div className="w-full max-w-md rounded-lg border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
            <Send className="h-4 w-4 text-primary" />
            {isResubmit ? "Re-submit delivery?" : "Submit delivery?"}
          </h3>
          <Button variant="ghost" size="icon" onClick={() => setOpen(false)} disabled={busy}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          The buyer will review and approve each of the files below. Reference materials uploaded by the buyer are NOT part of this delivery.
        </p>

        <div className="mt-3 rounded-md border bg-muted/20 p-2.5">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Your files ({files.length})
          </p>
          {loadingFiles ? (
            <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />Loading…
            </div>
          ) : files.length === 0 ? (
            <p className="py-2 text-xs text-rose-600">
              You have not uploaded any files yet. Upload at least one deliverable file to the vault first.
            </p>
          ) : (
            <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
              {files.map((f) => (
                <li key={f.id} className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-muted/40">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  {f.size != null && (
                    <span className="text-[10px] text-muted-foreground">
                      {Math.round(f.size / 1024)} KB
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="gradient"
            onClick={submit}
            disabled={busy || files.length === 0}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            {isResubmit ? "Re-submit" : "Submit"} {files.length > 0 && `(${files.length})`}
          </Button>
        </div>
      </div>
    </div>
  );
}
