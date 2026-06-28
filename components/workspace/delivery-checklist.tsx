"use client";

import * as React from "react";
import { CheckCircle2, XCircle, Loader2, AlertTriangle, MessageSquare, RotateCcw, FileText, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { RespondItemModal } from "./respond-item-modal";
import { ScopeDisputeModal } from "./scope-dispute-modal";

type Item = {
  id: string;
  brief_item_key: string;
  description: string;
  sort_order: number;
  status: "pending" | "done" | "not_done" | "disputed" | "resolved";
  buyer_comment: string | null;
  employee_response: string | null;
  employee_evidence_url: string | null;
  disputed: boolean;
  resolved_at: string | null;
  updated_at: string;
};

const STATUS_TONE: Record<string, string> = {
  pending:  "bg-muted text-muted-foreground border-border",
  done:     "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  not_done: "bg-rose-500/10 text-rose-700 border-rose-500/20",
  disputed: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  resolved: "bg-primary/10 text-primary border-primary/20",
};

export function DeliveryChecklist({
  contractId, workspaceId, isBuyer, isEmployee, workspaceStatus, isLocked,
}: {
  contractId: string;
  workspaceId: string;
  isBuyer: boolean;
  isEmployee: boolean;
  workspaceStatus: string;
  isLocked: boolean;
}) {
  const [items, setItems] = React.useState<Item[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<Record<string, { status: "done" | "not_done"; comment: string }>>({});
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [respondFor, setRespondFor] = React.useState<Item | null>(null);
  const [disputeOpen, setDisputeOpen] = React.useState(false);

  const refresh = React.useCallback(async () => {
    const sb = createClient();
    const { data, error: err } = await sb
      .from("delivery_checklist_items")
      .select("*")
      .eq("contract_id", contractId)
      .order("sort_order");
    if (err) { setError(err.message); setItems([]); }
    else setItems((data ?? []) as Item[]);
    setLoading(false);
  }, [contractId]);

  React.useEffect(() => {
    refresh();
    const sb = createClient();
    const channel = sb
      .channel(`ws-checklist-${contractId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "delivery_checklist_items", filter: `contract_id=eq.${contractId}` },
        () => refresh())
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [contractId, refresh]);

  const reviewItem = async (item: Item, status: "done" | "not_done") => {
    setBusyId(item.id);
    const comment = editing[item.id]?.comment ?? "";
    const r = await fetch("/api/delivery/review-item", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId: item.id, status, comment: status === "not_done" ? comment : undefined }),
    });
    setBusyId(null);
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) { setError(data?.error ?? "Failed"); return; }
    setEditing((e) => { const n = { ...e }; delete n[item.id]; return n; });
    refresh();
  };

  const reopen = async (item: Item) => {
    setBusyId(item.id);
    const r = await fetch("/api/delivery/review-item", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId: item.id, status: "done" }),
    });
    setBusyId(null);
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) { setError(data?.error ?? "Failed"); return; }
    refresh();
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />Loading checklist…
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" />Delivery checklist
          </CardTitle>
          <CardDescription>
            The buyer didn&apos;t add any checklist items to the brief. You can submit
            delivery directly from the action bar above.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-dashed bg-muted/20 p-6 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-muted-foreground/40" />
            <p className="mt-2 text-sm font-medium">Nothing to check off</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              This workspace has no itemized deliverables. Use the
              <span className="mx-1 font-semibold text-foreground">File vault</span>
              tab to upload your work, then click
              <span className="mx-1 font-semibold text-foreground">Submit delivery</span>
              to notify the buyer.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const doneCount = items.filter((i) => i.status === "done").length;
  const pendingCount = items.filter((i) => i.status === "pending").length;
  const notDoneCount = items.filter((i) => i.status === "not_done").length;
  const disputedCount = items.filter((i) => i.status === "disputed" || i.disputed).length;

  const allDone = pendingCount === 0 && notDoneCount === 0;
  const canBuyerReview = isBuyer && !isLocked && (workspaceStatus === "delivered" || workspaceStatus === "in_review" || workspaceStatus === "funded");
  const canEmployeeRespond = isEmployee && !isLocked && workspaceStatus === "funded";

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4" />Delivery checklist
              </CardTitle>
              <CardDescription>
                {doneCount}/{items.length} marked done
                {notDoneCount > 0 && <> · {notDoneCount} flagged</>}
                {disputedCount > 0 && <> · {disputedCount} disputed</>}
              </CardDescription>
            </div>
            {isEmployee && !isLocked && workspaceStatus === "funded" && (
              <Button size="sm" variant="outline" onClick={() => setDisputeOpen(true)}>
                <ShieldAlert className="h-3.5 w-3.5" />File a scope-mismatch dispute
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">{error}</div>
          )}
          {items.map((it) => {
            const tone = STATUS_TONE[it.status] ?? STATUS_TONE.pending;
            return (
              <div key={it.id} className="rounded-md border bg-card p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">#{it.sort_order}</span>
                      <p className="text-sm font-medium">{it.description}</p>
                      <Badge variant="outline" className={`text-[10px] ${tone}`}>{it.status.replace("_", " ")}</Badge>
                    </div>
                    {it.buyer_comment && (
                      <p className="mt-1 text-xs text-muted-foreground inline-flex items-start gap-1">
                        <MessageSquare className="mt-0.5 h-3 w-3 shrink-0" />
                        Buyer: {it.buyer_comment}
                      </p>
                    )}
                    {it.employee_response && (
                      <p className="mt-1 text-xs text-muted-foreground inline-flex items-start gap-1">
                        <MessageSquare className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                        Employee: {it.employee_response}
                        {it.employee_evidence_url && (
                          <a href={it.employee_evidence_url} target="_blank" rel="noreferrer" className="ml-1 text-primary hover:underline">[evidence]</a>
                        )}
                      </p>
                    )}
                  </div>

                  {canBuyerReview && (
                    <div className="flex flex-col items-end gap-1.5">
                      {it.status === "pending" && (
                        <div className="flex gap-1.5">
                          <Button size="sm" variant="outline" disabled={busyId === it.id} onClick={() => reviewItem(it, "done")}>
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />Done
                          </Button>
                          <Button size="sm" variant="outline" disabled={busyId === it.id} onClick={() => setEditing({ ...editing, [it.id]: { status: "not_done", comment: "" } })}>
                            <XCircle className="h-3.5 w-3.5 text-rose-600" />Not done
                          </Button>
                        </div>
                      )}
                      {it.status === "not_done" && (
                        <Button size="sm" variant="ghost" disabled={busyId === it.id} onClick={() => reopen(it)}>
                          <RotateCcw className="h-3.5 w-3.5" />Reopen
                        </Button>
                      )}
                      {it.status === "disputed" && (
                        <Button size="sm" variant="ghost" disabled={busyId === it.id} onClick={() => reopen(it)}>
                          <RotateCcw className="h-3.5 w-3.5" />Reopen
                        </Button>
                      )}
                    </div>
                  )}

                  {canEmployeeRespond && it.status === "not_done" && (
                    <Button size="sm" variant="outline" disabled={busyId === it.id} onClick={() => setRespondFor(it)}>
                      <AlertTriangle className="h-3.5 w-3.5" />Respond
                    </Button>
                  )}
                </div>

                {editing[it.id] && (
                  <div className="mt-2 space-y-2 border-t pt-2">
                    <Label className="text-xs">Reason for marking as not done (required, min 5 chars)</Label>
                    <Textarea
                      rows={2}
                      value={editing[it.id].comment}
                      onChange={(e) => setEditing({ ...editing, [it.id]: { ...editing[it.id], comment: e.target.value } })}
                      placeholder="e.g. The expected screenshot was missing"
                    />
                    <div className="flex justify-end gap-1.5">
                      <Button size="sm" variant="ghost" onClick={() => setEditing((e) => { const n = { ...e }; delete n[it.id]; return n; })}>Cancel</Button>
                      <Button size="sm" variant="outline" disabled={busyId === it.id || editing[it.id].comment.trim().length < 5} onClick={() => reviewItem(it, "not_done")}>
                        {busyId === it.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}Confirm
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {allDone && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2.5 text-xs text-emerald-700">
              {isEmployee
                ? "All items are resolved — you can now submit delivery."
                : "All items are marked done — you can now mark the workspace as done."}
            </div>
          )}
        </CardContent>
      </Card>

      {respondFor && (
        <RespondItemModal
          item={respondFor}
          onClose={() => setRespondFor(null)}
          onDone={() => { setRespondFor(null); refresh(); }}
        />
      )}
      {disputeOpen && (
        <ScopeDisputeModal
          contractId={contractId}
          onClose={() => setDisputeOpen(false)}
          onDone={() => { setDisputeOpen(false); window.location.reload(); }}
        />
      )}
    </>
  );
}
