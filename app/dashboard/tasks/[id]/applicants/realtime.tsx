"use client";

import { useTaskRealtime } from "@/app/dashboard/realtime-hooks";
export function ApplicantsRealtime({ taskId }: { taskId: string }) {
  useTaskRealtime(taskId);
  return null;
}
