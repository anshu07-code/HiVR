"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bell, Send, Loader2, RefreshCw, CheckCircle2, AlertCircle,
  Activity, ChevronRight, ArrowUpRight,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn, timeAgo } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

/**
 * Dev-only debug page for the notification bell. Lets you:
 *   1. See what's currently in your notifications table
 *   2. Insert a test notification to verify the realtime path
 *   3. Check the publication membership
 *   4. See if realtime is connected
 */
export default function NotificationDebugPage() {
  const [userId, setUserId] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<any[]>([]);
  const [count, setCount] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [feedback, setFeedback] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [rtStatus, setRtStatus] = React.useState<string>("disconnected");
  const sbRef = React.useRef<ReturnType<typeof createClient> | null>(null);

  const [title, setTitle] = React.useState("Test notification");
  const [body, setBody] = React.useState("If you can read this, the bell is working.");

  async function load() {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    setLoading(true);
    const { data: { user } } = await sb.auth.getUser();
    setUserId(user?.id ?? null);
    if (!user) {
      setLoading(false);
      return;
    }
    const [list, countRpc] = await Promise.all([
      sb.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
      (sb.rpc as any)("unread_notification_count", { p_user_id: user.id }),
    ]);
    setItems((list as any)?.data ?? []);
    setCount(typeof countRpc === "number" ? countRpc : 0);
    setLoading(false);
  }

  React.useEffect(() => { load(); }, []);

  // Realtime probe
  React.useEffect(() => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const ch = sb
      .channel("debug-bell")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" },
        (payload: any) => {
          setRtStatus(`received: ${payload.eventType} on ${payload.table}`);
          load();
        })
      .subscribe((status: any) => setRtStatus(status));
    return () => { sb.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendTest() {
    if (!sbRef.current) sbRef.current = createClient();
    setSending(true);
    setError(null);
    setFeedback(null);
    try {
      const r = await fetch("/api/notifications/test?insert=1");
      const d = await r.json();
      if (!r.ok) {
        setError(d?.error ?? "Failed");
        return;
      }
      setFeedback(d?.insert?.ok
        ? "Inserted via admin RPC. If the bell doesn't update in ~1s, realtime is broken."
        : "Insert failed: " + (d?.insert?.error ?? "unknown"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="container max-w-3xl space-y-4 py-8">
      <div className="flex items-center gap-2">
        <Bell className="h-5 w-5 text-primary" />
        <h1 className="font-display text-2xl font-semibold tracking-tight">Notification debug</h1>
        <Badge variant="outline" className="text-[10px]">dev-only</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Use this page to verify the notification bell is wired up. Insert a test notification
        and watch the realtime indicator. The bell on the navbar (and below) should update
        in &lt;1 second.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Realtime status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm">
            <span className={cn(
              "h-2.5 w-2.5 rounded-full",
              rtStatus === "SUBSCRIBED" ? "bg-emerald-500" :
              rtStatus === "disconnected" ? "bg-zinc-400" :
              rtStatus.startsWith("received:") ? "bg-sky-500" : "bg-amber-500"
            )} />
            <code className="text-xs">{rtStatus}</code>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Send a test notification</CardTitle>
          <CardDescription>
            This calls <code>create_notification</code> with the admin client. The bell on this
            page (and on the navbar) should pick it up via Supabase Realtime.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Body" rows={3} />
          <div className="flex items-center gap-2">
            <Button onClick={sendTest} disabled={sending || !userId}>
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Insert test notification
            </Button>
            <Button variant="outline" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Reload
            </Button>
            <Link href="/dashboard/notifications" className="ml-auto text-xs text-muted-foreground hover:text-foreground">
              Open notifications center →
            </Link>
          </div>
          {feedback && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-[11px] text-emerald-700">
              <CheckCircle2 className="mr-1 inline h-3 w-3" />{feedback}
            </div>
          )}
          {error && (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-2 text-[11px] text-rose-700">
              <AlertCircle className="mr-1 inline h-3 w-3" />{error}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Your notifications ({items.length})</CardTitle>
            {count !== null && (
              <Badge variant="outline" className="text-[10px]">
                unread: {count}
              </Badge>
            )}
          </div>
          <CardDescription>user_id: {userId ?? "—"}</CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="rounded-md border border-dashed bg-muted/20 py-8 text-center text-xs text-muted-foreground">
              No notifications found. Click "Insert test notification" above to create one.
            </p>
          ) : (
            <div className="space-y-1">
              {items.map((n) => (
                <div key={n.id} className="rounded-md border bg-background p-2 text-xs">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{n.title}</p>
                    {!n.read_at && <Badge variant="outline" className="text-[9px]">unread</Badge>}
                  </div>
                  {n.body && <p className="mt-0.5 text-muted-foreground">{n.body}</p>}
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {timeAgo(n.created_at)} · {n.type}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Live bell on this page</CardTitle>
          <CardDescription>The same component used in the navbar. Use it to verify realtime end-to-end.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2">
          <LiveBell />
        </CardContent>
      </Card>
    </div>
  );
}

function LiveBell() {
  const [userId, setUserId] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<any[]>([]);
  const [unread, setUnread] = React.useState(0);
  const sbRef = React.useRef<ReturnType<typeof createClient> | null>(null);

  React.useEffect(() => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    sb.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setUserId(data.user.id);
      const [list, countRpc] = await Promise.all([
        sb.from("notifications").select("*").eq("user_id", data.user.id).order("created_at", { ascending: false }).limit(15),
        (sb.rpc as any)("unread_notification_count", { p_user_id: data.user.id }),
      ]);
      setItems((list as any)?.data ?? []);
      setUnread(typeof countRpc === "number" ? countRpc : 0);
    });
  }, []);

  React.useEffect(() => {
    if (!userId || !sbRef.current) return;
    const sb = sbRef.current;
    const ch = sb.channel("live-bell-debug")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" },
        (payload: any) => {
          const n = payload.new;
          if (n.user_id !== userId) return;
          setItems((prev) => prev.some((x) => x.id === n.id) ? prev : [n, ...prev].slice(0, 15));
          setUnread((c) => c + 1);
        })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [userId]);

  if (!userId) {
    return <p className="text-xs text-muted-foreground">Sign in to see your bell.</p>;
  }

  return (
    <div className="relative">
      <Button variant="ghost" size="icon" className="relative h-9 w-9" onClick={() => setOpen((o) => !o)}>
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-md border bg-card p-2 shadow-xl">
          <p className="px-2 py-1 text-xs font-semibold">Live bell · {items.length} items</p>
          {items.length === 0 ? (
            <p className="px-2 py-2 text-[11px] text-muted-foreground">No notifications yet.</p>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              {items.map((n) => (
                <div key={n.id} className="rounded p-1.5 text-[11px] hover:bg-muted">
                  <p className="font-medium">{n.title}</p>
                  {n.body && <p className="line-clamp-2 text-muted-foreground">{n.body}</p>}
                  <p className="mt-0.5 text-[9px] text-muted-foreground">{timeAgo(n.created_at)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
