"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

export function DeleteGigButton({ gigId }: { gigId: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = React.useState(false);

  const handleDelete = async () => {
    if (!confirm("Delete this gig? This action cannot be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/gigs/${gigId}`, { method: "DELETE" });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed to delete"); }
      router.refresh();
    } catch (err: any) {
      alert("Error: " + err.message);
    }
    setDeleting(false);
  };

  return (
    <button onClick={handleDelete} disabled={deleting}
      className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50">
      <Trash2 className="h-3 w-3" />{deleting ? "Deleting..." : "Delete"}
    </button>
  );
}
