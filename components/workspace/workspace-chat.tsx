"use client";

import * as React from "react";
import { Send, Paperclip, Loader2, Eye, ShieldAlert, Lock, FileText, Download, AlertTriangle, History, Wifi, WifiOff, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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

const GHOST_REGEXES: RegExp[] = [
  /([0-9][ \-]?){8,}/,
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
  /\b(whatsapp|telegram|skype|gmail|zoom|discord|signal|wechat|viber|imo|paypal|gpay|pay[\s ]?tm|phonepe|cashapp|venmo|wise\.com|bank transfer|account transfer|upi)\b/i,
  /\b(off[\s-]?platform|outside[\s ]+(the[\s ]+)?platform)\b/i,
];

function willBeGhosted(text: string): boolean {
  const lower = text.toLowerCase();
  for (const re of GHOST_REGEXES) {
    if (re.test(lower)) return true;
  }
  return false;
}

export function WorkspaceChat({
  workspaceId, currentUserId, me, counterparty, isLocked, isAdmin = false,
  awaitingFunding, isBuyer,
}: {
  workspaceId: string;
  currentUserId: string;
  me: { id: string; full_name: string | null; avatar_url: string | null };
  counterparty: { id: string; full_name: string | null; avatar_url: string | null };
  isLocked: boolean;
  isAdmin?: boolean;
  awaitingFunding?: boolean;
  isBuyer?: boolean;
}) {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [text, setText] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null);
  const [chatError, setChatError] = React.useState<string | null>(null);
  const [connection, setConnection] = React.useState<"connecting" | "online" | "offline">("connecting");
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const sbRef = React.useRef<ReturnType<typeof createClient> | null>(null);

  const showWarning = text.trim().length > 0 && willBeGhosted(text);

  const load = React.useCallback(async () => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const { data, error } = await sb
      .from("workspace_messages")
      .select("*, sender:users!workspace_messages_sender_id_fkey(id, full_name, avatar_url), vault_resource:workspace_vault!workspace_messages_vault_resource_id_fkey(id, name, original_name, file_size, mime_type)")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true });
    if (!error) setMessages((data ?? []) as Message[]);
  }, [workspaceId]);

  React.useEffect(() => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    load();
    setConnection("connecting");
    let channel: any = null;
    let reconnectTimer: any = null;
    let pollTimer: any = null;
    let consecutiveRealtimeFails = 0;

    function startRealtime() {
      channel = sb
        .channel(`ws-chat-${workspaceId}-${Date.now()}`)
        .on("postgres_changes",
          { event: "INSERT", schema: "public", table: "workspace_messages", filter: `workspace_id=eq.${workspaceId}` },
          async (payload) => {
            const m = payload.new as Message;
            let sender: Message["sender"] = null;
            if (m.sender_id) {
              const { data } = await sb.from("users").select("id, full_name, avatar_url").eq("id", m.sender_id).maybeSingle();
              sender = data ?? null;
            }
            setMessages((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, { ...m, sender }]);
          })
        .subscribe((status: string) => {
          // eslint-disable-next-line no-console
          console.log("[workspace-chat] realtime status:", status);
          if (status === "SUBSCRIBED") {
            setConnection("online");
            consecutiveRealtimeFails = 0;
            // Stop polling once realtime is up
            if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
          }
          if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            setConnection("offline");
            consecutiveRealtimeFails++;
            // After 2 failed attempts, switch to polling fallback
            if (consecutiveRealtimeFails >= 2 && !pollTimer) {
              // eslint-disable-next-line no-console
              console.log("[workspace-chat] realtime failing, switching to 3s polling fallback");
              pollTimer = setInterval(() => load(), 3000);
            }
            // Auto-reconnect after 5s
            if (reconnectTimer) clearTimeout(reconnectTimer);
            reconnectTimer = setTimeout(() => {
              if (channel) sb.removeChannel(channel);
              startRealtime();
            }, 5000);
          }
        });
    }

    startRealtime();

    // Always run a safety poll every 8s — covers missed realtime events
    // (e.g. when the connection is in TIMED_OUT state and no events arrive).
    const safetyPoll = setInterval(() => load(), 8000);

    sb.rpc("mark_workspace_read" as any, { p_workspace_id: workspaceId } as any).then(() => {});

    function onVisible() { if (document.visibilityState === "visible") load(); }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(safetyPoll);
      if (pollTimer) clearInterval(pollTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (channel) sb.removeChannel(channel);
    };
  }, [workspaceId, load]);

  // Manual reconnect (button in the header)
  async function forceReconnect() {
    setConnection("connecting");
    // Force a reload + remount by reloading the page
    if (typeof window !== "undefined") window.location.reload();
  }

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const send = async (vaultResourceId?: string) => {
    const c = text.trim();
    if (!c || sending) return;
    setSending(true);
    setText("");
    const r = await fetch("/api/workspace/send-message", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceId, body: c, vaultResourceId }),
    });
    setSending(false);
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) {
      setText(c);
      setChatError(data?.error ?? "Failed to send");
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (isLocked) return;
    if (file.size > 25 * 1024 * 1024) {
      setChatError(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max is 25 MB.`);
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("workspaceId", workspaceId);
      const upRes = await fetch("/api/workspace/vault/upload", { method: "POST", body: fd });
      const upText = await upRes.text();
      let upData: any = {};
      try { upData = upText ? JSON.parse(upText) : {}; } catch { upData = { error: upText }; }
      if (!upRes.ok || upData.ok === false) {
        setChatError(`Upload failed: ${upData?.error ?? upRes.statusText ?? "Unknown error"}`);
        return;
      }
      const note = `Shared a file: ${upData.originalName ?? upData.name}`;
      const sendRes = await fetch("/api/workspace/send-message", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, body: note, vaultResourceId: upData.id }),
      });
      const sendText = await sendRes.text();
      let sendData: any = {};
      try { sendData = sendText ? JSON.parse(sendText) : {}; } catch { sendData = { error: sendText }; }
      if (!sendRes.ok || sendData.ok === false) {
        setChatError(`Message failed: ${sendData?.error ?? sendRes.statusText ?? "Unknown error"}`);
      }
    } finally {
      setUploading(false);
    }
  };

  const downloadVault = async (vaultId: string) => {
    setDownloadingId(vaultId);
    try {
      const r = await fetch("/api/workspace/vault/sign", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ vaultId }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) { setChatError(data?.error ?? "Failed"); return; }
      // Fetch as blob + download — keeps the signed URL out of the
      // browser address bar / history.
      const { downloadFromSignedUrl } = await import("@/lib/safe-download");
      await downloadFromSignedUrl(data.url, data.name ?? "download");
    } catch (e) {
      setChatError(`Download failed: ${(e as Error).message}`);
    } finally {
      setDownloadingId(null);
    }
  };

  const inputDisabled = isLocked || sending;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-2">
          <Eye className="h-3.5 w-3.5 text-primary" />
          <span><strong className="text-foreground">Live-monitored chat.</strong> Sharing personal contact details or off-platform payment info is prohibited and will be auto-blocked.</span>
        </div>
        <div className="flex items-center gap-1.5">
          <ConnectionBadge status={connection} />
          {connection === "offline" && (
            <Button type="button" variant="ghost" size="sm" className="h-5 px-1.5 text-[10px]" onClick={forceReconnect} title="Reload to reconnect realtime">
              <RefreshCw className="h-3 w-3" /> Reconnect
            </Button>
          )}
        </div>
      </div>

      {isLocked && (
        <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
          {awaitingFunding ? (
            isBuyer ? (
              <span>
                <ShieldAlert className="mr-1 inline h-3.5 w-3.5 text-amber-600" />
                <strong className="text-amber-700">Fund escrow</strong> to open chat and start work. The employee can&apos;t see new messages until you do.
              </span>
            ) : (
              <span>
                <Lock className="mr-1 inline h-3.5 w-3.5" />
                <strong className="text-foreground">Awaiting funding…</strong> Previous conversation, if any, is available here but no new messages can be sent until the buyer funds the escrow.
              </span>
            )
          ) : (
            <span>Chat is locked — workspace is {isAdmin ? "closed for admin review" : "completed"}. Messages are read-only.</span>
          )}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3" style={{ minHeight: 280 }}>
        {messages.length === 0 && (
          <p className="py-8 text-center text-xs text-muted-foreground">
            No messages yet — say hi 👋
          </p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === currentUserId;
          const ghostForMe = m.is_ghosted && mine;
          const showToMe = m.is_ghosted && !mine && !isAdmin;
          if (showToMe) return null;
          const senderName = m.sender?.full_name ?? (mine ? "You" : "Counterparty");
          return (
            <div key={m.id} className={cn("flex gap-2", mine ? "flex-row-reverse" : "")}>
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarImage src={m.sender?.avatar_url ?? undefined} className="object-cover" />
                <AvatarFallback>{(senderName ?? "?")[0]}</AvatarFallback>
              </Avatar>
              <div className={cn("max-w-[78%] rounded-2xl px-3 py-2 text-sm", mine ? "bg-primary text-primary-foreground" : "bg-muted")}>
                {!mine && <p className="mb-0.5 text-[10px] font-semibold opacity-70">{senderName}</p>}
                {ghostForMe ? (
                  <div className="flex flex-col gap-1">
                    <p className="inline-flex items-center gap-1 text-xs">
                      <ShieldAlert className="h-3 w-3" />Sent — not delivered
                    </p>
                    <p className="text-[10px] opacity-80">
                      This message was not delivered to the recipient. Sharing personal contact or payment info is not allowed.
                    </p>
                  </div>
                ) : (
                  <>
                    {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                    {m.vault_resource && (
                      <div className={cn("mt-1 flex items-center gap-2 rounded-lg p-2 text-xs", mine ? "bg-primary-foreground/10" : "bg-background border")}>
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
                  </>
                )}
                <p className={cn("mt-1 text-[9px]", mine ? "text-primary-foreground/60" : "text-muted-foreground")}>
                  {timeAgo(m.created_at)}
                  {m.is_flagged && !m.is_ghosted && (
                    <span className="ml-1 inline-flex items-center gap-0.5 text-amber-600">
                      <AlertTriangle className="h-2.5 w-2.5" />flagged
                    </span>
                  )}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {showWarning && !isLocked && (
        <div className="mx-3 mb-1 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-1.5 text-[11px] text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>This message will be blocked — it looks like a phone number, email, or off-platform contact.</span>
        </div>
      )}

      {chatError && (
        <div className="mx-3 mb-1 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-1.5 text-[11px] text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{chatError}</span>
          <button type="button" onClick={() => setChatError(null)} className="text-destructive/60 hover:text-destructive">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); send(); }}
        className="border-t p-2"
      >
        <div className="flex items-end gap-2">
          <input ref={fileInputRef} type="file" hidden onChange={onFile} />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={inputDisabled || uploading}
            onClick={() => fileInputRef.current?.click()}
            title="Attach a file"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
          </Button>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={isLocked ? "Chat is locked" : "Type a message… (Enter to send, Shift+Enter for newline)"}
            disabled={inputDisabled}
            rows={2}
            className="min-h-[60px] flex-1 resize-none"
          />
          <Button type="submit" size="icon" disabled={inputDisabled || !text.trim() || showWarning}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </form>
    </div>
  );
}

function ConnectionBadge({ status }: { status: "connecting" | "online" | "offline" }) {
  if (status === "online") {
    return (
      <Badge variant="success" className="gap-1 text-[9px]">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />Live
      </Badge>
    );
  }
  if (status === "connecting") {
    return (
      <Badge variant="secondary" className="gap-1 text-[9px]">
        <Loader2 className="h-2.5 w-2.5 animate-spin" />Connecting
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="gap-1 text-[9px]">
      <WifiOff className="h-2.5 w-2.5" />Reconnecting
    </Badge>
  );
}
