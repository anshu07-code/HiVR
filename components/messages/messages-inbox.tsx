"use client";

import * as React from "react";
import Link from "next/link";
import {
  MessageSquare, Search, Loader2, ChevronRight, ArrowUpRight,
  Mic, FileText, Image as ImageIcon, ShieldAlert, Inbox, RefreshCw,
  Pin, Archive, ChevronLeft, Send, X, Filter, Briefcase, FolderKanban, LifeBuoy, Lock,
  User,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn, timeAgo, timeUntil } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { sendDirectMessage } from "@/app/actions/direct-messages";

export type DirectMsg = {
  id: string;
  sender_id: string;
  receiver_id: string;
  body: string;
  created_at: string;
  sender: { id: string; full_name: string | null; avatar_url: string | null } | null;
  receiver: { id: string; full_name: string | null; avatar_url: string | null } | null;
};

type ContractMsg = {
  id: string;
  contract_id: string;
  sender_id: string;
  content: string | null;
  kind: string;
  file_name: string | null;
  flagged_for_contact_info: boolean;
  blocked: boolean;
  created_at: string;
  sender: { id: string; full_name: string | null; avatar_url: string | null } | null;
  contract: {
    id: string;
    status: string;
    buyer_id: string;
    employee_id: string;
    task_post_id: string | null;
    task: { id: string; title: string } | null;
    buyer: { id: string; full_name: string | null; avatar_url: string | null } | null;
    employee: { id: string; full_name: string | null; avatar_url: string | null } | null;
  } | null;
};

type WorkspaceMsg = {
  id: number;
  workspace_id: string;
  sender_id: string;
  body: string | null;
  is_flagged: boolean;
  is_ghosted: boolean;
  created_at: string;
  sender: { id: string; full_name: string | null; avatar_url: string | null } | null;
  workspace: {
    id: string;
    contract_id: string | null;
    buyer_id: string;
    employee_id: string;
    status: string;
    contract: {
      id: string;
      task_post_id: string | null;
      task: { id: string; title: string } | null;
      buyer: { id: string; full_name: string | null; avatar_url: string | null } | null;
      employee: { id: string; full_name: string | null; avatar_url: string | null } | null;
    } | null;
  } | null;
};

type SupportMsg = {
  id: string;
  ticket_id: string;
  sender_id: string;
  sender_role: string;
  content: string;
  created_at: string;
  ticket: { id: string; subject: string; status: string } | null;
};

type ThreadKind = "contract" | "workspace" | "support" | "direct";
type Thread = {
  key: string;
  kind: ThreadKind;
  refId: string;
  title: string;
  subtitle: string;
  counterpart: { id: string; name: string; avatar: string | null } | null;
  contractId: string | null;
  taskId: string | null;
  status: string;
  isClosed: boolean;
  closedReason?: "contract_completed" | "workspace_completed" | "frozen" | "cancelled";
  lastMessage: { body: string; kind: string; fromId: string; fromName: string; at: string; isFromMe: boolean; isFlagged: boolean };
  unread: number;
};

function getKindIcon(kind: string) {
  if (kind === "voice") return Mic;
  if (kind === "image") return ImageIcon;
  if (kind === "file") return FileText;
  return MessageSquare;
}

