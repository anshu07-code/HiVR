"use client";

import * as React from "react";
import { Send, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate, timeAgo } from "@/lib/utils";

type Msg = { id: string; sender_id: string; content: string; blocked: boolean; created_at: string };

export function ChatPanel({ contractId, initialMessages, selfId }: { contractId: string; initialMessages: Msg[]; selfId: string }) {
  const [messages, setMessages] = React.useState<Msg[]>(initialMessages);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [blockedReason, setBlockedReason] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => { scrollRef.current?.scrollTo({ top: 1e6, behavior: "smooth" }); }, [messages]);

  // Subscribe to realtime
  React.useEffect(() => {
    const sb = (window as any).hivrSb ?? null;
    if (!sb) return;
    const channel = sb
      .channel(`contract:${contractId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `contract_id=eq.${contractId}` }, (payload: any) => {
        setMessages(m => [...m, payload.new as Msg]);
      })
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [contractId]);

  async function send() {
    const c = input.trim();
    if (!c) return;
    setBlockedReason(null);
    setSending(true);
    setInput("");
    const res = await fetch("/api/messages/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contract_id: contractId, content: c }),
    });
    const json = await res.json();
    setSending(false);
    if (json.blocked) {
      setBlockedReason(json.reason);
    } else if (json.message) {
      setMessages(m => [...m, json.message]);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chat</CardTitle>
        <p className="text-xs text-muted-foreground">Contact-info sharing is auto-blocked. Stay on-platform to keep escrow and dispute support.</p>
      </CardHeader>
      <CardContent>
        <div ref={scrollRef} className="max-h-96 space-y-2 overflow-y-auto rounded-md border bg-muted/20 p-3">
          {messages.length === 0 && <p className="text-center text-sm text-muted-foreground">No messages yet — say hi 👋</p>}
          {messages.map(m => (
            <div key={m.id} className={cn("flex", m.sender_id === selfId ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                m.blocked ? "bg-destructive/10 text-destructive" :
                m.sender_id === selfId ? "bg-primary text-primary-foreground" : "bg-muted",
              )}>
                {m.blocked ? <span className="inline-flex items-center gap-1"><ShieldAlert className="h-3.5 w-3.5" />blocked</span> : m.content}
                <div className={cn("mt-0.5 text-[10px]", m.sender_id === selfId ? "text-primary-foreground/70" : "text-muted-foreground")}>
                  {timeAgo(m.created_at)}
                </div>
              </div>
            </div>
          ))}
        </div>
        {blockedReason && (
          <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <p className="font-medium text-destructive">Message blocked</p>
            <p className="mt-1 text-muted-foreground">{blockedReason}</p>
          </div>
        )}
        <form
          onSubmit={e => { e.preventDefault(); send(); }}
          className="mt-3 flex items-center gap-2"
        >
          <Input value={input} onChange={e => setInput(e.target.value)} placeholder="Type a message…" disabled={sending} />
          <Button type="submit" size="icon" disabled={!input || sending}><Send className="h-4 w-4" /></Button>
        </form>
      </CardContent>
    </Card>
  );
}
