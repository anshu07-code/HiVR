"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  CheckCircle2, Clock, XCircle, AlertCircle, Loader2, Pause, Play, Plus,
  Send, Timer, FileText, Link as LinkIcon,
} from "lucide-react";
import { formatPaise } from "@/lib/utils";

type Milestone = {
  id: string;
  contract_id: string;
  description: string;
  amount: number;
  status: string;
  due_date: string | null;
  submitted_at: string | null;
  submission_note: string | null;
  submission_url: string | null;
  buyer_feedback: string | null;
  approved_at: string | null;
  paid_at: string | null;
  created_at: string;
  checkpoint_index: number | null;
  checkpoint_minutes: number | null;
  auto_approve_at: string | null;
};

const STATUS_TONE: Record<string, string> = {
  pending:       "bg-muted text-muted-foreground border-border",
  delivered:     "bg-amber-500/10 text-amber-700 border-amber-500/20",
  approved:      "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  paid:          "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  auto_approved: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  rejected:      "bg-rose-500/10 text-rose-700 border-rose-500/20",
  paused:        "bg-sky-500/10 text-sky-700 border-sky-500/20",
  cancelled:     "bg-muted text-muted-foreground border-border",
  disputed:      "bg-orange-500/10 text-orange-700 border-orange-500/20",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  delivered: "Delivered",
  approved: "Approved",
  paid: "Paid",
  auto_approved: "Auto-approved",
  rejected: "Rejected",
  paused: "Paused",
  cancelled: "Cancelled",
  disputed: "Disputed",
};

/**
 * Milestone list with checkpoint workflow (for hourly work). Each
 * checkpoint is 30 minutes of work; the employee submits a deliverable
 * (URL + note), the buyer has 24h to approve; otherwise auto-approval
 * releases the funds.
 */
