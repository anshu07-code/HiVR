"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function RealtimeDashboardRefresh({
  userId, children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  React.useEffect(() => {
    const sb = createClient();
    const ch = sb
      .channel("dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => router.refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "wallet_transactions", filter: `user_id=eq.${userId}` }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "user_wallets", filter: `user_id=eq.${userId}` }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "employee_profiles", filter: `user_id=eq.${userId}` }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "contracts" }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "workspaces", filter: `buyer_id=eq.${userId}` }, () => router.refresh())
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [userId, router]);

  return <>{children}</>;
}
