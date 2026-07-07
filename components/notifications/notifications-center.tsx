"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell, Check, CheckCheck, RefreshCw, Loader2, Filter, X, Inbox,
  Wallet, Send, MessageSquare, CheckCircle2, AlertCircle, Clock,
  Sparkles, Star, Crown, ShieldAlert, Gift, XCircle, Building2, Users,
  ArrowUpRight, Calendar, FileText,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn, timeAgo } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
// Import from the client-safe `types` file, not `helpers` (which
// transitively imports next/headers via the Supabase server client).
import { KIND_ICON, KIND_TONE, type NotificationKind } from "@/lib/notifications/types";

type Notif = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

const ICON_MAP: Record<string, any> = {
  Wallet, Send, MessageSquare, CheckCircle2, AlertCircle, Clock,
  Sparkles, Star, Crown, ShieldAlert, Gift, XCircle, Building2, Users,
  ArrowUpRight, Calendar, FileText, Bell,
};

type Filter = "all" | "unread" | "workspace" | "payments" | "messages" | "kyc";

const FILTER_KIND_MAP: Record<Filter, (n: Notif) => boolean> = {
  all: () => true,
  unread: (n) => !n.read_at,
  workspace: (n) => n.type.startsWith("workspace_") || n.type.startsWith("vault_"),
  payments: (n) => n.type.startsWith("payment_") || n.type === "withdraw_completed" || n.type === "incentive_earned" || n.type === "tip_received",
  messages: (n) => n.type === "new_message" || n.type === "ghost_blocked",
  kyc: (n) => n.type === "kyc_verified" || n.type === "kyc_rejected" || n.type === "bank_verified",
};

