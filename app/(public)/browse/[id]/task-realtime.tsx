"use client";

import { useTaskRealtime } from "./use-task-realtime";

/**
 * Server-rendered wrapper that just mounts the realtime subscription.
 * Putting it in a client component lets us import the client-side Supabase
 * SDK without dragging it into the server bundle.
 */
export function TaskRealtime({ taskId }: { taskId: string }) {
  useTaskRealtime(taskId);
  return null;
}
