"use client";

import * as React from "react";
import Link from "next/link";
import {
  CheckCircle2, XCircle, AlertCircle, Loader2, Send, ChevronRight, RefreshCw,
  ShieldCheck, Star, MessageSquare, FileText, Clock, IndianRupee, Check,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn, formatPaise, timeAgo } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { downloadFromSignedUrl } from "@/lib/safe-download";
import { VaultPreviewModal, type VaultItem as PreviewItem } from "./vault-preview-modal";

type VaultReviewItem = {
  id: string;
  name: string;
  original_name: string | null;
  is_folder: boolean;
  file_type: string | null;
  mime_type: string | null;
  file_size: number | null;
  storage_object_id: string | null;
  review_status: "pending" | "approved" | "rejected";
  review_comment: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  uploaded_by: string;
  uploader_name?: string | null;
};

type ReviewSummary = {
  ok: boolean;
  workspace_id: string;
  status: string;
  escrow_funded: boolean;
  total_files: number;
  approved_files: number;
  rejected_files: number;
  pending_files: number;
  can_mark_done: boolean;
};

export function VaultReviewPanel({
  workspaceId, currentUserId, isBuyer, workspaceStatus,
}: {
  workspaceId: string;
  currentUserId: string;
  isBuyer: boolean;
  workspaceStatus: string;
}) {
  const sbRef = React.useRef<ReturnType<typeof createClient> | null>(null);
  const [items, setItems] = React.useState<VaultReviewItem[]>([]);
  const [summary, setSummary] = React.useState<ReviewSummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [rejectComment, setRejectComment] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [feedback, setFeedback] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [previewItem, setPreviewItem] = React.useState<PreviewItem | null>(null);
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    setLoading(true);
    // 1. Files (non-folder) + folder list (folders are auto-approved display-only)
    const { data: rows } = await sb
      .from("workspace_vault")
      .select("id, name, original_name, is_folder, file_type, mime_type, file_size, storage_object_id, review_status, review_comment, reviewed_at, reviewed_by, created_at, uploaded_by")
      .eq("workspace_id", workspaceId)
      .order("is_folder", { ascending: false })
      .order("name");
    const list = (rows ?? []) as VaultReviewItem[];
    // 2. Resolve uploader names
    const uploaderIds = Array.from(new Set(list.map((i) => i.uploaded_by).filter(Boolean)));
    if (uploaderIds.length > 0) {
      const { data: users } = await sb.from("users").select("id, full_name").in("id", uploaderIds);
      const map: Record<string, string> = {};
      for (const u of (users ?? []) as any[]) map[u.id] = u.full_name ?? "Someone";
      for (const it of list) it.uploader_name = map[it.uploaded_by] ?? null;
    }
    setItems(list);
    // 3. Get review summary
    const { data: sum } = await (sb.rpc as any)("get_workspace_review_summary", { p_workspace_id: workspaceId });
    if (sum) setSummary(sum as ReviewSummary);
    setLoading(false);
  }, [workspaceId]);

  React.useEffect(() => { load(); }, [load]);

  // Realtime — update summary + items instantly. No row filter on
  // workspace_vault (Supabase Realtime applies the filter to the new
  // record which is empty on DELETE, so DELETE events would be
  // silently dropped). Filter client-side instead.
  React.useEffect(() => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const ch = sb
      .channel(`vault-review-${workspaceId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "workspace_vault" },
        (payload: any) => {
          const wsId = (payload.new?.workspace_id ?? payload.old?.workspace_id) as string | undefined;
          if (wsId === workspaceId) load();
        })
      .on("postgres_changes",
        { event: "*", schema: "public", table: "workspaces" },
        (payload: any) => {
          if (payload.new?.id === workspaceId || payload.old?.id === workspaceId) load();
        })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [workspaceId, load]);

  async function reviewFile(vaultId: string, status: "approved" | "rejected", comment?: string) {
    if (!isBuyer) return;
    setBusy(true);
    setError(null);
    setFeedback(null);

    // Optimistic update — flip the status immediately so the UI
    // feels instant. Realtime + the API response will reconcile.
    const optimisticReviewedAt = new Date().toISOString();
    setItems((prev) => prev.map((it) => it.id === vaultId
      ? { ...it, review_status: status, review_comment: comment ?? it.review_comment, reviewed_at: optimisticReviewedAt, reviewed_by: currentUserId }
      : it
    ));
    setSummary((prev) => {
      if (!prev) return prev;
      // Recompute the counts given the new state
      const target = items.find((i) => i.id === vaultId);
      if (!target) return prev;
      const wasApproved = target.review_status === "approved";
      const wasRejected = target.review_status === "rejected";
      const isApproved  = status === "approved";
      const isRejected  = status === "rejected";
      const total = prev.total_files;
      let approved = prev.approved_files + (isApproved ? 1 : 0) - (wasApproved ? 1 : 0);
      let rejected = prev.rejected_files + (isRejected ? 1 : 0) - (wasRejected ? 1 : 0);
      let pending  = prev.pending_files  + (status === target.review_status ? 0 : (target.review_status === "pending" ? -1 : 1));
      approved = Math.max(0, approved);
      rejected = Math.max(0, rejected);
      pending  = Math.max(0, pending);
      const can_mark_done = (workspaceStatus === "delivered" || workspaceStatus === "in_review")
        && total > 0 && pending === 0 && rejected === 0;
      return { ...prev, approved_files: approved, rejected_files: rejected, pending_files: pending, can_mark_done };
    });

    try {
      const r = await fetch("/api/workspace/vault/review", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ vaultId, status, comment }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        setError(d?.error ?? "Failed");
        // Revert optimistic change
        load();
        return;
      }
      setFeedback(status === "approved" ? "File approved" : "Rejection sent to employee");
      setEditingId(null);
      setRejectComment("");
    } catch (e) {
      setError((e as Error).message);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function safeDownload(item: VaultReviewItem) {
    setDownloadingId(item.id);
    try {
      const r = await fetch("/api/workspace/vault/sign", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ vaultId: item.id }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) return;
      await downloadFromSignedUrl(d.url, item.original_name ?? item.name);
    } finally {
      setDownloadingId(null);
    }
  }

  const isLocked = workspaceStatus === "completed" || workspaceStatus === "cancelled" || workspaceStatus === "frozen";
  const fileItems = items.filter((i) => !i.is_folder);
  const folderItems = items.filter((i) => i.is_folder);

  return (
    <div className="space-y-3">
      {/* Summary banner — also hosts the Mark-as-done CTA for the
          buyer (only button at the top, not duplicated at the bottom) */}
      {summary && (
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-sky-500/10 text-sky-600">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold">
                    {isBuyer ? "Review the delivery" : "Buyer is reviewing your delivery"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {summary.total_files === 0
                      ? "No files in the vault."
                      : `${summary.approved_files}/${summary.total_files} approved` +
                        (summary.rejected_files > 0 ? ` · ${summary.rejected_files} rejected` : "") +
                        (summary.pending_files > 0 ? ` · ${summary.pending_files} pending` : "")}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Pill icon={CheckCircle2} tone="sky"    label="Approved" count={summary.approved_files} />
                <Pill icon={XCircle}     tone="rose"   label="Rejected" count={summary.rejected_files} />
                <Pill icon={Clock}       tone="zinc"   label="Pending"  count={summary.pending_files} />
                <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                </Button>
                {isBuyer && !isLocked && (workspaceStatus === "delivered" || workspaceStatus === "in_review") && (
                  <MarkDoneButton
                    workspaceId={workspaceId}
                    disabled={!summary.can_mark_done}
                    onDone={() => load()}
                  />
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {feedback && (
        <div className="flex items-center gap-2 rounded-md border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-[11px] text-sky-700">
          <CheckCircle2 className="h-3.5 w-3.5" />{feedback}
        </div>
      )}

      {/* Employee alert: changes were requested. Lists the rejected
          files at the top so the employee knows what to fix before
          re-uploading. */}
      {!isBuyer && summary && summary.rejected_files > 0 && (
        <Card className="border-2 border-rose-500/40 bg-rose-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-rose-700">
              <XCircle className="h-4 w-4" />
              Changes were requested on {summary.rejected_files} file{summary.rejected_files === 1 ? "" : "s"}
            </CardTitle>
            <CardDescription className="text-rose-800/80">
              The buyer wants changes before marking the work done. Update the files below and re-upload.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {items.filter((it) => !it.is_folder && it.review_status === "rejected").map((it) => (
              <div key={it.id} className="rounded-md border border-rose-500/20 bg-background p-2 text-xs">
                <p className="font-medium text-rose-800">{it.original_name ?? it.name}</p>
                {it.review_comment && (
                  <p className="mt-0.5 flex items-start gap-1 text-[11px] text-rose-700">
                    <MessageSquare className="mt-0.5 h-3 w-3 shrink-0" />{it.review_comment}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-[11px] text-rose-700">
          <AlertCircle className="h-3.5 w-3.5" />{error}
        </div>
      )}

      {/* Lock banner when completed */}
      {isLocked && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-800">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>This workspace is closed. The vault is read-only — nothing can be uploaded, downloaded is fine, and no reviews can be changed.</span>
        </div>
      )}

      {/* File review list */}
      {loading ? (
        <div className="grid place-items-center rounded-md border bg-muted/20 py-12 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : fileItems.length === 0 && folderItems.length === 0 ? (
        <div className="rounded-md border border-dashed bg-muted/20 py-12 text-center">
          <FileText className="mx-auto h-6 w-6 text-muted-foreground/50" />
          <p className="mt-2 text-sm font-medium">No files uploaded</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            The employee didn&apos;t upload any files to the vault for this delivery.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {folderItems.length > 0 && (
            <div className="rounded-md border bg-muted/20 p-2">
              <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Folders (auto-approved)
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {folderItems.map((f) => (
                  <Badge key={f.id} variant="outline" className="text-[10px]">
                    📁 {f.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {fileItems.map((it) => {
            const status = it.review_status;
            return (
              <div
                key={it.id}
                className={cn(
                  "rounded-md border bg-background p-3 transition-colors",
                  status === "approved" && "border-sky-500/40 bg-sky-500/5",
                  status === "rejected" && "border-rose-500/30 bg-rose-500/5",
                  status === "pending" && !isLocked && "border-amber-500/30",
                )}
              >
                <div className="flex flex-wrap items-start gap-3">
                  <FileText className={cn(
                    "mt-0.5 h-5 w-5 shrink-0",
                    status === "approved" ? "text-sky-600" :
                    status === "rejected" ? "text-rose-600" :
                    "text-muted-foreground"
                  )} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-sm font-medium">{it.original_name ?? it.name}</p>
                      <StatusBadge status={status} />
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {(it.file_size ? `${(it.file_size / 1024).toFixed(0)} KB · ` : "")}
                      {it.uploader_name ?? "Employee"} · uploaded {timeAgo(it.created_at)}
                      {it.reviewed_at && <> · reviewed {timeAgo(it.reviewed_at)}</>}
                    </p>
                    {it.review_comment && (
                      <div className={cn(
                        "mt-1.5 flex items-start gap-1.5 rounded-md border p-1.5 text-[11px]",
                        status === "rejected" ? "border-rose-500/20 bg-rose-500/5 text-rose-800" :
                        "border-amber-500/20 bg-amber-500/5 text-amber-800"
                      )}>
                        <MessageSquare className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>{it.review_comment}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => safeDownload(it)} disabled={downloadingId === it.id}>
                      {downloadingId === it.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Download"}
                    </Button>
                    {it.storage_object_id && (
                      <Button size="sm" variant="ghost" onClick={() => setPreviewItem({
                        id: it.id,
                        name: it.original_name ?? it.name,
                        mime_type: it.mime_type,
                        file_type: it.file_type,
                        file_size: it.file_size,
                        storage_object_id: it.storage_object_id,
                        view_count: 0,
                      })}>
                        Preview
                      </Button>
                    )}
                  </div>
                </div>

                {/* Buyer review controls */}
                {isBuyer && !isLocked && (workspaceStatus === "delivered" || workspaceStatus === "in_review") && (
                  <div className="mt-2 border-t pt-2">
                    {editingId === it.id ? (
                      <div className="space-y-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-700">
                          Reject with feedback
                        </p>
                        <Textarea
                          value={rejectComment}
                          onChange={(e) => setRejectComment(e.target.value)}
                          placeholder="Explain what needs to change. The employee sees this immediately."
                          rows={3}
                          maxLength={2000}
                          className="text-xs"
                        />
                        <p className="text-[10px] text-muted-foreground">
                          {rejectComment.length}/2000
                        </p>
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setRejectComment(""); }} disabled={busy}>
                            Cancel
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => reviewFile(it.id, "rejected", rejectComment.trim())} disabled={busy || !rejectComment.trim()}>
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                            Reject
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {status !== "approved" && (
                          <Button size="sm" variant="default" onClick={() => reviewFile(it.id, "approved")} disabled={busy} className="h-7 bg-sky-600 hover:bg-sky-700">
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            Approve
                          </Button>
                        )}
                        {/* Request changes is only shown while the file
                            is still pending OR after the buyer has
                            approved it (in case they change their
                            mind). Once rejected, only "re-approve" is
                            available. */}
                        {(status === "pending" || status === "approved") && (
                          <Button size="sm" variant="outline" onClick={() => { setEditingId(it.id); setRejectComment(""); }} disabled={busy} className="h-7 text-rose-700 hover:bg-rose-500/10">
                            <XCircle className="h-3.5 w-3.5" />Request changes
                          </Button>
                        )}
                        {status === "approved" && (
                          <span className="text-[10px] font-semibold text-sky-700">
                            ✓ Approved{it.reviewed_at ? ` on ${new Date(it.reviewed_at).toLocaleDateString()}` : ""}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {previewItem && (
        <VaultPreviewModal item={previewItem} workspaceId={workspaceId} onClose={() => setPreviewItem(null)} />
      )}
    </div>
  );
}

function Pill({ icon: Icon, tone, label, count }: { icon: any; tone: "sky" | "emerald" | "rose" | "zinc"; label: string; count: number }) {
  const toneClass: Record<string, string> = {
    sky: "text-sky-700 bg-sky-500/10",
    emerald: "text-emerald-700 bg-emerald-500/10",
    rose: "text-rose-700 bg-rose-500/10",
    zinc: "text-muted-foreground bg-muted",
  };
  return (
    <div className={cn("flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium", toneClass[tone])}>
      <Icon className="h-3 w-3" />
      {label}: <span className="font-mono">{count}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: "pending" | "approved" | "rejected" }) {
  if (status === "approved") {
    // Light blue instead of green so it stands out from the rest of
    // the green "ok" status badges (delivered, escrow funded, etc).
    return <Badge variant="outline" className="border-sky-500/40 bg-sky-500/15 text-[9px] text-sky-700"><CheckCircle2 className="h-2.5 w-2.5" />Approved</Badge>;
  }
  if (status === "rejected") {
    return <Badge variant="outline" className="border-rose-500/30 bg-rose-500/10 text-[9px] text-rose-700"><XCircle className="h-2.5 w-2.5" />Rejected</Badge>;
  }
  return <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-[9px] text-amber-700"><Clock className="h-2.5 w-2.5" />Pending</Badge>;
}

function MarkDoneButton({ workspaceId, disabled, onDone }: { workspaceId: string; disabled: boolean; onDone: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function markDone() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/workspace/mark-done", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) { setErr(d?.error ?? "Failed"); return; }
      setOpen(false);
      onDone();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} disabled={disabled} variant="gradient">
        <ShieldCheck className="h-3.5 w-3.5" />Mark as done
      </Button>
    );
  }

  return (
    <div className="rounded-md border bg-background p-3 space-y-2">
      <p className="text-xs font-semibold">Confirm & release payment</p>
      <p className="text-[10px] text-muted-foreground">
        This releases the escrow to the employee, locks the chat, and closes the vault. This can&apos;t be undone.
      </p>
      {err && <p className="text-[10px] text-rose-600">{err}</p>}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
        <Button size="sm" variant="gradient" onClick={markDone} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          Confirm & release
        </Button>
      </div>
    </div>
  );
}
