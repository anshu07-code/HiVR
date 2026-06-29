"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Small client island for the per-card delete button.
 * Prompts for confirmation before calling the deleteTaskAction.
 */
export function TaskActions({ taskId, taskTitle }: { taskId: string; taskTitle: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onDelete() {
    const ok = window.confirm(
      `Delete "${taskTitle}"?\n\nIf anyone has applied, the task will be marked cancelled (kept for record). If there are no applications, it will be removed entirely.`
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const { deleteTaskAction } = await import("./actions");
      const r = await deleteTaskAction(taskId);
      if (!r.ok) {
        setError(r.reason ?? "Delete failed");
        return;
      }
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 text-[11px] text-rose-600 hover:bg-rose-500/10"
        onClick={onDelete}
        disabled={busy}
        title="Delete task"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
      </Button>
      {error && (
        <div className="absolute right-0 top-full z-10 mt-1 max-w-xs rounded border border-destructive/30 bg-destructive/5 px-2 py-1 text-[10px] text-destructive">
          {error}
        </div>
      )}
    </>
  );
}
