"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FolderKanban, ArrowRight, CheckCircle2 } from "lucide-react";
import { formatPaise, timeAgo } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { encodeWorkspaceSlug } from "@/lib/workspace-slug";

type WorkspaceRow = {
  id: string;
  status: string;
  escrow_amount_paise: number;
  escrow_funded: boolean;
  last_message_at: string | null;
  updated_at: string;
  completed_at: string | null;
  contract_id: string;
  buyer_id: string;
  employee_id: string;
  created_at: string;
  title: string;
  buyer_name: string | null;
  employee_name: string | null;
};

const ACTIVE_STATUSES = ["awaiting_funding", "funded", "delivered", "in_review", "frozen"];
const PAST_STATUSES = ["completed", "cancelled"];

function isActive(s: string) { return ACTIVE_STATUSES.includes(s); }
function isPast(s: string)   { return PAST_STATUSES.includes(s); }

export function WorkspacesListClient({ initialList, currentUserId }: { initialList: WorkspaceRow[]; currentUserId: string }) {
  const [list, setList] = React.useState<WorkspaceRow[]>(initialList);

  React.useEffect(() => {
    const sb = createClient();

    async function refresh() {
      const r = await fetch("/api/workspaces/list");
      if (r.ok) {
        const d = await r.json();
        if (d.ok) setList(d.list ?? []);
      }
    }

    const channel = sb
      .channel("workspaces-list-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "workspaces", filter: `buyer_id=eq.${currentUserId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "workspaces", filter: `employee_id=eq.${currentUserId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "contracts", filter: `buyer_id=eq.${currentUserId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "contracts", filter: `employee_id=eq.${currentUserId}` }, refresh)
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [currentUserId]);

  const active = list
    .filter(w => isActive(w.status))
    .sort((a, b) => {
      const aTime = a.last_message_at || a.updated_at || a.created_at;
      const bTime = b.last_message_at || b.updated_at || b.created_at;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });
  const past   = list
    .filter(w => isPast(w.status))
    .sort((a, b) => {
      const aTime = a.completed_at || a.updated_at || a.created_at;
      const bTime = b.completed_at || b.updated_at || b.created_at;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });

  function renderList(items: WorkspaceRow[]) {
    if (items.length === 0) {
      return (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No workspaces here.
          </CardContent>
        </Card>
      );
    }
    return (
      <div className="space-y-3">
        {items.map((w) => {
          const role = w.buyer_id === currentUserId ? "Buyer" : "Employee";
          return (
            <Card key={w.id} className="transition-colors hover:border-primary/40">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                    <span className="text-base font-semibold">{w.title[0]?.toUpperCase()}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-sm font-semibold">{w.title}</p>
                      <Badge variant="outline" className="text-[10px]">{w.status}</Badge>
                      <Badge variant="secondary" className="text-[10px]">You are: {role}</Badge>
                      {w.escrow_funded && (
                        <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-sky-700 text-[10px]">
                          {formatPaise(w.escrow_amount_paise ?? 0)} in escrow
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span>Buyer: <strong className="text-foreground">{w.buyer_name ?? "—"}</strong></span>
                      <span>·</span>
                      <span>Employee: <strong className="text-foreground">{w.employee_name ?? "—"}</strong></span>
                      {w.completed_at && (
                        <>
                          <span>·</span>
                          <span>completed {timeAgo(w.completed_at)}</span>
                        </>
                      )}
                      {!w.completed_at && w.last_message_at && (
                        <>
                          <span>·</span>
                          <span>last activity {timeAgo(w.last_message_at)}</span>
                        </>
                      )}
                      {!w.completed_at && !w.last_message_at && w.created_at && (
                        <>
                          <span>·</span>
                          <span>created {timeAgo(w.created_at)}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <Button asChild size="sm" variant="ghost" className="shrink-0">
                    <Link href={`/dashboard/workspaces/${encodeWorkspaceSlug(w.title, w.id)}`}>
                      Open <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  }

  return (
    <div className="container max-w-5xl space-y-4 py-8">
      <div>
        <div className="flex items-center gap-2">
          <FolderKanban className="h-6 w-6 text-primary" />
          <h1 className="font-display text-3xl font-semibold tracking-tight" data-tour="workspaces-header">Workspaces</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {list.length} workspace{list.length === 1 ? "" : "s"} you participate in
          {" — "}
          <strong className="text-foreground">{active.length}</strong> active,
          {" "}
          <strong className="text-foreground">{past.length}</strong> past.
        </p>
      </div>

      <Tabs defaultValue="active" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="active" className="gap-1.5">
            <FolderKanban className="h-3.5 w-3.5" />
            Active ({active.length})
          </TabsTrigger>
          <TabsTrigger value="past" className="gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Past ({past.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="active" className="mt-4">{renderList(active)}</TabsContent>
        <TabsContent value="past"   className="mt-4">{renderList(past)}</TabsContent>
      </Tabs>
    </div>
  );
}
