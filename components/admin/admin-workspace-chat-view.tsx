"use client";

import * as React from "react";
import {
  Eye, ShieldAlert, Loader2, AlertTriangle, Lock, FileText, Download,
  Users, X, RefreshCw, CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, timeAgo } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

type Message = {
  id: number;
  workspace_id: string;
  sender_id: string;
  body: string | null;
  is_flagged: boolean;
  is_ghosted: boolean;
  flag_reason: string | null;
  vault_resource_id: string | null;
  created_at: string;
  sender?: { id: string; full_name: string | null; avatar_url: string | null } | null;
  vault_resource?: {
    id: string;
    name: string;
    original_name: string | null;
    file_size: number | null;
    mime_type: string | null;
  } | null;
};

type Monitor = {
  id: string;
  admin_id: string;
  admin_name: string | null;
  last_heartbeat_at: string;
  started_at: string;
  ended_at: string | null;
};

type Props = {
  workspaceId: string;
  currentAdminId: string;
  currentAdminName: string;
  buyer: { id: string; full_name: string | null; avatar_url: string | null; is_suspended?: boolean; contact_warning_count?: number };
  employee: { id: string; full_name: string | null; avatar_url: string | null; is_suspended?: boolean; contact_warning_count?: number };
};

/**
 * Admin-only workspace chat view.
 *
 *   * Realtime: subscribes to workspace_messages INSERT events AND
 *     admin_monitoring_sessions changes for the "X admins watching"
 *     badge.
 *   * Sees EVERY message including ghosted ones (highlighted red).
 *   * Maintains an active monitoring session via /api/admin/monitoring
 *     with a 15s heartbeat. If the admin closes the tab, the session
 *     is marked ended; if they just lose connectivity, it auto-expires
 *     after 2 minutes.
 */
