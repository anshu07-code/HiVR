"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Trash2, Loader2 } from "lucide-react";

export function DeleteFileButton({ fileId }: { fileId: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function del() {
    if (!confirm("Delete this file? This cannot be undone.")) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/business/files/${fileId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setErr(data?.error ?? "Failed"); setBusy(false); return; }
      router.back();
    } catch (e: any) {
      setErr(e?.message ?? "Failed");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="ghost" size="sm" disabled={busy} onClick={del}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        Delete
      </Button>
      {err && <span className="text-xs text-destructive">{err}</span>}
    </div>
  );
}
