"use client";

import * as React from "react";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export function DeleteVideoButton({
  videoId,
  storagePath,
  className,
}: {
  videoId: string;
  storagePath: string;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function del() {
    if (!confirm("Delete this video?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/profile/video-delete?id=${videoId}&path=${encodeURIComponent(storagePath)}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Delete failed");
      router.refresh();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button
      type="button"
      size="icon"
      variant="destructive"
      onClick={del}
      disabled={busy}
      className={className ?? ""}
      aria-label="Delete video"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </Button>
  );
}
