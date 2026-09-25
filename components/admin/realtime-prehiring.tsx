"use client";

import * as React from "react";
import {
  MessageSquare, Loader2, X, ChevronDown, ChevronRight, Search, User, Send, ArrowLeft, Clock, AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { timeAgo } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

type DirectMsg = {
  id: string;
  sender_id: string;
  receiver_id: string;
  body: string;
  created_at: string;
  sender: { id: string; full_name: string | null; avatar_url: string | null } | null;
  receiver: { id: string; full_name: string | null; avatar_url: string | null } | null;
};

type TaskMsg = {
  id: string;
  task_id: string;
  asker_id: string;
  body: string;
  is_answer: boolean;
  created_at: string;
  asker: { id: string; full_name: string | null } | null;
};

type UnifiedMessage = {
  id: string;
  fromName: string;
  fromId: string;
  body: string;
  created_at: string;
  source: "direct" | "task" | "gig";
  taskId?: string;
};

type Thread = {
  pairKey: string;
  personA: string;
  personAId: string;
  personB: string;
  personBId: string;
  lastMessage: string;
  lastTime: string;
  count: number;
  messages: UnifiedMessage[];
};

export function RealtimePreHiringChats() {
  const sbRef = React.useRef<ReturnType<typeof createClient> | null>(null);
  const [directMsgs, setDirectMsgs] = React.useState<DirectMsg[]>([]);
  const [taskMsgs, setTaskMsgs] = React.useState<TaskMsg[]>([]);
  const [connection, setConnection] = React.useState<"online" | "offline" | "connecting">("connecting");
  const [search, setSearch] = React.useState("");
  const [openThread, setOpenThread] = React.useState<Thread | null>(null);

  const loadDirect = React.useCallback(async () => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const { data } = await sb
      .from("direct_messages")
      .select("id, sender_id, receiver_id, body, created_at, sender:users!direct_messages_sender_id_fkey(id, full_name, avatar_url), receiver:users!direct_messages_receiver_id_fkey(id, full_name, avatar_url)")
      .order("created_at", { ascending: false })
      .limit(200) as any;
    if (data) setDirectMsgs(data);
  }, []);

  const loadTaskMsgs = React.useCallback(async () => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const { data } = await sb
      .from("task_queries")
      .select("id, task_id, asker_id, body, is_answer, created_at, asker:users!task_queries_asker_id_fkey(id, full_name)")
      .order("created_at", { ascending: false })
      .limit(200) as any;
    if (data) setTaskMsgs(data);
  }, []);

  React.useEffect(() => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const channel = sb
      .channel("prehiring-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, () => loadDirect())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "task_queries" }, () => loadTaskMsgs())
      .subscribe((status) => {
        if (status === "SUBSCRIBED") { setConnection("online"); loadDirect(); loadTaskMsgs(); }
        if (status === "CLOSED" || status === "CHANNEL_ERROR") setConnection("offline");
      });
    return () => { sb.removeChannel(channel); };
  }, [loadDirect, loadTaskMsgs]);

  // Build threads from direct messages
  const directThreads = React.useMemo(() => {
    const map = new Map<string, Thread>();
    for (const m of directMsgs) {
      const ids = [m.sender_id, m.receiver_id].sort();
      const key = `dm:${ids.join(":")}`;
      if (!map.has(key)) {
        map.set(key, {
          pairKey: key,
          personA: m.sender?.full_name ?? "?",
          personAId: m.sender_id,
          personB: m.receiver?.full_name ?? "?",
          personBId: m.receiver_id,
          lastMessage: m.body,
          lastTime: m.created_at,
          count: 0,
          messages: [],
        });
      }
      const t = map.get(key)!;
      t.messages.push({
        id: `dm:${m.id}`,
        fromName: m.sender?.full_name ?? "?",
        fromId: m.sender_id,
        body: m.body,
        created_at: m.created_at,
        source: "direct",
      });
      if (m.created_at > t.lastTime) { t.lastTime = m.created_at; t.lastMessage = m.body; }
      t.count++;
    }
    for (const t of map.values()) {
      t.messages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const first = t.messages[0];
      t.personA = first.fromName;
      t.personAId = first.fromId;
      // Determine personB from the other side
      const msg0 = directMsgs.find(m => `${m.id}` === first.id.replace("dm:", ""));
      if (msg0) {
        const otherId = msg0.sender_id === first.fromId ? msg0.receiver_id : msg0.sender_id;
        const other = msg0.sender_id === first.fromId ? msg0.receiver : msg0.sender;
        t.personB = other?.full_name ?? "?";
        t.personBId = otherId;
      }
    }
    return [...map.values()].sort((a, b) => b.lastTime.localeCompare(a.lastTime));
  }, [directMsgs]);

  // Build threads from task messages (group by task_id)
  const taskThreads = React.useMemo(() => {
    const map = new Map<string, Thread>();
    for (const m of taskMsgs) {
      const key = `task:${m.task_id}`;
      if (!map.has(key)) {
        map.set(key, {
          pairKey: key,
          personA: m.asker?.full_name ?? "?",
          personAId: m.asker_id,
          personB: "Task Q&A",
          personBId: "",
          lastMessage: m.body,
          lastTime: m.created_at,
          count: 0,
          messages: [],
        });
      }
      const t = map.get(key)!;
      t.messages.push({
        id: `tq:${m.id}`,
        fromName: m.asker?.full_name ?? "?",
        fromId: m.asker_id,
        body: m.body,
        created_at: m.created_at,
        source: m.is_answer ? "direct" : "task",
        taskId: m.task_id,
      });
      if (m.created_at > t.lastTime) { t.lastTime = m.created_at; t.lastMessage = m.body; }
      t.count++;
    }
    for (const t of map.values()) {
      t.messages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }
    return [...map.values()].sort((a, b) => b.lastTime.localeCompare(a.lastTime));
  }, [taskMsgs]);

  // Merge direct + task threads
  const allThreads = React.useMemo(() => {
    return [...directThreads, ...taskThreads].sort((a, b) => b.lastTime.localeCompare(a.lastTime));
  }, [directThreads, taskThreads]);

  const q = search.toLowerCase();
  const filtered = allThreads.filter(t =>
    !q || t.personA.toLowerCase().includes(q) || t.personB.toLowerCase().includes(q) ||
    t.lastMessage.toLowerCase().includes(q) || t.pairKey.includes(q)
  );

  if (openThread) {
    return (
      <div className="flex h-[500px] rounded-lg border bg-card">
        {/* Thread list (left column) */}
        <div className="hidden w-64 shrink-0 border-r md:flex md:flex-col">
          <div className="flex items-center gap-2 border-b px-3 py-2.5">
            <ArrowLeft className="h-4 w-4 cursor-pointer text-muted-foreground hover:text-foreground" onClick={() => setOpenThread(null)} />
            <span className="text-xs font-semibold">All conversations</span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-0.5 p-1.5">
            {filtered.map((t) => (
              <button
                key={t.pairKey}
                onClick={() => setOpenThread(t)}
                className={`flex w-full items-center gap-2 rounded-md p-2 text-left text-xs transition-colors ${
                  t.pairKey === openThread.pairKey ? "bg-primary/10 text-primary" : "hover:bg-muted/50"
                }`}
              >
                <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-[9px] font-semibold">
                  {t.personA.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{t.personA} {t.personB !== "Task Q&A" ? <span className="text-muted-foreground font-normal">↔ {t.personB}</span> : ""}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{t.lastMessage}</p>
                </div>
                <span className="shrink-0 text-[9px] text-muted-foreground">{timeAgo(t.lastTime)}</span>
              </button>
            ))}
          </div>
        </div>
        {/* Chat view (right column) */}
        <div className="flex flex-1 flex-col">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <Button size="sm" variant="ghost" onClick={() => setOpenThread(null)} className="h-7 px-2 md:hidden">
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
            <div className="flex items-center gap-2 text-sm font-medium">
              <Avatar className="h-6 w-6">
                <AvatarImage src={undefined} />
                <AvatarFallback className="text-[8px]">{openThread.personA.charAt(0)}</AvatarFallback>
              </Avatar>
              <span>{openThread.personA}</span>
              {openThread.personB !== "Task Q&A" && (
                <>
                  <span className="text-muted-foreground">↔</span>
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={undefined} />
                    <AvatarFallback className="text-[8px]">{openThread.personB.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <span>{openThread.personB}</span>
                </>
              )}
              <Badge variant="outline" className="text-[9px]">
                {openThread.pairKey.startsWith("task:") ? "Task Q&A" : openThread.messages[0]?.source === "gig" ? "Gig chat" : "Direct"}
              </Badge>
              <span className="text-[10px] text-muted-foreground">{openThread.count} messages</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {openThread.messages.map((m) => {
              const isFromFirst = m.fromId === openThread.personAId;
              return (
                <div key={m.id} className={`flex gap-2 ${isFromFirst ? "" : "flex-row-reverse"}`}>
                  <Avatar className="mt-0.5 h-6 w-6 shrink-0">
                    <AvatarFallback className="text-[8px]">{m.fromName.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className={`max-w-[70%] rounded-xl px-3 py-2 text-sm ${
                    isFromFirst ? "bg-muted rounded-tl-sm" : "bg-primary text-primary-foreground rounded-tr-sm"
                  }`}>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={`text-[10px] font-medium ${isFromFirst ? "" : "text-primary-foreground/80"}`}>{m.fromName}</span>
                      {m.source === "gig" && <Badge variant="outline" className="text-[8px] h-3.5">Gig</Badge>}
                      <span className={`text-[9px] ${isFromFirst ? "text-muted-foreground" : "text-primary-foreground/60"}`}>
                        {new Date(m.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <div className="flex-1">
          <CardTitle className="flex items-center gap-2 text-amber-600">
            <MessageSquare className="h-4 w-4" />Pre-hiring chats
          </CardTitle>
          <CardDescription className="text-[11px]">
            Direct messages + task queries grouped by conversation. Click to view full chat.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Search by name or message..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 w-44 pl-6 text-[11px]"
            />
          </div>
          <Badge variant={connection === "online" ? "success" : connection === "offline" ? "destructive" : "secondary"} className="gap-1 text-[10px]">
            {connection === "online" ? <><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Live</> :
             connection === "connecting" ? <><Loader2 className="h-3 w-3 animate-spin" />Connecting…</> :
             <><X className="h-3 w-3" />Reconnecting…</>}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4">
          {/* Thread list */}
          <div className="flex-1 space-y-1.5">
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">No conversations found.</p>
            ) : filtered.map((t) => (
              <button
                key={t.pairKey}
                onClick={() => setOpenThread(t)}
                className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
              >
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-500/10 text-blue-600">
                  <User className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {t.pairKey.startsWith("task:") ? (
                      <>{t.personA} <span className="text-muted-foreground font-normal">· Task Q&A</span></>
                    ) : (
                      <>{t.personA} <span className="text-muted-foreground font-normal">↔</span> {t.personB}</>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{t.lastMessage}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[10px] text-muted-foreground">{timeAgo(t.lastTime)}</span>
                  <Badge variant="secondary" className="text-[9px]">{t.count}</Badge>
                </div>
              </button>
            ))}
          </div>
          {/* Hint for desktop */}
          {filtered.length > 0 && !openThread && (
            <div className="hidden md:flex md:w-80 items-center justify-center rounded-lg border border-dashed bg-muted/20 text-sm text-muted-foreground">
              <div className="text-center p-8">
                <MessageSquare className="mx-auto h-8 w-8 text-muted-foreground/30" />
                <p className="mt-2 text-xs">Select a conversation to view messages</p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
