"use client";

/**
 * Chat thread with realtime updates and contact-info send gate.
 *
 * - Optimistic send: messages appear instantly, then a server POST inserts
 *   the canonical row and broadcasts via Supabase realtime.
 * - When the server returns { blocked: true }, we replace the optimistic
 *   bubble with a "blocked attempt" placeholder and show the warning toast.
 * - New messages arriving via realtime subscription are appended and the
 *   thread auto-scrolls to the bottom (unless the user has scrolled up).
 */

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, AlertTriangle, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type Msg = {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  blocked?: boolean;
  flagged_for_contact_info?: boolean;
  pending?: boolean;
};

export function ChatThread({
  contractId, currentUserId, otherUserName, initialMessages,
}: { contractId: string; currentUserId: string; otherUserName: string; initialMessages: Msg[] }) {
  const [messages, setMessages] = React.useState<Msg[]>(initialMessages);
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [warning, setWarning] = React.useState<string | null>(null);
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const stickyBottomRef = React.useRef(true);

  // Auto-scroll to bottom on new messages (unless user scrolled away).
  React.useEffect(() => {
    if (!scrollerRef.current) return;
    if (stickyBottomRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [messages.length]);

  // Subscribe to realtime inserts on messages for this contract.
  React.useEffect(() => {
    const sb = createClient();
    const channel = sb
      .channel(`thread:${contractId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `contract_id=eq.${contractId}` },
        (payload: any) => {
          const m = payload?.new as Msg;
          if (!m) return;
          setMessages((prev) => {
            // Avoid duplicates (optimistic send echoes via realtime)
            if (prev.some((p) => p.id === m.id)) return prev;
            return [...prev, m];
          });
        },
      )
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [contractId]);

  function onScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
    stickyBottomRef.current = distFromBottom < 60;
  }

  async function send() {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true); setErr(null); setWarning(null);

    // Optimistic
    const optimistic: Msg = {
      id: `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sender_id: currentUserId,
      content,
      created_at: new Date().toISOString(),
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft("");

    try {
      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contract_id: contractId, content }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data?.error ?? "Failed to send");
        // Remove the optimistic row
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        return;
      }
      if (data?.blocked) {
        // Replace optimistic with the blocked attempt row
        setMessages((prev) => prev.map((m) => m.id === optimistic.id ? {
          ...m,
          pending: false,
          content: "[blocked: contact-info attempt]",
          blocked: true,
          flagged_for_contact_info: true,
        } : m));
        setWarning(data?.reason ?? "This message was blocked.");
        if (data?.suspended) {
          setWarning("Your account was suspended due to repeated contact-info share attempts.");
        }
        return;
      }
      // Replace optimistic with the canonical row
      if (data?.message?.id) {
        setMessages((prev) => prev.map((m) => m.id === optimistic.id ? { ...(data.message as Msg), pending: false } : m));
      }
    } catch (e: any) {
      setErr(e?.message ?? "Failed");
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Cmd/Ctrl+Enter to send
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      send();
    }
  }

  return (
    <>
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="flex-1 space-y-3 overflow-y-auto bg-muted/20 p-4"
      >
        {messages.length === 0 && (
          <div className="grid h-full place-items-center text-center text-sm text-muted-foreground">
            <div>
              <ShieldCheck className="mx-auto mb-2 h-6 w-6 text-emerald-500" />
              <p>Say hi to {otherUserName} to break the ice.</p>
              <p className="mt-1 text-xs">Keep all work on HiVR to stay protected by escrow + dispute support.</p>
            </div>
          </div>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === currentUserId;
          return (
            <div
              key={m.id}
              className={cn("flex", mine ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[78%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                  mine ? "bg-primary text-primary-foreground" : "bg-card border",
                  m.blocked && "border-destructive/40 bg-destructive/5 text-destructive italic",
                )}
              >
                {m.blocked ? (
                  <span className="inline-flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {m.content}
                  </span>
                ) : (
                  <span className="whitespace-pre-wrap break-words">{m.content}</span>
                )}
                <div className={cn(
                  "mt-1 text-[10px]",
                  mine ? "text-primary-foreground/70" : "text-muted-foreground",
                  m.blocked && "text-destructive/70",
                )}>
                  {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {m.pending && " · sending…"}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {(err || warning) && (
        <div className="border-t bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          {err ?? warning}
        </div>
      )}

      <div className="border-t bg-card p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={`Message ${otherUserName}…`}
            rows={2}
            className="min-h-[44px] flex-1 resize-none"
            disabled={sending}
          />
          <Button onClick={send} disabled={!draft.trim() || sending} size="icon" variant="gradient">
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">Press ⌘/Ctrl+Enter to send. HiVR scans messages for off-platform contact info.</p>
      </div>
    </>
  );
}
