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
      .on("postgres_changes", { event: "*", schema: "public", table: "contracts", filter: `or(buyer_id.eq.${userId},employee_id.eq.${userId})` }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "workspaces", filter: `or(buyer_id.eq.${userId},employee_id.eq.${userId})` }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "reviews", filter: `or(reviewer_id.eq.${userId},reviewee_id.eq.${userId})` }, () => router.refresh())
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [userId, router]);

  return <>{children}</>;
}
