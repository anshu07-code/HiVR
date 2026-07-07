"use client";

/**
 * AssistantLauncher — the floating "Ask HiVR" chat bubble.
 *
 * Performance notes:
 *  - Originally used `framer-motion` (~50KB gzipped) for the open/close
 *    animation. Replaced with pure CSS transitions so this component
 *    adds zero animation-library overhead to every page.
 *  - Lazy-mounts the chat panel only when first opened (the button
 *    stays in the DOM but the panel doesn't render until `mounted`).
 *  - The launcher button itself is a regular <button> with a CSS
 *    scale-on-active class.
 */

import * as React from "react";
import { X, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string; pending?: boolean };

export function AssistantLauncher() {
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [messages, setMessages] = React.useState<Msg[]>([{
    role: "assistant",
    content: "Hey! I'm HiVR's assistant. Ask me anything about how the platform works — escrow, fees, verification, categories, disputes.",
  }]);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Defer mounting the chat panel DOM until first open so initial
  // page render doesn't pay for it.
  React.useEffect(() => {
    if (open && !mounted) setMounted(true);
  }, [open, mounted]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: 1e6, behavior: "smooth" });
  }, [messages, open]);

  async function send() {
    const q = input.trim();
    if (!q) return;
    setInput("");
    setMessages(m => [...m, { role: "user", content: q }, { role: "assistant", content: "", pending: true }]);
    setSending(true);
    try {
      const res = await fetch("/api/assistant/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ q, mode: "local" }),
      });
      const json = await res.json();
      setMessages(m => {
        const copy = [...m];
        const last = copy[copy.length - 1];
        if (last?.pending) copy[copy.length - 1] = { role: "assistant", content: json.answer ?? "Sorry, I couldn't find an answer." };
        return copy;
      });
    } catch {
      setMessages(m => {
        const copy = [...m];
        const last = copy[copy.length - 1];
        if (last?.pending) copy[copy.length - 1] = { role: "assistant", content: "Something went wrong. Please try again." };
        return copy;
      });
    }
    setSending(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label={open ? "Close HiVR assistant" : "Open HiVR assistant"}
        className="fixed bottom-24 right-4 z-50 grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform duration-150 active:scale-90 hover:shadow-xl md:bottom-6"
      >
        {open ? <X className="h-5 w-5" /> : (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 5v14M4 12h10M20 5v14" />
            <circle cx="20" cy="5" r="1.6" fill="currentColor" />
          </svg>
        )}
      </button>

      {mounted && (
        <div
          className={cn(
            "fixed bottom-40 right-4 z-50 flex h-[480px] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border bg-card shadow-xl transition-all duration-200 ease-out md:bottom-24",
            open
              ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
              : "pointer-events-none translate-y-3 scale-[0.98] opacity-0"
          )}
          aria-hidden={!open}
        >
          <header className="flex items-center gap-2 border-b bg-muted/30 px-4 py-3">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-sm ring-1 ring-primary/20">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 5v14M4 12h10M20 5v14" />
                <circle cx="20" cy="5" r="1.6" fill="currentColor" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-semibold">Ask HiVR</div>
            </div>
          </header>
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3 text-sm">
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn("flex gap-2", m.role === "user" ? "justify-end" : "justify-start")}
              >
                {m.role === "assistant" && (
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="bg-primary text-primary-foreground text-[10px]">
                      AI
                    </AvatarFallback>
                  </Avatar>
                )}
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-3 py-2",
                    m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                  )}
                >
                  {m.pending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    m.content
                  )}
                </div>
              </div>
            ))}
          </div>
          <form
            onSubmit={e => {
              e.preventDefault();
              send();
            }}
            className="flex items-center gap-2 border-t bg-background p-2"
          >
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask anything…"
              className="h-9"
              disabled={sending}
            />
            <Button type="submit" size="icon" disabled={!input || sending}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
