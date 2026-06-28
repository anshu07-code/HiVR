"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Briefcase } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function ActiveContractsRealtime({ userId, initialCount }: { userId: string; initialCount: number }) {
  const [count, setCount] = React.useState(initialCount);

  React.useEffect(() => {
    const sb = createClient();

    async function load() {
      const { count: c } = await sb
        .from("contracts")
        .select("id", { count: "exact", head: true })
        .or(`buyer_id.eq.${userId},employee_id.eq.${userId}`)
        .eq("status", "active");
      if (c !== null) setCount(c);
    }

    // postgres_changes filter only supports simple "column=operator.value" syntax.
    // Use two subscriptions (buyer + employee) instead of a broken or() filter.
    const channel = sb.channel(`active-contracts-${userId}`);
    channel
      .on("postgres_changes", { event: "*", schema: "public", table: "contracts", filter: `buyer_id=eq.${userId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "contracts", filter: `employee_id=eq.${userId}` }, load)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [userId]);

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase text-muted-foreground">Active contracts</span>
          <Briefcase className="h-4 w-4 text-primary" />
        </div>
        <div className="mt-2 font-display text-2xl font-semibold">{count}</div>
      </CardContent>
    </Card>
  );
}