function deriveThreads(
  userId: string,
  contractMsgs: ContractMsg[],
  workspaceMsgs: WorkspaceMsg[],
  supportMsgs: SupportMsg[],
  directMsgs: DirectMsg[],
): Thread[] {
  const threadMap = new Map<string, Thread>();

  // Contract threads
  for (const m of contractMsgs) {
    if (!m.contract) continue;
    const key = `contract-${m.contract_id}`;
    const isFromMe = m.sender_id === userId;
    const otherId = isFromMe
      ? (m.contract.buyer_id === userId ? m.contract.employee_id : m.contract.buyer_id)
      : m.sender_id;
    const otherName = isFromMe
      ? (m.contract.buyer_id === userId
          ? m.contract.employee?.full_name ?? "Counterparty"
          : m.contract.buyer?.full_name ?? "Counterparty")
      : m.sender?.full_name ?? "Counterparty";
    const otherAvatar = isFromMe
      ? (m.contract.buyer_id === userId
          ? m.contract.employee?.avatar_url
          : m.contract.buyer?.avatar_url)
      : m.sender?.avatar_url;
    const existing = threadMap.get(key);
    const isNewer = !existing || new Date(m.created_at) > new Date(existing.lastMessage.at);
    if (isNewer) {
      const isClosed = m.contract.status === "completed" || m.contract.status === "cancelled" || m.contract.status === "frozen";
      threadMap.set(key, {
        key,
        kind: "contract",
        refId: m.contract_id,
        title: m.contract.task?.title ?? "Contract",
        subtitle: m.contract.status,
        counterpart: { id: otherId ?? "?", name: otherName, avatar: otherAvatar ?? null },
        contractId: m.contract_id,
        taskId: m.contract.task?.id ?? null,
        status: m.contract.status,
        isClosed,
        closedReason: m.contract.status === "completed" ? "contract_completed" :
                      m.contract.status === "cancelled" ? "cancelled" :
                      m.contract.status === "frozen" ? "frozen" : undefined,
        lastMessage: {
          body: m.content ?? (m.kind === "voice" ? "🎤 Voice message" : m.kind === "file" ? `📎 ${m.file_name ?? "file"}` : m.kind === "image" ? "🖼️ Image" : "(empty)"),
          kind: m.kind,
          fromId: m.sender_id,
          fromName: m.sender?.full_name ?? "Someone",
          at: m.created_at,
          isFromMe,
          isFlagged: m.flagged_for_contact_info || m.blocked,
        },
        unread: 0,
      });
    }
  }

  // Workspace threads
  for (const m of workspaceMsgs) {
    if (!m.workspace) continue;
    const contractId = m.workspace.contract_id;
    const key = `workspace-${m.workspace_id}`;
    const isFromMe = m.sender_id === userId;
    const otherId = isFromMe
      ? (m.workspace.buyer_id === userId ? m.workspace.employee_id : m.workspace.buyer_id)
      : m.sender_id;
    const otherName = isFromMe
      ? (m.workspace.buyer_id === userId
          ? m.workspace.contract?.employee?.full_name ?? "Counterparty"
          : m.workspace.contract?.buyer?.full_name ?? "Counterparty")
      : m.sender?.full_name ?? "Counterparty";
    const otherAvatar = isFromMe
      ? (m.workspace.buyer_id === userId
          ? m.workspace.contract?.employee?.avatar_url
          : m.workspace.contract?.buyer?.avatar_url)
      : m.sender?.avatar_url;
    const existing = threadMap.get(key);
    const isNewer = !existing || new Date(m.created_at) > new Date(existing.lastMessage.at);
    if (isNewer) {
      const isClosed = m.workspace.status === "completed" || m.workspace.status === "cancelled" || m.workspace.status === "frozen";
      threadMap.set(key, {
        key,
        kind: "workspace",
        refId: m.workspace_id,
        title: m.workspace.contract?.task?.title ?? "Workspace",
        subtitle: `workspace · ${m.workspace.status}`,
        counterpart: { id: otherId ?? "?", name: otherName, avatar: otherAvatar ?? null },
        contractId: contractId,
        taskId: m.workspace.contract?.task?.id ?? null,
        status: m.workspace.status,
        isClosed,
        closedReason: m.workspace.status === "completed" ? "workspace_completed" :
                      m.workspace.status === "cancelled" ? "cancelled" :
                      m.workspace.status === "frozen" ? "frozen" : undefined,
        lastMessage: {
          body: m.body ?? "(empty)",
          kind: "text",
          fromId: m.sender_id,
          fromName: m.sender?.full_name ?? "Someone",
          at: m.created_at,
          isFromMe,
          isFlagged: m.is_flagged || m.is_ghosted,
        },
        unread: 0,
      });
    }
  }

  // Support threads
  for (const m of supportMsgs) {
    if (!m.ticket) continue;
    const key = `support-${m.ticket_id}`;
    const existing = threadMap.get(key);
    const isFromMe = m.sender_id === userId;
    const isNewer = !existing || new Date(m.created_at) > new Date(existing.lastMessage.at);
    if (isNewer) {
      const isClosed = m.ticket.status === "closed" || m.ticket.status === "resolved";
      threadMap.set(key, {
        key,
        kind: "support",
        refId: m.ticket_id,
        title: m.ticket.subject,
        subtitle: `support · ${m.ticket.status}`,
        counterpart: null,
        contractId: null,
        taskId: null,
        status: m.ticket.status,
        isClosed,
        closedReason: isClosed ? "contract_completed" : undefined,
        lastMessage: {
          body: m.content,
          kind: "text",
          fromId: m.sender_id,
          fromName: isFromMe ? "You" : "Support",
          at: m.created_at,
          isFromMe,
          isFlagged: false,
        },
        unread: 0,
      });
    }
  }

  // Direct message threads (no task, just conversation)
  for (const m of directMsgs) {
    const otherParty = m.sender_id === userId ? m.receiver : m.sender;
    const otherId = otherParty?.id ?? (m.sender_id === userId ? m.receiver_id : m.sender_id);
    const key = `direct-${otherId}`;
    const isFromMe = m.sender_id === userId;
    const existing = threadMap.get(key);
    const isNewer = !existing || new Date(m.created_at) > new Date(existing.lastMessage.at);
    if (isNewer) {
      threadMap.set(key, {
        key,
        kind: "direct",
        refId: otherId,
        title: "Direct message",
        subtitle: "chat",
        counterpart: { id: otherId, name: otherParty?.full_name ?? "Someone", avatar: otherParty?.avatar_url ?? null },
        contractId: null,
        taskId: null,
        status: "active",
        isClosed: false,
        lastMessage: {
          body: m.body,
          kind: "text",
          fromId: m.sender_id,
          fromName: m.sender?.full_name ?? "Someone",
          at: m.created_at,
          isFromMe,
          isFlagged: false,
        },
        unread: 0,
      });
    }
  }

  return Array.from(threadMap.values())
    .sort((a, b) => new Date(b.lastMessage.at).getTime() - new Date(a.lastMessage.at).getTime());
}

