"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function UnsaveButton({ likeId, type }: { likeId: string; type: "gig" | "task" }) {
  const router = useRouter();

  const handleRemove = async () => {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    const table = type === "gig" ? "gig_likes" : "task_likes";
    await sb.from(table as any).delete().eq("id", likeId);
    router.refresh();
  };

  return (
    <button
      onClick={handleRemove}
      className="absolute top-2 right-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-background/80 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100"
      title="Remove from saved"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}
