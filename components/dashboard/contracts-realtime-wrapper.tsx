"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ContractsRealtimeWrapper({ userId, children }: { userId: string; children: React.ReactNode }) {
  const router = useRouter();

  React.useEffect(() => {
    const sb = createClient();
    const channel = sb.channel("contracts-list-sync");

    channel.on("postgres_changes", { event: "*", schema: "public", table: "contracts", filter: `buyer_id=eq.${userId}` }, () => router.refresh());
    channel.on("postgres_changes", { event: "*", schema: "public", table: "contracts", filter: `employee_id=eq.${userId}` }, () => router.refresh());
    channel.on("postgres_changes", { event: "*", schema: "public", table: "workspaces" }, () => router.refresh());
    channel.subscribe();

    return () => { sb.removeChannel(channel); };
  }, [router, userId]);

  return <>{children}</>;
}