export function MilestoneCheckpoints({
  contractId, milestones, isBuyer, isEmployee, contractStatus, isHourly, agreedPrice, agreedTotal, checkpointsCompleted, checkpointsTotal,
}: {
  contractId: string;
  milestones: Milestone[];
  isBuyer: boolean;
  isEmployee: boolean;
  contractStatus: string;
  isHourly: boolean;
  agreedPrice: number;
  agreedTotal: number;
  checkpointsCompleted: number;
  checkpointsTotal: number;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [submitFor, setSubmitFor] = React.useState<string | null>(null);
  const [rejectFor, setRejectFor] = React.useState<string | null>(null);
  const [submitNote, setSubmitNote] = React.useState("");
  const [submitUrl, setSubmitUrl] = React.useState("");
  const [rejectFeedback, setRejectFeedback] = React.useState("");
  const [extendOpen, setExtendOpen] = React.useState(false);
  const [extendMinutes, setExtendMinutes] = React.useState(60);
  const [extendPaise, setExtendPaise] = React.useState(0);

  const sorted = [...milestones].sort((a, b) => (a.checkpoint_index ?? 0) - (b.checkpoint_index ?? 0));
  const next = sorted.find(m => m.status === "pending");
  const isPaused = sorted.some(m => m.status === "paused");

  async function submit(milestoneId: string) {
    setBusyId(milestoneId); setError(null);
    const res = await fetch(`/api/contracts/${contractId}/milestones/${milestoneId}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ note: submitNote, url: submitUrl }),
    });
    const data = await res.json();
    setBusyId(null);
    if (!res.ok) { setError(data?.error ?? "Failed"); return; }
    setSubmitFor(null);
    setSubmitNote(""); setSubmitUrl("");
    router.refresh();
  }

  async function approve(milestoneId: string) {
    setBusyId(milestoneId); setError(null);
    const res = await fetch(`/api/contracts/${contractId}/milestones/${milestoneId}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    setBusyId(null);
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d?.error ?? "Failed"); return; }
    router.refresh();
  }

  async function reject(milestoneId: string) {
    if (rejectFeedback.length < 5) { setError("Add at least 5 characters of feedback"); return; }
    setBusyId(milestoneId); setError(null);
    const res = await fetch(`/api/contracts/${contractId}/milestones/${milestoneId}/reject`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ feedback: rejectFeedback }),
    });
    setBusyId(null);
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d?.error ?? "Failed"); return; }
    setRejectFor(null);
    setRejectFeedback("");
    router.refresh();
  }

  async function pause() {
    setBusy(true); setError(null);
    const res = await fetch(`/api/contracts/${contractId}/pause`, { method: "POST" });
    setBusy(false);
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d?.error ?? "Failed"); return; }
    router.refresh();
  }
  async function resume() {
    setBusy(true); setError(null);
    const res = await fetch(`/api/contracts/${contractId}/resume`, { method: "POST" });
    setBusy(false);
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d?.error ?? "Failed"); return; }
    router.refresh();
  }
  async function extendWork() {
    setBusy(true); setError(null);
    const res = await fetch(`/api/contracts/${contractId}/extend`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ minutes: extendMinutes, paise: extendPaise }),
    });
    setBusy(false);
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d?.error ?? "Failed"); return; }
    setExtendOpen(false);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Timer className="h-4 w-4" />
              {isHourly ? "Hourly checkpoints" : "Milestones"}
            </CardTitle>
            <CardDescription>
              {isHourly
                ? "Work is split into 30-minute checkpoints. Each checkpoint is auto-approved 24h after submission unless you reject it."
                : "Fixed-price milestones. Each is approved and paid individually."}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isHourly && (
              <div className="text-right text-xs">
                <div className="text-muted-foreground">Approved</div>
                <div className="font-display text-base font-semibold">
                  {formatPaise(agreedTotal)} <span className="text-xs text-muted-foreground">/ {formatPaise(agreedPrice)}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {checkpointsCompleted}/{checkpointsTotal} checkpoints
                </div>
              </div>
            )}
            {isBuyer && isHourly && contractStatus === "active" && (
              isPaused
                ? <Button size="sm" variant="outline" onClick={resume} disabled={busy}><Play className="h-3.5 w-3.5" />Resume</Button>
                : <Button size="sm" variant="outline" onClick={pause} disabled={busy}><Pause className="h-3.5 w-3.5" />Pause timer</Button>
            )}
            {isBuyer && contractStatus === "active" && (
              <Button size="sm" variant="outline" onClick={() => setExtendOpen(o => !o)}>
                <Plus className="h-3.5 w-3.5" />Extend
              </Button>
            )}
          </div>
        </div>
        {extendOpen && (
          <div className="mt-3 rounded-md border bg-muted/30 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Add more work to this contract</p>
            <p className="mt-1 text-xs text-muted-foreground">Add extra checkpoints the employee will deliver against.</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <div>
                <label className="text-[10px] text-muted-foreground">Extra minutes</label>
                <Input type="number" min={15} step={15} value={extendMinutes} onChange={(e) => {
                  const m = Number(e.target.value) || 0;
                  setExtendMinutes(m);
                  setExtendPaise(Math.round((agreedPrice / Math.max(1, checkpointsTotal || 1)) * (m / 30)));
                }} className="h-9" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Extra amount (₹)</label>
                <Input type="number" min={0} step={50} value={Math.round(extendPaise / 100)} onChange={(e) => setExtendPaise(Math.round(Number(e.target.value) * 100))} className="h-9" />
              </div>
              <div className="flex items-end">
                <Button size="sm" variant="gradient" onClick={extendWork} disabled={busy} className="w-full">
                  Add checkpoints
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {error && <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">{error}</div>}
        {sorted.length === 0 && <p className="text-sm text-muted-foreground">No checkpoints yet.</p>}
        <ol className="space-y-2">
          {sorted.map((m) => {
            const tone = STATUS_TONE[m.status] ?? "";
            const isExpanded = submitFor === m.id || rejectFor === m.id;
            const dueDate = m.due_date ? new Date(m.due_date) : null;
            const now = new Date();
            const isOverdue = dueDate && dueDate < now && (m.status === "pending");
            const isAwaitingApproval = m.status === "delivered";
            return (
              <li key={m.id} className={`rounded-md border p-3 ${tone}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {m.checkpoint_index != null && (
                        <span className="grid h-5 w-5 place-items-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                          {m.checkpoint_index}
                        </span>
                      )}
                      <span className="text-sm font-semibold">{m.description}</span>
                      <span className="text-[10px] uppercase tracking-wider opacity-70">{STATUS_LABEL[m.status] ?? m.status}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] opacity-80">
                      {m.checkpoint_minutes != null && <span>{m.checkpoint_minutes} min</span>}
                      <span>{formatPaise(m.amount)}</span>
                      {dueDate && (
                        <span className={isOverdue ? "text-rose-600 font-semibold" : ""}>
                          due {dueDate.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                        </span>
                      )}
                      {m.auto_approve_at && (m.status === "delivered" || m.status === "pending") && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          auto-approve {new Date(m.auto_approve_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                        </span>
                      )}
                    </div>
                    {m.submission_note && (
                      <p className="mt-1.5 text-xs"><strong>Submitted:</strong> {m.submission_note}</p>
                    )}
                    {m.submission_url && (
                      <a href={m.submission_url} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 break-all text-xs text-primary hover:underline">
                        <LinkIcon className="h-3 w-3" />{m.submission_url}
                      </a>
                    )}
                    {m.buyer_feedback && m.status === "pending" && (
                      <div className="mt-2 rounded border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-800">
                        <strong>Buyer feedback:</strong> {m.buyer_feedback}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {isEmployee && m.status === "pending" && (
                      <Button size="sm" onClick={() => setSubmitFor(m.id)} disabled={busyId === m.id}>
                        <Send className="h-3.5 w-3.5" />Submit
                      </Button>
                    )}
                    {isBuyer && m.status === "delivered" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setRejectFor(m.id)} disabled={busyId === m.id}>
                          <XCircle className="h-3.5 w-3.5" />Reject
                        </Button>
                        <Button size="sm" variant="gradient" onClick={() => approve(m.id)} disabled={busyId === m.id}>
                          <CheckCircle2 className="h-3.5 w-3.5" />Approve
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* Submit form */}
                {submitFor === m.id && (
                  <div className="mt-3 space-y-2 border-t pt-3">
                    <p className="text-xs font-semibold text-foreground">Submit checkpoint deliverable</p>
                    <Input
                      placeholder="https://… (link to your work, repo, file)"
                      value={submitUrl}
                      onChange={(e) => setSubmitUrl(e.target.value)}
                    />
                    <Textarea
                      placeholder="What did you accomplish in this 30-min block?"
                      rows={2}
                      value={submitNote}
                      onChange={(e) => setSubmitNote(e.target.value)}
                    />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setSubmitFor(null)}>Cancel</Button>
                      <Button size="sm" onClick={() => submit(m.id)} disabled={busyId === m.id || (!submitUrl && !submitNote)}>
                        {busyId === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        Submit for review
                      </Button>
                    </div>
                  </div>
                )}

                {/* Reject form */}
                {rejectFor === m.id && (
                  <div className="mt-3 space-y-2 border-t pt-3">
                    <p className="text-xs font-semibold text-foreground">Reject with feedback (required)</p>
                    <Textarea
                      placeholder="What's missing or needs to change? Be specific so the employee can address it."
                      rows={3}
                      value={rejectFeedback}
                      onChange={(e) => setRejectFeedback(e.target.value)}
                    />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setRejectFor(null)}>Cancel</Button>
                      <Button size="sm" variant="destructive" onClick={() => reject(m.id)} disabled={busyId === m.id || rejectFeedback.length < 5}>
                        {busyId === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                        Reject
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
