"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscribe to realtime changes on task_applications + task_likes +
 * task_queries for a specific task. When any of them change, we call
 * router.refresh() to re-fetch the server data. This is the lightweight
 * realtime: server still renders, we just invalidate the cache.
 *
 * Why not full optimistic updates? Because the joined data is complex
 * (employee profile, skills, verifications) and best computed server-side.
 * Server re-render is fast enough that it doesn't feel laggy.
 */
export function useTaskRealtime(taskId: string) {
  const router = useRouter();
  React.useEffect(() => {
    const sb = createClient();
    const channel = sb
      .channel(`task-${taskId}-rt`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_applications", filter: `task_id=eq.${taskId}` },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_likes", filter: `task_id=eq.${taskId}` },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_queries", filter: `task_id=eq.${taskId}` },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_posts", filter: `id=eq.${taskId}` },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [taskId, router]);
}
