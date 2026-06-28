"use client";

import * as React from "react";
import Link from "next/link";
import { Eye, ExternalLink, Loader2, X, MessageSquare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

type Session = {
  id: string;
  admin_id: string;
  admin_name: string | null;
  workspace_id: string | null;
  contract_id: string | null;
  started_at: string;
  last_heartbeat_at: string;
  ended_at: string | null;
  workspace?: {
    id: string;
    status: string;
    buyer?: { id: string; full_name: string | null; avatar_url: string | null } | null;
    employee?: { id: string; full_name: string | null; avatar_url: string | null } | null;
    contract?: { id: string; category?: { name: string; tier: string } | null; agreed_price: number } | null;
  } | null;
  contract?: {
    id: string;
    status: string;
    buyer?: { id: string; full_name: string | null; avatar_url: string | null } | null;
    employee?: { id: string; full_name: string | null; avatar_url: string | null } | null;
    category?: { name: string; tier: string } | null;
    agreed_price: number;
  } | null;
};

/**
 * Real-time list of every chat currently being monitored by an admin.
 *
 *   * Subscribes to admin_monitoring_sessions INSERT/UPDATE/DELETE so
 *     the list updates instantly as admins open or close chats.
 *   * Stale sessions (>2 min since heartbeat) are dimmed but kept
 *     visible (we don't drop them server-side without manual cleanup).
 *   * Clicking a row jumps to /admin/monitor/[id] which auto-detects
 *     whether it's a workspace or contract.
 */
export function LiveMonitoringPanel() {
  const sbRef = React.useRef<ReturnType<typeof createClient> | null>(null);
  const [sessions, setSessions] = React.useState<Session[]>([]);
  const [tick, setTick] = React.useState(0);
  const [connection, setConnection] = React.useState<"online" | "offline" | "connecting">("connecting");

  // Tick every 30s so "heartbeat Xs ago" stays fresh
  React.useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const load = React.useCallback(async () => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const { data, error } = await sb
      .from("admin_monitoring_sessions")
      .select(`
        id, admin_id, admin_name, workspace_id, contract_id,
        started_at, last_heartbeat_at, ended_at,
        workspace:workspaces(id, status,
          buyer:users!workspaces_buyer_id_fkey(id, full_name, avatar_url),
          employee:users!workspaces_employee_id_fkey(id, full_name, avatar_url),
          contract:contracts(id, agreed_price, category:skill_categories(name, tier))),
        contract:contracts(id, status, agreed_price,
          buyer:users!contracts_buyer_id_fkey(id, full_name, avatar_url),
          employee:users!contracts_employee_id_fkey(id, full_name, avatar_url),
          category:skill_categories(name, tier))
      `)
      .is("ended_at", null)
      .order("last_heartbeat_at", { ascending: false })
      .limit(50);
    if (!error) setSessions((data ?? []) as Session[]);
  }, []);

  React.useEffect(() => {
    load();
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const channel = sb
      .channel("admin-monitoring-live")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "admin_monitoring_sessions" },
        () => load())
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setConnection("online");
        if (status === "CLOSED" || status === "CHANNEL_ERROR") setConnection("offline");
      });
    return () => { sb.removeChannel(channel); };
  }, [load]);

  // Force re-render on tick
  void tick;

  const live = sessions;
  const stale = React.useMemo(() => {
    const now = Date.now();
    return live.filter((s) => now - new Date(s.last_heartbeat_at).getTime() > 2 * 60_000);
  }, [live]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Eye className="h-4 w-4 text-primary" />Live monitoring sessions
          </CardTitle>
          <CardDescription className="text-[11px]">
            Every chat currently being viewed by an admin. Updates in real time.
          </CardDescription>
        </div>
        <Badge variant={connection === "online" ? "success" : connection === "offline" ? "destructive" : "secondary"} className="gap-1 text-[10px]">
          {connection === "online" && <><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Live</>}
          {connection === "connecting" && <><Loader2 className="h-3 w-3 animate-spin" />Connecting…</>}
          {connection === "offline" && <><X className="h-3 w-3" />Reconnecting…</>}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {live.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            No active monitoring sessions. Open a chat from the lists above to start monitoring.
          </p>
        ) : (
          live.map((s) => {
            const target = s.workspace_id ? s.workspace : s.contract;
            const peerA = target?.buyer;
            const peerB = target?.employee;
            const isStale = stale.includes(s);
            const link = s.workspace_id
              ? `/admin/monitor/${s.workspace_id}`
              : s.contract_id
                ? `/admin/monitor/${s.contract_id}`
                : "#";
            return (
              <div
                key={s.id}
                className={`group flex items-center gap-2 rounded-md border p-2 transition-colors ${
                  isStale ? "border-amber-300 bg-amber-50/50" : "border-emerald-200 bg-emerald-50/40"
                }`}
              >
                <div className="flex -space-x-1.5">
                  <Avatar className="h-7 w-7 border-2 border-background">
                    <AvatarImage src={peerA?.avatar_url ?? undefined} />
                    <AvatarFallback>{(peerA?.full_name ?? "?")[0]}</AvatarFallback>
                  </Avatar>
                  <Avatar className="h-7 w-7 border-2 border-background">
                    <AvatarImage src={peerB?.avatar_url ?? undefined} />
                    <AvatarFallback>{(peerB?.full_name ?? "?")[0]}</AvatarFallback>
                  </Avatar>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold">
                    {peerA?.full_name ?? "?"} ↔ {peerB?.full_name ?? "?"}
                    <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                      {s.workspace_id ? "(workspace)" : "(contract)"} · {(target as any)?.category?.name ?? "—"}
                    </span>
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    <span className="font-semibold text-foreground">{s.admin_name ?? "Admin"}</span> watching · heartbeat {timeAgo(s.last_heartbeat_at)}
                    {isStale && <span className="ml-1 text-amber-700">· STALE</span>}
                  </p>
                </div>
                <Button asChild size="sm" variant="outline" className="h-7 text-[10px]">
                  <Link href={link}>
                    <ExternalLink className="h-3 w-3" />Open
                  </Link>
                </Button>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
