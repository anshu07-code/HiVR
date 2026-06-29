"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Realtime wrapper for the buyer's "My tasks" list.
 * Refreshes the page whenever:
 *   - one of the buyer's tasks changes status (auto-close, edit, etc.)
 *   - a new application lands on any of the buyer's tasks
 *   - a contract is created (task flips to in_contract)
 *
 * Mount once at the top of the page; no props needed.
 */
export function MyTasksRealtime({ userId, taskIds }: { userId: string; taskIds: string[] }) {
  const router = useRouter();
  React.useEffect(() => {
    const sb = createClient();
    const ids = taskIds.filter(Boolean);
    if (ids.length === 0) return;
    const ch = sb
      .channel("my-tasks-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_posts", filter: `buyer_id=eq.${userId}` },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "task_applications" },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "task_applications" },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "contracts" },
        () => router.refresh(),
      )
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [userId, taskIds.join(","), router]);
  return null;
}