export function AdminWorkspaceChatView({ workspaceId, currentAdminId, currentAdminName, buyer, employee }: Props) {
  const sbRef = React.useRef<ReturnType<typeof createClient> | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [monitors, setMonitors] = React.useState<Monitor[]>([]);
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = React.useState<"connecting" | "online" | "offline">("connecting");
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  // ---- bootstrap: start monitoring session, load initial data ----
  React.useEffect(() => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;

    let cancelled = false;
    (async () => {
      try {
        // 1. Start the monitoring session
        const startRes = await fetch("/api/admin/monitoring/start", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workspaceId }),
        });
        const startData = await startRes.json();
        if (cancelled) return;
        if (!startRes.ok || !startData.ok) {
          setError(startData.error ?? "Could not start monitoring session");
          return;
        }
        setSessionId(startData.session.id);

        // 2. Load all messages
        const { data: msgs, error: mErr } = await sb
          .from("workspace_messages")
          .select("*, sender:users!workspace_messages_sender_id_fkey(id, full_name, avatar_url), vault_resource:workspace_vault!workspace_messages_vault_resource_id_fkey(id, name, original_name, file_size, mime_type)")
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: true });
        if (mErr) throw new Error(mErr.message);
        setMessages((msgs ?? []) as Message[]);

        // 3. Load active monitors
        const { data: mons, error: monErr } = await sb
          .from("admin_monitoring_sessions")
          .select("id, admin_id, admin_name, last_heartbeat_at, started_at, ended_at")
          .eq("workspace_id", workspaceId)
          .is("ended_at", null);
        if (monErr) throw new Error(monErr.message);
        setMonitors((mons ?? []) as Monitor[]);

        setConnectionStatus("online");
      } catch (e) {
        setError((e as Error).message);
        setConnectionStatus("offline");
      }
    })();

    return () => {
      cancelled = true;
      // Stop the session on unmount
      const sid = sessionIdRef.current;
      if (sid) {
        navigator.sendBeacon?.("/api/admin/monitoring/stop",
          new Blob([JSON.stringify({ sessionId: sid })], { type: "application/json" })) ||
        fetch("/api/admin/monitoring/stop", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId: sid }),
        }).catch(() => undefined);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  // Keep latest sessionId in a ref so unmount can use it
  const sessionIdRef = React.useRef<string | null>(null);
  React.useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  // ---- heartbeat every 15s ----
  React.useEffect(() => {
    if (!sessionId) return;
    const t = setInterval(() => {
      fetch("/api/admin/monitoring/heartbeat", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId }),
      }).catch(() => undefined);
    }, 15_000);
    return () => clearInterval(t);
  }, [sessionId]);

  // ---- realtime: new messages + monitor changes ----
  React.useEffect(() => {
    if (!sbRef.current) return;
    const sb = sbRef.current;

    const channel = sb
      .channel(`admin-ws-monitor-${workspaceId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "workspace_messages", filter: `workspace_id=eq.${workspaceId}` },
        async (payload) => {
          const m = payload.new as Message;
          // Hydrate sender + vault
          let sender: Message["sender"] = null;
          if (m.sender_id) {
            const { data } = await sb.from("users").select("id, full_name, avatar_url").eq("id", m.sender_id).maybeSingle();
            sender = data ?? null;
          }
          setMessages((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, { ...m, sender }]);
        })
      .on("postgres_changes",
        { event: "*", schema: "public", table: "admin_monitoring_sessions", filter: `workspace_id=eq.${workspaceId}` },
        async () => {
          // Refetch monitor list
          const { data } = await sb
            .from("admin_monitoring_sessions")
            .select("id, admin_id, admin_name, last_heartbeat_at, started_at, ended_at")
            .eq("workspace_id", workspaceId)
            .is("ended_at", null);
          setMonitors((data ?? []) as Monitor[]);
        })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setConnectionStatus("online");
        if (status === "CLOSED" || status === "CHANNEL_ERROR") setConnectionStatus("offline");
      });
    return () => { sb.removeChannel(channel); };
  }, [workspaceId]);

  // Auto-scroll
  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // Mark stale monitors (>2 min since last heartbeat) — show as "stale"
  const liveMonitors = React.useMemo(() => {
    const now = Date.now();
    return monitors.filter((m) => {
      const lastHb = new Date(m.last_heartbeat_at).getTime();
      return now - lastHb < 2 * 60_000;
    });
  }, [monitors]);

  const downloadVault = async (vaultId: string) => {
    setDownloadingId(vaultId);
    try {
      const r = await fetch("/api/workspace/vault/sign", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ vaultId }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) { alert(data?.error ?? "Failed"); return; }
      const { downloadFromSignedUrl } = await import("@/lib/safe-download");
      await downloadFromSignedUrl(data.url, data.name ?? "download");
    } catch (e) {
      alert(`Download failed: ${(e as Error).message}`);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-4 w-4 text-primary" />Workspace chat — admin view
            </CardTitle>
            <CardDescription className="text-[11px]">
              Read-only. All messages visible (including ghosted). Buyers cannot see this panel.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <ConnectionPill status={connectionStatus} />
            {liveMonitors.length > 0 && (
              <Badge variant="outline" className="gap-1 text-[10px]">
                <Eye className="h-3 w-3" />{liveMonitors.length} watching
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="mb-2 inline-flex items-center gap-1 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" />{error}
            </p>
          )}
          <div ref={scrollRef} className="space-y-2 overflow-y-auto rounded-md border bg-muted/20 p-3" style={{ minHeight: 320, maxHeight: "60vh" }}>
            {messages.length === 0 && (
              <p className="py-12 text-center text-xs text-muted-foreground">No messages yet.</p>
            )}
            {messages.map((m) => {
              const isBuyer = m.sender_id === buyer.id;
              const isEmployee = m.sender_id === employee.id;
              const peer = isBuyer ? buyer : isEmployee ? employee : null;
              return (
                <div key={m.id} className={cn("flex gap-2", isBuyer ? "" : "flex-row-reverse")}>
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarImage src={peer?.avatar_url ?? undefined} className="object-cover" />
                    <AvatarFallback>{(peer?.full_name ?? "?")[0]}</AvatarFallback>
                  </Avatar>
                  <div className={cn("max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                    m.is_ghosted
                      ? "border-2 border-rose-500 bg-rose-50 text-rose-900"
                      : isBuyer ? "bg-muted" : "bg-primary/10")}>
                    <div className="flex items-center gap-1 text-[10px] font-semibold opacity-70">
                      <span>{peer?.full_name ?? "Unknown"}{isBuyer ? " (buyer)" : " (employee)"}</span>
                      {m.is_ghosted && (
                        <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-rose-500/20 px-1 py-0.5 text-rose-700">
                          <ShieldAlert className="h-2.5 w-2.5" />GHOSTED — recipient never saw this
                        </span>
                      )}
                    </div>
                    {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                    {m.vault_resource && (
                      <div className="mt-1 flex items-center gap-2 rounded-lg border bg-background p-2 text-xs">
                        <FileText className="h-4 w-4 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{m.vault_resource.original_name ?? m.vault_resource.name}</p>
                          <p className="text-[10px] opacity-70">
                            {m.vault_resource.file_size ? `${Math.round(m.vault_resource.file_size / 1024)} KB` : "File"}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2"
                          disabled={downloadingId === m.vault_resource.id}
                          onClick={() => downloadVault(m.vault_resource!.id)}
                        >
                          {downloadingId === m.vault_resource.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                        </Button>
                      </div>
                    )}
                    <p className="mt-0.5 text-[10px] opacity-60">{timeAgo(m.created_at)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4" />Parties
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <PartyRow label="Buyer" p={buyer} />
            <PartyRow label="Employee" p={employee} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Eye className="h-4 w-4 text-primary" />Active monitors ({liveMonitors.length})
            </CardTitle>
            <CardDescription className="text-[10px]">
              Other admins viewing this chat right now. Heartbeat refreshes every 15s; sessions auto-expire after 2 min of inactivity.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {liveMonitors.length === 0 && (
              <p className="py-3 text-center text-[10px] text-muted-foreground">No active monitors.</p>
            )}
            {liveMonitors.map((m) => (
              <div key={m.id} className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5 text-xs">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {m.admin_name ?? "Admin"}
                    {m.admin_id === currentAdminId && <span className="ml-1 text-[10px] text-muted-foreground">(you)</span>}
                  </p>
                  <p className="text-[9px] text-muted-foreground">heartbeat {timeAgo(m.last_heartbeat_at)}</p>
                </div>
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Monitoring actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-xs">
            <p className="text-[10px] text-muted-foreground">
              Active session
            </p>
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={async () => {
                if (!sessionId) return;
                await fetch("/api/admin/monitoring/stop", {
                  method: "POST", headers: { "content-type": "application/json" },
                  body: JSON.stringify({ sessionId }),
                });
                // Restart
                const r = await fetch("/api/admin/monitoring/start", {
                  method: "POST", headers: { "content-type": "application/json" },
                  body: JSON.stringify({ workspaceId }),
                });
                const d = await r.json();
                if (d.ok) setSessionId(d.session.id);
              }}
            >
              <RefreshCw className="h-3 w-3" />Restart session
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ConnectionPill({ status }: { status: "connecting" | "online" | "offline" }) {
  if (status === "online") return <Badge variant="success" className="gap-1 text-[10px]"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Realtime: live</Badge>;
  if (status === "connecting") return <Badge variant="secondary" className="gap-1 text-[10px]"><Loader2 className="h-3 w-3 animate-spin" />Connecting…</Badge>;
  return <Badge variant="destructive" className="gap-1 text-[10px]"><X className="h-3 w-3" />Disconnected</Badge>;
}

function PartyRow({ label, p }: { label: string; p: { id: string; full_name: string | null; avatar_url: string | null; is_suspended?: boolean; contact_warning_count?: number } }) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/20 p-2">
      <Avatar className="h-7 w-7">
        <AvatarImage src={p.avatar_url ?? undefined} className="object-cover" />
        <AvatarFallback>{(p.full_name ?? "?")[0]}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{p.full_name}</p>
        <p className="text-[9px] text-muted-foreground">{label}</p>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        {p.is_suspended && <Badge variant="destructive" className="text-[9px]">Suspended</Badge>}
        {!!(p.contact_warning_count ?? 0) && (
          <Badge variant="outline" className="text-[9px]">{p.contact_warning_count} warnings</Badge>
        )}
      </div>
    </div>
  );
}