export function NotificationsCenter({ userId, initial }: { userId: string; initial: Notif[] }) {
  const sbRef = React.useRef<ReturnType<typeof createClient> | null>(null);
  const router = useRouter();
  const [notifs, setNotifs] = React.useState<Notif[]>(initial);
  const [filter, setFilter] = React.useState<Filter>("all");
  const [search, setSearch] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  // Realtime — no row filter (Supabase Realtime applies the filter
  // to the empty NEW payload on DELETE, which would silently drop
  // those events). Filter client-side instead.
  React.useEffect(() => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const ch = sb
      .channel(`notif-center-${userId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        (payload: any) => {
          const ws = payload.new?.user_id ?? payload.old?.user_id;
          if (ws === userId) load();
        })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function load() {
    setLoading(true);
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const { data } = await sb
      .from("notifications")
      .select("id, type, title, body, link, read_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);
    setNotifs((data ?? []) as Notif[]);
    setLoading(false);
  }

  async function markRead(id: string) {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    await (sb.from("notifications") as any).update({ read_at: new Date().toISOString() }).eq("id", id);
    setNotifs((prev) => prev.map((n) => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
  }

  async function markAllRead() {
    const now = new Date().toISOString();
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    await (sb.from("notifications") as any).update({ read_at: now }).is("read_at", null).eq("user_id", userId);
    setNotifs((prev) => prev.map((n) => n.read_at ? n : { ...n, read_at: now }));
  }

  async function open(n: Notif) {
    if (!n.read_at) await markRead(n.id);

    const target = n.link;
    if (!target) return;

    try {
      const url = new URL(target, window.location.origin);
      const settleAppId = url.searchParams.get("settleAppId");

      // — Settlement: resolve to current state —
      if (settleAppId) {
        const sb = createClient();
        const { data: rounds } = await sb
          .from("settlement_rounds")
          .select("id, round_number, offered_by, amount_paise, time_minutes, message, status, parent_round_id, created_at")
          .eq("application_id", settleAppId)
          .order("round_number", { ascending: false })
          .limit(3);

        const allRounds = (rounds ?? []) as any[];
        const lastRound = allRounds[0];

        if (lastRound?.status === "accepted") {
          const { data: app } = await sb
            .from("task_applications")
            .select("task_id")
            .eq("id", settleAppId)
            .maybeSingle();
          if (app) {
            const { data: contract } = await sb
              .from("contracts")
              .select("id")
              .eq("task_post_id", (app as any).task_id)
              .eq("employee_id", userId)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (contract) {
              router.push(`/dashboard/contracts/${(contract as any).id}`);
              return;
            }
          }
        }

        if (lastRound?.status === "declined") {
          router.push(`/dashboard/applications?settleAppId=${settleAppId}&declined=1`);
          return;
        }
      }

      // — hire_offer / hiring_stage: check for existing contracts —
      if (n.type === "hire_offer" || n.type === "hiring_stage") {
        const sb = createClient();
        const { data: contracts } = await sb
          .from("contracts")
          .select("id, created_at")
          .eq("employee_id", userId)
          .in("status", ["active", "pending_acceptance", "completed", "delivered", "disputed"])
          .order("created_at", { ascending: false })
          .limit(1);
        if (contracts && contracts.length > 0) {
          const latest = (contracts as any[])[0];
          if (new Date(latest.created_at) > new Date(n.created_at)) {
            router.push(`/dashboard/contracts/${latest.id}`);
            return;
          }
        }
      }
    } catch {
      // fall through to default navigation
    }

    router.push(target);
  }

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return notifs.filter((n) => {
      if (!FILTER_KIND_MAP[filter](n)) return false;
      if (q) {
        if (!n.title.toLowerCase().includes(q) && !(n.body ?? "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [notifs, filter, search]);

  const unread = notifs.filter((n) => !n.read_at).length;
  const stats = React.useMemo(() => {
    return {
      total: notifs.length,
      unread,
      today: notifs.filter((n) => {
        const d = new Date(n.created_at);
        const t = new Date();
        return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
      }).length,
    };
  }, [notifs, unread]);

  return (
    <div className="container max-w-4xl space-y-6 py-8">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight" data-tour="notifications-header">Notifications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every important event — funded escrows, submitted deliveries, file reviews, payments,
          and messages — lands here in real time.
        </p>
      </div>

      {/* Stat row */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Unread</p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums">{stats.unread}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Today</p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums">{stats.today}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">All time</p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums">{stats.total}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="space-y-3 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Inbox className="h-4 w-4" />Inbox
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Refresh
              </Button>
              {unread > 0 && (
                <Button size="sm" variant="outline" onClick={markAllRead}>
                  <CheckCheck className="h-3.5 w-3.5" />Mark all read
                </Button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {(["all", "unread", "workspace", "payments", "messages", "kyc"] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-md border px-2 py-0.5 text-[10px] font-medium capitalize",
                  filter === f ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                )}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="relative">
            <Filter className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notifications…"
              className="h-7 pl-7 text-[11px]"
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="rounded-md border border-dashed bg-muted/20 py-12 text-center">
              <Bell className="mx-auto h-6 w-6 text-muted-foreground/50" />
              <p className="mt-2 text-sm font-medium">
                {filter === "unread" ? "Nothing unread — you're all caught up!" : "No notifications here"}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                New events show up here in real time.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {filtered.map((n) => {
                const iconName = KIND_ICON[n.type as NotificationKind] ?? "Bell";
                const Icon = ICON_MAP[iconName] ?? Bell;
                const tone = KIND_TONE[n.type as NotificationKind] ?? "text-muted-foreground";
                const isUnread = !n.read_at;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => open(n)}
                    className={cn(
                      "group flex w-full items-start gap-3 rounded-md border bg-background p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent",
                      isUnread && "border-primary/30 bg-primary/5"
                    )}
                  >
                    <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted/30", tone)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">{n.title}</p>
                        {isUnread && (
                          <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-label="unread" />
                        )}
                      </div>
                      {n.body && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                      )}
                      <p className="mt-1 text-[10px] text-muted-foreground" title={new Date(n.created_at).toLocaleString()}>
                        {timeAgo(n.created_at)} · {n.type.replace(/_/g, " ")}
                      </p>
                    </div>
                    {n.link && (
                      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
