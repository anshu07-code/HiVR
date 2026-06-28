"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Subscribe to realtime changes on a single task's applications + posts. */
export function useTaskRealtime(taskId: string) {
  const router = useRouter();
  React.useEffect(() => {
    const sb = createClient();
    const channel = sb
      .channel(`task-${taskId}-rt`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "task_applications", filter: `task_id=eq.${taskId}` },
        () => router.refresh())
      .on("postgres_changes",
        { event: "*", schema: "public", table: "task_posts", filter: `id=eq.${taskId}` },
        () => router.refresh())
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [taskId, router]);
}

/** Subscribe to realtime changes for a single contract (chat, milestones, resources). */
export function useContractRealtime(contractId: string) {
  const router = useRouter();
  React.useEffect(() => {
    const sb = createClient();
    const channel = sb
      .channel(`contract-${contractId}-rt`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `contract_id=eq.${contractId}` },
        () => router.refresh())
      .on("postgres_changes",
        { event: "*", schema: "public", table: "milestones", filter: `contract_id=eq.${contractId}` },
        () => router.refresh())
      .on("postgres_changes",
        { event: "*", schema: "public", table: "contract_resources", filter: `contract_id=eq.${contractId}` },
        () => router.refresh())
      .on("postgres_changes",
        { event: "*", schema: "public", table: "contracts", filter: `id=eq.${contractId}` },
        () => router.refresh())
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [contractId, router]);
}
