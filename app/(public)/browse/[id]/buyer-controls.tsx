"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Clock, X, Settings, Users, ChevronRight } from "lucide-react";
import { extendDeadlineAction, closeTaskAction } from "@/app/dashboard/tasks/actions";

/**
 * Inline buyer controls on the public task detail page: extend the
 * apply-by deadline, close the task, jump to the applicants panel.
 */
export function BuyerTaskControls({
  taskId, initialDeadline, status, appsCount,
}: {
  taskId: string;
  initialDeadline: string | null;
  status: string;
  appsCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [newDeadline, setNewDeadline] = React.useState(
    initialDeadline
      ? new Date(new Date(initialDeadline).getTime() + 7 * 86400000).toISOString().slice(0, 16)
      : new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16),
  );
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  const isClosed = status === "closed" || status === "cancelled";

  async function extend() {
    if (!newDeadline) return;
    setBusy(true); setMsg(null);
    const r = await extendDeadlineAction(taskId, new Date(newDeadline).toISOString());
    setBusy(false);
    if (r.ok) { setMsg("Deadline extended"); setOpen(false); router.refresh(); }
    else setMsg(r.reason ?? "Failed");
  }

  async function close() {
    if (!confirm("Close this task? No new applications will be accepted.")) return;
    setBusy(true); setMsg(null);
    const r = await closeTaskAction(taskId);
    setBusy(false);
    if (r.ok) { setMsg("Task closed"); router.refresh(); }
    else setMsg(r.reason ?? "Failed");
  }

  return (
    <div className="mt-3 rounded-md border bg-muted/30 p-2.5 text-xs">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Settings className="h-3 w-3" />Manage task
        </span>
        <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setOpen(o => !o)}>
          {open ? <X className="h-3 w-3" /> : "▸"}
        </button>
      </div>
      {open && (
        <div className="mt-2 space-y-2 border-t pt-2">
          <Button asChild size="sm" variant="outline" className="w-full justify-between text-xs">
            <Link href={`/dashboard/tasks/${taskId}/applicants`}>
              <span className="inline-flex items-center gap-1.5"><Users className="h-3 w-3" />Applicants panel</span>
              <span className="inline-flex items-center gap-1 text-muted-foreground">{appsCount} <ChevronRight className="h-3 w-3" /></span>
            </Link>
          </Button>
          {!isClosed && (
            <>
              <div className="space-y-1">
                <Label htmlFor={`dl-${taskId}`} className="text-[10px] uppercase tracking-wider text-muted-foreground">Extend deadline</Label>
                <Input
                  id={`dl-${taskId}`}
                  type="datetime-local"
                  value={newDeadline}
                  onChange={(e) => setNewDeadline(e.target.value)}
                  className="h-7 text-xs w-full"
                />
                <Button size="sm" variant="outline" onClick={extend} disabled={busy} className="h-7 w-full text-xs">
                  Extend
                </Button>
              </div>
              <Button size="sm" variant="ghost" onClick={close} disabled={busy} className="w-full text-xs text-rose-600 hover:bg-rose-500/10">
                <X className="h-3 w-3" />Close task
              </Button>
            </>
          )}
          {msg && <p className="text-[10px] text-muted-foreground">{msg}</p>}
        </div>
      )}
    </div>
  );
}
