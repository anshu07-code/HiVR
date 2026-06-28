"use client";

import * as React from "react";
import { X, Send, Loader2, MessageCircle, AlertCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";
import { timeAgo } from "@/lib/utils";

type Message = {
  id: string;
  task_id: string;
  sender_id: string;
  receiver_id: string;
  body: string;
  created_at: string;
};

export function TaskChatDialog({
  taskId, otherUserId, otherUserName, otherUserAvatar, currentUserId, onClose,
}: {
  taskId: string;
  otherUserId: string;
  otherUserName: string;
  otherUserAvatar: string | null;
  currentUserId: string;
  onClose: () => void;
}) {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  const loadMessages = React.useCallback(async () => {
    const r = await fetch(`/api/task-messages?task_id=${taskId}&other_id=${otherUserId}`);
    if (r.ok) {
      const d = await r.json();
      if (d.ok) setMessages(d.messages ?? []);
    }
    setLoading(false);
  }, [taskId, otherUserId]);

  React.useEffect(() => { loadMessages(); }, [loadMessages]);

  // Realtime subscription for new messages
  React.useEffect(() => {
    const sb = createClient();
    const channel = sb
      .channel(`task-chat-${taskId}-${otherUserId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "task_messages", filter: `task_id=eq.${taskId}` },
        (payload) => {
          const msg = payload.new as Message;
          if ((msg.sender_id === currentUserId && msg.receiver_id === otherUserId) ||
              (msg.sender_id === otherUserId && msg.receiver_id === currentUserId)) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev;
              return [...prev, msg];
            });
          }
        },
      )
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [taskId, otherUserId, currentUserId]);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    const body = input.trim();
    if (!body) return;
    setSending(true);
    setError(null);
    try {
      const r = await fetch("/api/task-messages", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ task_id: taskId, receiver_id: otherUserId, body }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) { setError(d?.error ?? "Failed"); return; }
      setInput("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  const initial = ((otherUserName ?? "?").split(" ").map((w) => w[0]).slice(0, 2).join("") || "?").toUpperCase();

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex w-full max-w-lg flex-col rounded-xl border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b p-3">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/10">
              <MessageCircle className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">Pre-hiring chat</p>
              <p className="text-[10px] text-muted-foreground">with {otherUserName}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Terms notice */}
        <div className="flex items-start gap-1.5 border-b bg-amber-500/5 px-3 py-2 text-[10px] text-amber-700">
          <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />
          <span>This chat is for pre-hiring queries about this task only. Any suspicious conversation will violate HiVR's Terms. All messages are monitored live by our team.</span>
        </div>

        {/* Messages */}
        <div className="flex-1 space-y-2 overflow-y-auto p-3" style={{ maxHeight: "60vh", minHeight: "300px" }}>
          {loading ? (
            <div className="grid place-items-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="grid place-items-center py-12 text-muted-foreground">
              <MessageCircle className="h-8 w-8 text-muted-foreground/40" />
              <p className="mt-2 text-xs">No messages yet. Say hello!</p>
            </div>
          ) : (
            messages.map((m) => {
              const isMe = m.sender_id === currentUserId;
              return (
                <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                  <div className="flex items-end gap-2 max-w-[80%]">
                    {!isMe && (
                      <Avatar className="h-6 w-6 shrink-0">
                        <AvatarImage src={otherUserAvatar ?? undefined} />
                        <AvatarFallback className="text-[9px]">{initial}</AvatarFallback>
                      </Avatar>
                    )}
                    <div>
                      <div className={`rounded-lg px-3 py-2 text-sm ${
                        isMe ? "bg-primary text-primary-foreground" : "bg-muted"
                      }`}>
                        {m.body}
                      </div>
                      <p className={`mt-0.5 text-[9px] text-muted-foreground ${isMe ? "text-right" : "text-left"}`}>
                        {timeAgo(m.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {error && (
          <p className="flex items-center gap-1 border-t px-3 py-1.5 text-[10px] text-destructive">
            <AlertCircle className="h-3 w-3" />{error}
          </p>
        )}

        {/* Input */}
        <div className="flex items-center gap-2 border-t p-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Type a message..."
            className="h-9 flex-1 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            disabled={sending}
          />
          <Button size="sm" onClick={sendMessage} disabled={sending || !input.trim()}>
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
