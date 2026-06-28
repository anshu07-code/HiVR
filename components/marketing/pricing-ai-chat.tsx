"use client";

import * as React from "react";
import { Sparkles, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Pricing AI chat for /pricing.
 *
 * The header "HiVR AI - Your Pricing Agent" is rendered INSIDE this component.
 * The page-level heading above the component reads "Still having queries?
 * Resolve here" so the user sees a clear prompt to engage.
 *
 * Height is fixed (380px) so the chat ends at the same level as the last
 * FAQ card on the left.
 *
 * Backed by /api/assistant/ask with mode=local (no LLM, no API key).
 */

const TEMPLATES: { label: string; q: string }[] = [
  { label: "Cheapest plan?",            q: "What's the cheapest plan if I only need to hire occasionally?" },
  { label: "Quarterly vs Yearly",       q: "What's the difference between quarterly and yearly?" },
  { label: "Yearly savings",            q: "How much do I save with yearly vs monthly?" },
  { label: "How does escrow work?",     q: "How does escrow work?" },
  { label: "Can I cancel anytime?",     q: "Can I cancel my subscription anytime?" },
  { label: "What does featured mean?",  q: "What does featured mean?" },
  { label: "Free trial?",               q: "Is there a free trial?" },
  { label: "Business plan?",            q: "Do you have a business plan?" },
  { label: "How do I get paid?",        q: "How do I get paid as an employee?" },
  { label: "Skill test info",           q: "How do skill tests work?" },
];

const FOLLOW_UPS: { label: string; q: string }[] = [
  { label: "Compare plans",          q: "Compare the buyer plans side by side" },
  { label: "Refund policy",          q: "What's the refund policy?" },
  { label: "How escrow works",       q: "How does escrow work?" },
  { label: "Talk to support",        q: "I want to talk to a human" },
];

type Msg = { role: "user" | "assistant"; content: string; pending?: boolean };

export function PricingAIChat() {
  const [msgs, setMsgs] = React.useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Hi! I can answer any HiVR pricing question — plans, fees, features, billing cycles, or which plan fits you. Tap a question below or type your own.",
    },
  ]);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: 1e6, behavior: "smooth" });
  }, [msgs]);

  async function ask(q: string) {
    const text = q.trim();
    if (!text || busy) return;
    setInput("");
    setMsgs(m => [...m, { role: "user", content: text }, { role: "assistant", content: "", pending: true }]);
    setBusy(true);
    try {
      const res = await fetch("/api/assistant/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ q: text, mode: "local" }),
      });
      const json = await res.json();
      const answer = json.answer || json.error || "Sorry, I couldn't answer that.";
      setMsgs(m => m.map((x, i) => (i === m.length - 1 ? { role: "assistant", content: answer } : x)));
    } catch {
      setMsgs(m => m.map((x, i) => (i === m.length - 1 ? { role: "assistant", content: "Network error. Try again." } : x)));
    }
    setBusy(false);
    inputRef.current?.focus();
  }

  return (
    <div className="flex h-full w-full min-h-0 flex-col overflow-hidden rounded-lg border bg-card">
      {/* Internal header */}
      <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2.5">
        <div className="grid h-7 w-7 place-items-center rounded-full bg-primary/15 text-primary">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
        <p className="text-sm font-semibold">HiVR AI &mdash; Your Pricing Agent</p>
      </div>

      {/* Message thread + chips */}
      <div ref={scrollRef} className="scrollbar-hide flex-1 space-y-2 overflow-y-auto p-3 text-sm">
        {msgs.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[88%] whitespace-pre-wrap rounded-2xl px-3 py-2 leading-relaxed",
                m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
              )}
            >
              {m.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : m.content}
            </div>
          </div>
        ))}

        {/* Initial question chips */}
        {!busy && msgs.filter(m => m.role === "user").length === 0 && (
          <div className="pt-1">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Quick questions
            </p>
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATES.map(t => (
                <button
                  key={t.q}
                  type="button"
                  onClick={() => ask(t.q)}
                  className="rounded-full border bg-background px-3 py-1 text-xs text-foreground transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Follow-up suggestions after the assistant answers */}
        {!busy &&
          msgs.length > 1 &&
          msgs[msgs.length - 1].role === "assistant" &&
          !msgs[msgs.length - 1].pending && (
            <div className="pt-1">
              <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Related
              </p>
              <div className="flex flex-wrap gap-1.5">
                {FOLLOW_UPS.map(t => (
                  <button
                    key={t.q}
                    type="button"
                    onClick={() => ask(t.q)}
                    className="rounded-full border bg-background px-3 py-1 text-xs text-foreground transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}
      </div>

      {/* Input */}
      <form
        onSubmit={e => {
          e.preventDefault();
          ask(input);
        }}
        className="flex items-center gap-2 border-t bg-background p-2"
      >
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask about plans, fees, features..."
          className="flex h-9 flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          disabled={busy}
        />
        <Button type="submit" size="sm" disabled={busy || !input.trim()} className="h-9 gap-1">
          <Send className="h-3.5 w-3.5" />
          Ask
        </Button>
      </form>
    </div>
  );
}