export function MessagesInbox({
  userId, initialContractMsgs, initialWorkspaceMsgs, initialSupportMsgs, initialDirectMsgs,
}: {
  userId: string;
  initialContractMsgs: ContractMsg[];
  initialWorkspaceMsgs: WorkspaceMsg[];
  initialSupportMsgs: SupportMsg[];
  initialDirectMsgs: DirectMsg[];
}) {
  const sbRef = React.useRef<ReturnType<typeof createClient> | null>(null);
  const [contractMsgs, setContractMsgs] = React.useState<ContractMsg[]>(initialContractMsgs);
  const [workspaceMsgs, setWorkspaceMsgs] = React.useState<WorkspaceMsg[]>(initialWorkspaceMsgs);
  const [supportMsgs, setSupportMsgs] = React.useState<SupportMsg[]>(initialSupportMsgs);
  const [directMsgs, setDirectMsgs] = React.useState<DirectMsg[]>(initialDirectMsgs);
  const [search, setSearch] = React.useState("");
  const [kindFilter, setKindFilter] = React.useState<"all" | "contract" | "workspace" | "support" | "direct">("all");
  const [activeFilter, setActiveFilter] = React.useState<"all" | "active" | "closed">("active");
  const [activeKey, setActiveKey] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const activeThreadRef = React.useRef<Thread | null>(null);

  const threads = React.useMemo(
    () => deriveThreads(userId, contractMsgs, workspaceMsgs, supportMsgs, directMsgs),
    [userId, contractMsgs, workspaceMsgs, supportMsgs, directMsgs]
  );

  // Filter threads
  const filteredThreads = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return threads.filter((t) => {
      if (kindFilter !== "all" && t.kind !== kindFilter) return false;
      if (activeFilter === "active" && t.isClosed) return false;
      if (activeFilter === "closed" && !t.isClosed) return false;
      if (q) {
        if (
          !t.title.toLowerCase().includes(q) &&
          !(t.counterpart?.name.toLowerCase().includes(q) ?? false) &&
          !t.lastMessage.body.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [threads, kindFilter, activeFilter, search]);

  const closedCount = React.useMemo(() => threads.filter((t) => t.isClosed).length, [threads]);

  const kindCounts = React.useMemo(() => {
    const counts: Record<string, { total: number; unread: number }> = {};
    for (const k of ["contract", "workspace", "support", "direct"]) {
      const kindThreads = threads.filter((t) => t.kind === k && !t.isClosed);
      counts[k] = {
        total: kindThreads.length,
        unread: kindThreads.filter((t) => !t.lastMessage.isFromMe).length,
      };
    }
    return counts;
  }, [threads]);

  const totalUnread = React.useMemo(
    () => Object.values(kindCounts).reduce((acc, c) => acc + c.unread, 0),
    [kindCounts]
  );

  // Active thread detail (load full message history)
  const activeThread = activeKey ? threads.find((t) => t.key === activeKey) ?? null : null;
  const [threadHistory, setThreadHistory] = React.useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [reply, setReply] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [replyError, setReplyError] = React.useState<string | null>(null);

  // Keep ref in sync
  React.useEffect(() => { activeThreadRef.current = activeThread; }, [activeThread]);

  // Realtime: new messages
  React.useEffect(() => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const ch = sb
      .channel(`messages-inbox-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "workspace_messages" }, () => refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages" }, () => refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, () => refresh())
      .subscribe();
    return () => { sb.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function refresh() {
    setRefreshing(true);
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const [c, w, s, d] = await Promise.all([
      sb.from("messages").select("id, contract_id, sender_id, content, kind, file_name, flagged_for_contact_info, blocked, created_at, sender:users!messages_sender_id_fkey(id, full_name, avatar_url), contract:contracts!inner(id, status, buyer_id, employee_id, task_post_id, task:task_posts(id, title), buyer:users!contracts_buyer_id_fkey(id, full_name, avatar_url), employee:users!contracts_employee_id_fkey(id, full_name, avatar_url))").order("created_at", { ascending: false }).limit(200),
      sb.from("workspace_messages").select("id, workspace_id, sender_id, body, is_flagged, is_ghosted, created_at, sender:users!workspace_messages_sender_id_fkey(id, full_name, avatar_url), workspace:workspaces!inner(id, contract_id, buyer_id, employee_id, status, contract:contracts(id, task_post_id, task:task_posts(id, title), buyer:users!contracts_buyer_id_fkey(id, full_name, avatar_url), employee:users!contracts_employee_id_fkey(id, full_name, avatar_url)))").order("created_at", { ascending: false }).limit(200),
      sb.from("support_messages").select("id, ticket_id, sender_id, sender_role, content, created_at, ticket:support_tickets(id, subject, status)").or(`sender_id.eq.${userId}`).order("created_at", { ascending: false }).limit(50),
      sb.from("direct_messages").select("id, sender_id, receiver_id, body, created_at, sender:users!direct_messages_sender_id_fkey(id, full_name, avatar_url), receiver:users!direct_messages_receiver_id_fkey(id, full_name, avatar_url)").order("created_at", { ascending: false }).limit(200),
    ]);
    setContractMsgs((c.data ?? []) as ContractMsg[]);
    setWorkspaceMsgs((w.data ?? []) as WorkspaceMsg[]);
    setSupportMsgs((s.data ?? []) as SupportMsg[]);
    setDirectMsgs((d.data ?? []) as DirectMsg[]);
    setRefreshing(false);

    // Also reload thread history if a thread is active
    const currentThread = activeThreadRef.current;
    if (currentThread) {
      loadThreadHistory(currentThread);
    }
  }

  async function loadThreadHistory(thread: Thread) {
    setHistoryLoading(true);
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    if (thread.kind === "contract") {
      const { data } = await sb.from("messages")
        .select("id, contract_id, sender_id, content, kind, file_name, flagged_for_contact_info, blocked, created_at, sender:users!messages_sender_id_fkey(id, full_name, avatar_url)")
        .eq("contract_id", thread.refId)
        .order("created_at", { ascending: true })
        .limit(200);
      setThreadHistory((data ?? []) as ContractMsg[]);
    } else if (thread.kind === "workspace") {
      const { data } = await sb.from("workspace_messages")
        .select("id, workspace_id, sender_id, body, is_flagged, is_ghosted, created_at, sender:users!workspace_messages_sender_id_fkey(id, full_name, avatar_url)")
        .eq("workspace_id", thread.refId)
        .order("created_at", { ascending: true })
        .limit(200);
      setThreadHistory((data ?? []) as WorkspaceMsg[]);
    } else if (thread.kind === "direct") {
      const { data } = await sb.from("direct_messages")
        .select("id, sender_id, receiver_id, body, created_at, sender:users!direct_messages_sender_id_fkey(id, full_name, avatar_url), receiver:users!direct_messages_receiver_id_fkey(id, full_name, avatar_url)")
        .or(`and(sender_id.eq.${userId},receiver_id.eq.${thread.counterpart!.id}),and(sender_id.eq.${thread.counterpart!.id},receiver_id.eq.${userId})`)
        .order("created_at", { ascending: true })
        .limit(200);
      setThreadHistory((data ?? []) as DirectMsg[]);
    } else {
      const { data } = await sb.from("support_messages")
        .select("id, ticket_id, sender_id, sender_role, content, created_at")
        .eq("ticket_id", thread.refId)
        .order("created_at", { ascending: true })
        .limit(200);
      setThreadHistory((data ?? []) as SupportMsg[]);
    }
    setHistoryLoading(false);
  }

  // Load full history when a thread is selected
  React.useEffect(() => {
    setReplyError(null);
    if (!activeThread) { setThreadHistory([]); return; }
    loadThreadHistory(activeThread);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThread, userId]);

  async function sendReply() {
    if (!activeThread || !reply.trim()) return;
    setSending(true);
    setReplyError(null);
    try {
      if (activeThread.kind === "contract") {
        const r = await fetch("/api/messages/send", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ contract_id: activeThread.refId, content: reply.trim() }),
        });
        if (r.ok) { setReply(""); refresh(); }
        else { setReplyError("Failed to send"); }
      } else if (activeThread.kind === "workspace") {
        const r = await fetch("/api/workspace/send-message", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ workspaceId: activeThread.refId, body: reply.trim() }),
        });
        if (r.ok) { setReply(""); refresh(); }
        else { setReplyError("Failed to send"); }
      } else if (activeThread.kind === "direct") {
        const res = await sendDirectMessage(activeThread.counterpart!.id, reply.trim());
        if (res.ok) { setReply(""); refresh(); }
        else { setReplyError(res.error ?? "Failed to send"); }
      }
    } finally {
      setSending(false);
    }
  }

  const kindButtons = ["all", "contract", "workspace", "support", "direct"] as const;

  return (
    <div className="container max-w-7xl space-y-4 py-6">
      <div className="flex items-center justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-1">
            <Link href="/dashboard"><ArrowUpRight className="h-3.5 w-3.5" />Dashboard</Link>
          </Button>
          <h1 className="font-display text-2xl font-semibold tracking-tight" data-tour="messages-header">Messages</h1>
        </div>
      </div>

      <div className={cn(
        "grid gap-3",
        activeThread ? "md:grid-cols-[380px_minmax(0,1fr)]" : "md:grid-cols-1"
      )}>
        {/* Thread list */}
        <Card className={cn(activeThread && "hidden md:block")}>
          <CardHeader className="space-y-2 pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Inbox className="h-4 w-4" />Inbox
                <Badge variant="secondary" className="text-[10px]">{filteredThreads.length}</Badge>
              </CardTitle>
              <Button size="sm" variant="ghost" onClick={refresh} disabled={refreshing}>
                {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              </Button>
            </div>
            {/* Active / Closed switch */}
            <div className="inline-flex rounded-md border bg-muted/30 p-0.5 text-[10px]">
              {(["active", "closed", "all"] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setActiveFilter(a)}
                  className={cn(
                    "rounded px-2 py-0.5 font-medium capitalize transition-colors",
                    activeFilter === a ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {a === "all" ? `All (${threads.length})` :
                   a === "active" ? `Active (${threads.length - closedCount})` :
                   `Closed (${closedCount})`}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {kindButtons.map((k) => {
                const c = k === "all"
                  ? { total: threads.filter(t => !t.isClosed).length, unread: totalUnread }
                  : kindCounts[k] ?? { total: 0, unread: 0 };
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKindFilter(k)}
                    className={cn(
                      "rounded-md border px-2 py-0.5 text-[10px] font-medium capitalize",
                      kindFilter === k ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {k}
                    {c.total > 0 && (
                      <span className="ml-1">
                        {c.unread > 0 ? (
                          <span className="inline-flex items-center justify-center rounded-full bg-primary px-1 text-[8px] font-bold text-primary-foreground">
                            {c.unread}
                          </span>
                        ) : (
                          <span className="text-[9px] text-muted-foreground/60">({c.total})</span>
                        )}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search conversations…"
                className="h-7 pl-7 text-[11px]"
              />
            </div>
          </CardHeader>
          <CardContent className="scrollbar-hide max-h-[65vh] overflow-y-auto p-1.5">
            {filteredThreads.length === 0 ? (
              <p className="py-12 text-center text-[11px] text-muted-foreground">
                No conversations yet.
              </p>
            ) : (
              <div className="space-y-0.5">
                {filteredThreads.map((t) => {
                  const KindIcon = t.kind === "contract" ? Briefcase : t.kind === "workspace" ? FolderKanban : t.kind === "direct" ? User : LifeBuoy;
                  const active = activeKey === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setActiveKey(t.key)}
                      className={cn(
                        "flex w-full items-start gap-2 rounded-md p-2 text-left transition-colors hover:bg-muted",
                        active && "bg-muted",
                        t.isClosed && "opacity-70"
                      )}
                    >
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarImage src={t.counterpart?.avatar ?? undefined} className="object-cover" />
                        <AvatarFallback className="text-[10px]">
                          {t.counterpart?.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase() ?? "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-xs font-semibold">{t.counterpart?.name ?? "Support"}</p>
                          <KindIcon className="h-2.5 w-2.5 text-muted-foreground" />
                          {t.isClosed && (
                            <Badge variant="outline" className="border-zinc-500/30 bg-zinc-500/10 px-1 py-0 text-[8px] text-zinc-600">
                              <Lock className="mr-0.5 h-2 w-2" />Closed
                            </Badge>
                          )}
                        </div>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {t.title}
                        </p>
                        <p className={cn("mt-0.5 line-clamp-1 text-[10px]", t.lastMessage.isFlagged && "text-rose-600")}>
                          {t.lastMessage.isFromMe && <span className="text-muted-foreground/80">You: </span>}
                          {t.lastMessage.body}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[9px] text-muted-foreground">{timeAgo(t.lastMessage.at)}</p>
                        {t.lastMessage.isFlagged && (
                          <ShieldAlert className="ml-auto h-2.5 w-2.5 text-rose-500" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Thread detail */}
        {activeThread && (
          <Card className="flex max-h-[75vh] flex-col">
            <CardHeader className="flex flex-row items-start justify-between gap-2 border-b pb-3">
              <div className="min-w-0 flex-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-2 mb-1 h-6 md:hidden"
                  onClick={() => setActiveKey(null)}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />Back
                </Button>
                <CardTitle className="flex items-center gap-2 text-base">
                  {activeThread.counterpart && (
                    <>
                      {activeThread.kind === "direct" ? (
                        <Link href={`/people/${activeThread.counterpart.id}`} className="flex items-center gap-2 hover:underline">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={activeThread.counterpart.avatar ?? undefined} className="object-cover" />
                            <AvatarFallback className="text-[10px]">
                              {activeThread.counterpart.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          {activeThread.counterpart.name}
                        </Link>
                      ) : (
                        <>
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={activeThread.counterpart.avatar ?? undefined} className="object-cover" />
                            <AvatarFallback className="text-[10px]">
                              {activeThread.counterpart.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          {activeThread.counterpart.name}
                        </>
                      )}
                    </>
                  )}
                  {!activeThread.counterpart && "Support"}
                </CardTitle>
                <CardDescription className="line-clamp-1">
                  {activeThread.kind === "direct" ? "Direct message" : `${activeThread.title} · ${activeThread.status}`}
                </CardDescription>
              </div>
              <div className="flex items-center gap-1.5">
                {activeThread.contractId && (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/dashboard/contracts/${activeThread.contractId}`}>
                      Open contract<ChevronRight className="h-3 w-3" />
                    </Link>
                  </Button>
                )}
                {activeThread.kind === "direct" && activeThread.counterpart && (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/people/${activeThread.counterpart.id}`}>
                      View profile<ChevronRight className="h-3 w-3" />
                    </Link>
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={() => setActiveKey(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="scrollbar-hide flex-1 space-y-2 overflow-y-auto p-3">
              {historyLoading ? (
                <div className="grid place-items-center py-8 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : threadHistory.length === 0 ? (
                <p className="py-12 text-center text-[11px] text-muted-foreground">No messages yet.</p>
              ) : (
                threadHistory.map((m: any) => {
                  const isFromMe = m.sender_id === userId;
                  const isDirect = activeThread.kind === "direct";
                  const isWorkspace = activeThread.kind === "workspace";
                  const isSupport = activeThread.kind === "support";
                  const body = isDirect ? m.body : isWorkspace ? m.body : isSupport ? m.content : m.content;
                  const isFlagged = isDirect ? false : isWorkspace ? (m.is_flagged || m.is_ghosted) : m.flagged_for_contact_info || m.blocked;
                  const senderName = isDirect
                    ? (m.sender?.full_name ?? (isFromMe ? "You" : "Someone"))
                    : (m.sender?.full_name ?? (isFromMe ? "You" : isSupport ? "Support" : "Someone"));
                  const senderAvatar = isDirect ? (m.sender?.avatar_url ?? undefined) : undefined;
                  return (
                    <div key={m.id ?? `${m.ticket_id}-${m.created_at}`} className={cn("flex gap-2", isFromMe && "flex-row-reverse")}>
                      {isDirect ? (
                        activeThread.counterpart?.id && m.sender_id !== userId ? (
                          <Link href={`/people/${m.sender_id}`}>
                            <Avatar className="h-6 w-6 shrink-0">
                              <AvatarImage src={senderAvatar} className="object-cover" />
                              <AvatarFallback className="text-[9px]">{senderName[0]}</AvatarFallback>
                            </Avatar>
                          </Link>
                        ) : (
                          <Avatar className="h-6 w-6 shrink-0">
                            <AvatarFallback className="text-[9px]">{senderName[0]}</AvatarFallback>
                          </Avatar>
                        )
                      ) : (
                        <Avatar className="h-6 w-6 shrink-0">
                          <AvatarImage src={undefined} className="object-cover" />
                          <AvatarFallback className="text-[9px]">{senderName[0]}</AvatarFallback>
                        </Avatar>
                      )}
                      <div className={cn("min-w-0 max-w-[75%] flex-1", isFromMe && "flex flex-col items-end")}>
                        <div className={cn(
                          "inline-block rounded-lg px-2.5 py-1.5 text-xs",
                          isFromMe ? "bg-primary text-primary-foreground" : "bg-muted",
                          isFlagged && "ring-1 ring-rose-500/40"
                        )}>
                          {!isWorkspace && !isDirect && m.kind !== "text" && (
                            <div className="mb-0.5 flex items-center gap-1 text-[10px] opacity-80">
                              {(() => { const Icon = getKindIcon(m.kind); return <Icon className="h-3 w-3" />; })()}
                              {m.kind === "voice" ? "Voice" : m.kind === "file" ? m.file_name : m.kind === "image" ? "Image" : m.kind}
                            </div>
                          )}
                          <p className="whitespace-pre-wrap break-words">{body ?? "(empty)"}</p>
                          {isFlagged && (
                            <p className="mt-1 flex items-center gap-1 text-[9px] opacity-80">
                              <ShieldAlert className="h-2.5 w-2.5" />flagged
                            </p>
                          )}
                        </div>
                        <p className="mt-0.5 text-[9px] text-muted-foreground">{timeAgo(m.created_at)}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
            {activeThread.kind !== "support" && !activeThread.isClosed && (
              <div className="border-t p-2">
                <div className="flex items-end gap-2">
                  <Textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder={`Reply to ${activeThread.counterpart?.name ?? ""}…`}
                    rows={2}
                    className="min-h-[60px] flex-1 text-xs"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendReply();
                      }
                    }}
                  />
                  <Button onClick={sendReply} disabled={!reply.trim() || sending}>
                    {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Send
                  </Button>
                </div>
                {replyError && (
                  <p className="mt-1 text-[10px] text-destructive">{replyError}</p>
                )}
                <p className="mt-1 text-[9px] text-muted-foreground">
                  Enter to send · Shift+Enter for newline
                </p>
              </div>
            )}
            {activeThread.kind !== "support" && activeThread.isClosed && (
              <div className="border-t bg-muted/30 p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Lock className="h-3.5 w-3.5" />
                  <span>
                    This conversation is closed
                    {activeThread.closedReason === "contract_completed" && " — the contract was completed."}
                    {activeThread.closedReason === "workspace_completed" && " — the workspace was completed."}
                    {activeThread.closedReason === "cancelled" && " — the contract was cancelled."}
                    {activeThread.closedReason === "frozen" && " — the workspace was frozen by an admin."}
                    {" "}You can read past messages, but new ones are locked.
                  </span>
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
