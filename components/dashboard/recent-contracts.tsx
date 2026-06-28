"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { encodeWorkspaceSlug } from "@/lib/workspace-slug";
import { ChevronDown, ChevronUp, FolderKanban } from "lucide-react";

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" }> = {
  active: { label: "Active", variant: "default" },
  completed: { label: "Completed", variant: "success" },
  cancelled: { label: "Cancelled", variant: "destructive" },
  pending: { label: "Pending", variant: "warning" },
  in_contract: { label: "In contract", variant: "success" },
};

const DEFAULT_SHOW = 5;

export function RecentContracts({ initial, role, currentUserId }: { initial: any[]; role: "employee" | "buyer" | "both"; currentUserId?: string }) {
  const [contracts, setContracts] = React.useState(initial);
  const [expanded, setExpanded] = React.useState(false);
  const heading = role === "buyer" ? "Recent contracts (you hired)" : role === "employee" ? "Recent contracts (you worked)" : "Recent contracts";

  React.useEffect(() => {
    const sb = createClient();

    async function refresh() {
      const r = await fetch("/api/dashboard/contracts-summary");
      if (r.ok) {
        const d = await r.json();
        setContracts(d.contracts ?? []);
      }
    }

    const channel = sb.channel(`recent-contracts-${currentUserId}`);
    if (role === "employee") {
      channel.on("postgres_changes", { event: "*", schema: "public", table: "contracts", filter: `employee_id=eq.${currentUserId}` }, refresh);
    } else if (role === "buyer") {
      channel.on("postgres_changes", { event: "*", schema: "public", table: "contracts", filter: `buyer_id=eq.${currentUserId}` }, refresh);
    } else {
      channel
        .on("postgres_changes", { event: "*", schema: "public", table: "contracts", filter: `buyer_id=eq.${currentUserId}` }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "contracts", filter: `employee_id=eq.${currentUserId}` }, refresh);
    }
    channel.subscribe();

    return () => { sb.removeChannel(channel); };
  }, [currentUserId, role]);

  const displayList = expanded ? contracts : contracts.slice(0, DEFAULT_SHOW);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <FolderKanban className="h-4 w-4 text-primary" />
          {heading}
        </CardTitle>
        {contracts.length > DEFAULT_SHOW && (
          <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)} className="text-xs">
            {expanded ? (
              <>Show less <ChevronUp className="h-3 w-3" /></>
            ) : (
              <>Show all ({contracts.length}) <ChevronDown className="h-3 w-3" /></>
            )}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {contracts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No contracts yet.</p>
        ) : (
          <ul className="divide-y">
            {displayList.map((c: any) => {
              const side = c.buyer_id === currentUserId ? "employee" : "buyer";
              const counterpartyName = side === "employee" ? c.employee_name : c.buyer_name;
              const badge = STATUS_BADGE[c.status] ?? { label: c.status?.replace(/_/g, " ") ?? "Unknown", variant: "secondary" as const };
              return (
                <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {c.task_title ?? "Untitled task"}
                      </span>
                      <Badge variant={badge.variant} className="shrink-0 text-[10px]">
                        {badge.label}
                      </Badge>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {counterpartyName && (
                        <>with <span className="font-medium text-foreground">{counterpartyName}</span> ({side})</>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-semibold">{formatINR(Math.round((c.agreed_price ?? 0) / 100))}</div>
                    <Link href={c.workspace_id ? `/dashboard/workspaces/${encodeWorkspaceSlug(c.task_title, c.workspace_id)}` : `/dashboard/contracts/${c.id}`} className="text-[10px] text-primary hover:underline">
                      {c.workspace_id ? "Open workspace →" : "View contract →"}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
