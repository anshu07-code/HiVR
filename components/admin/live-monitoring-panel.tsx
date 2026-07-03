"use client";

import * as React from "react";
import Link from "next/link";
import { Eye, ExternalLink, Loader2, X, MessageSquare, Users, Shield, Briefcase } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

type Party = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
};

type ChatEntry = {
  id: string;
  type: "workspace" | "contract";
  buyer: Party | null;
  employee: Party | null;
  status: string;
  last_message_at: string | null;
  category_name: string | null;
  agreed_price: number | null;
  admin_count: number;
  admins: { id: string; admin_name: string | null; last_heartbeat_at: string }[];
};

export function LiveMonitoringPanel({ monitorPath }: { monitorPath?: string }) {
  const sbRef = React.useRef<ReturnType<typeof createClient> | null>(null);
  const [chats, setChats] = React.useState<ChatEntry[]>([]);
  const [tick, setTick] = React.useState(0);
  const [connection, setConnection] = React.useState<"online" | "offline" | "connecting">("connecting");

  React.useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const load = React.useCallback(async () => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;

    const [wsRes, ctRes, sesRes] = await Promise.all([
      sb
        .from("workspaces")
        .select(`id, status, last_message_at,
          buyer:users!workspaces_buyer_id_fkey(id, full_name, avatar_url),
          employee:users!workspaces_employee_id_fkey(id, full_name, avatar_url)`)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(100),
      sb
        .from("contracts")
        .select(`id, status, last_message_at, agreed_price,
          buyer:users!contracts_buyer_id_fkey(id, full_name, avatar_url),
          employee:users!contracts_employee_id_fkey(id, full_name, avatar_url),
          category:skill_categories(name)`)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(100),
      sb
        .from("admin_monitoring_sessions")
        .select("id, admin_name, workspace_id, contract_id, last_heartbeat_at")
        .is("ended_at", null),
    ]);

    const workspaces = (wsRes.data ?? []) as any[];
    const contracts = (ctRes.data ?? []) as any[];
    const sessions = (sesRes.data ?? []) as any[];

    const wsMap = new Map<string, ChatEntry>();
    const ctMap = new Map<string, ChatEntry>();

    // Collect IDs referenced by sessions that need fetching
    const wsIdsFromSessions = new Set<string>();
    const ctIdsFromSessions = new Set<string>();

    for (const s of sessions) {
      if (s.workspace_id) wsIdsFromSessions.add(s.workspace_id);
      if (s.contract_id) ctIdsFromSessions.add(s.contract_id);
    }

    // Fetch workspaces/contracts referenced by sessions but not already loaded
    const missingWsIds = [...wsIdsFromSessions].filter((id) => !workspaces.some((w) => w.id === id));
    const missingCtIds = [...ctIdsFromSessions].filter((id) => !contracts.some((c) => c.id === id));

    const [missingWsRes, missingCtRes] = await Promise.all([
      missingWsIds.length > 0
        ? sb.from("workspaces")
            .select(`id, status, last_message_at,
              buyer:users!workspaces_buyer_id_fkey(id, full_name, avatar_url),
              employee:users!workspaces_employee_id_fkey(id, full_name, avatar_url)`)
            .in("id", missingWsIds) as any
        : Promise.resolve({ data: [] }),
      missingCtIds.length > 0
        ? sb.from("contracts")
            .select(`id, status, last_message_at, agreed_price,
              buyer:users!contracts_buyer_id_fkey(id, full_name, avatar_url),
              employee:users!contracts_employee_id_fkey(id, full_name, avatar_url),
              category:skill_categories(name)`)
            .in("id", missingCtIds) as any
        : Promise.resolve({ data: [] }),
    ]);

    const allWorkspaces = [...workspaces, ...((missingWsRes as any)?.data ?? [])];
    const allContracts = [...contracts, ...((missingCtRes as any)?.data ?? [])];

    for (const w of allWorkspaces) {
      wsMap.set(w.id, {
        id: w.id,
        type: "workspace",
        buyer: w.buyer as Party | null,
        employee: w.employee as Party | null,
        status: w.status,
        last_message_at: w.last_message_at,
        category_name: null,
        agreed_price: null,
        admin_count: 0,
        admins: [],
      });
    }

    for (const c of allContracts) {
      ctMap.set(c.id, {
        id: c.id,
        type: "contract",
        buyer: c.buyer as Party | null,
        employee: c.employee as Party | null,
        status: c.status,
        last_message_at: c.last_message_at,
        category_name: (c.category as any)?.name ?? null,
        agreed_price: c.agreed_price,
        admin_count: 0,
        admins: [],
      });
    }

    for (const s of sessions) {
      const isStale = Date.now() - new Date(s.last_heartbeat_at).getTime() > 2 * 60_000;
      const admin = { id: s.id, admin_name: s.admin_name, last_heartbeat_at: s.last_heartbeat_at };

      if (s.workspace_id) {
        const existing = wsMap.get(s.workspace_id);
        if (existing) {
          existing.admin_count++;
          if (!isStale) existing.admins.push(admin);
        }
      }
      if (s.contract_id) {
        const existing = ctMap.get(s.contract_id);
        if (existing) {
          existing.admin_count++;
          if (!isStale) existing.admins.push(admin);
        }
      }
    }

    const all: ChatEntry[] = [...wsMap.values(), ...ctMap.values()];
    all.sort((a, b) => {
      const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return bTime - aTime;
    });
    setChats(all);
  }, []);

  React.useEffect(() => {
    load();
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const channel = sb
      .channel("live-monitoring-all")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "admin_monitoring_sessions" },
        () => load())
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "workspaces" },
        (payload) => {
          if (payload.new && (payload.new as any).last_message_at) load();
        })
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "contracts" },
        (payload) => {
          if (payload.new && (payload.new as any).last_message_at) load();
        })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setConnection("online");
        if (status === "CLOSED" || status === "CHANNEL_ERROR") setConnection("offline");
      });
    return () => { sb.removeChannel(channel); };
  }, [load]);

  void tick;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Eye className="h-4 w-4 text-primary" />Live monitoring feed
          </CardTitle>
          <CardDescription className="text-[11px]">
            All workspace and contract chats with recent activity. Badges show active admin monitors. Updates in real time.
          </CardDescription>
        </div>
        <Badge variant={connection === "online" ? "success" : connection === "offline" ? "destructive" : "secondary"} className="gap-1 text-[10px]">
          {connection === "online" && <><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Live</>}
          {connection === "connecting" && <><Loader2 className="h-3 w-3 animate-spin" />Connecting…</>}
          {connection === "offline" && <><X className="h-3 w-3" />Reconnecting…</>}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {chats.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            No chats with recent activity.
          </p>
        ) : (
          <div className="max-h-[70vh] space-y-1.5 overflow-y-auto" style={{ scrollbarGutter: "stable", scrollbarWidth: "none" }}>
            {chats.map((chat) => {
              const peerA = chat.buyer;
              const peerB = chat.employee;
              const base = monitorPath ?? "/admin/monitor";
              const link = `${base}/${chat.id}`;
              return (
                <div
                  key={`${chat.type}-${chat.id}`}
                  className={`group flex items-center gap-2 rounded-md border p-2 transition-colors ${
                    chat.admin_count > 0 ? "border-emerald-200 bg-emerald-50/40" : "border-muted bg-background"
                  }`}
                >
                  <div className="flex -space-x-1.5">
                    <Avatar className="h-7 w-7 border-2 border-background">
                      <AvatarImage src={peerA?.avatar_url ?? undefined} className="object-cover" />
                      <AvatarFallback>{(peerA?.full_name ?? "?")[0]}</AvatarFallback>
                    </Avatar>
                    <Avatar className="h-7 w-7 border-2 border-background">
                      <AvatarImage src={peerB?.avatar_url ?? undefined} className="object-cover" />
                      <AvatarFallback>{(peerB?.full_name ?? "?")[0]}</AvatarFallback>
                    </Avatar>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">
                      {peerA?.full_name ?? "?"} ↔ {peerB?.full_name ?? "?"}
                      <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                        {chat.type === "workspace" ? <><Briefcase className="mr-0.5 inline h-2.5 w-2.5" />workspace</> : <><MessageSquare className="mr-0.5 inline h-2.5 w-2.5" />contract</>}
                        {chat.category_name && <> · {chat.category_name}</>}
                      </span>
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {chat.last_message_at ? <>{timeAgo(chat.last_message_at)}</> : "—"}
                      <span className="ml-1 text-[9px]">· {chat.status}</span>
                      {chat.admin_count > 0 && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-primary/10 px-1 py-0.5 text-[9px] font-medium text-primary">
                          <Shield className="h-2.5 w-2.5" />
                          {chat.admin_count} watching
                        </span>
                      )}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline" className="h-7 text-[10px]">
                    <Link href={link}>
                      <ExternalLink className="h-3 w-3" />Open
                    </Link>
                  </Button>
                </div>
              );
            })}
          </div>
        )}
        <p className="pt-1 text-[10px] text-muted-foreground">
          Showing {chats.length} chat{chats.length !== 1 ? "s" : ""} · {chats.filter(c => c.admin_count > 0).length} actively monitored
        </p>
      </CardContent>
    </Card>
  );
}
