"use client";

import * as React from "react";
import { MessageSquareText, X, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function FeedbackButton() {
  const [open, setOpen] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [done, setDone] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!msg.trim()) return;
    setSending(true);
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: msg.trim(), page: window.location.pathname }),
      });
      setDone(true);
    } catch {}
    setSending(false);
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="fixed bottom-6 left-6 z-40 flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-xs font-medium text-muted-foreground shadow-lg transition-colors hover:bg-muted hover:text-foreground md:bottom-8 md:left-8">
        <MessageSquareText className="h-3.5 w-3.5" />
        Feedback
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm p-4 md:items-center" onClick={() => { if (!sending) setOpen(false); }}>
          <div className="relative w-full max-w-md rounded-2xl border bg-card p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <button type="button" onClick={() => { if (!sending) setOpen(false); }}
              className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted">
              <X className="h-4 w-4" />
            </button>

            {done ? (
              <div className="py-8 text-center">
                <MessageSquareText className="mx-auto h-10 w-10 text-primary" />
                <p className="mt-3 font-semibold">Thanks for your feedback!</p>
                <p className="mt-1 text-sm text-muted-foreground">It helps us build a better HiVR.</p>
                <Button size="sm" className="mt-4" onClick={() => { setOpen(false); setDone(false); setMsg(""); }}>Close</Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <h2 className="font-display text-lg font-semibold">Send Feedback</h2>
                  <p className="text-sm text-muted-foreground">Help us improve HiVR. Tell us what you love, what&apos;s broken, or what you&apos;d like to see.</p>
                </div>
                <Textarea value={msg} onChange={e => setMsg(e.target.value)}
                  placeholder="Your feedback..."
                  className="min-h-[120px]" required />
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)} disabled={sending}>Cancel</Button>
                  <Button type="submit" size="sm" disabled={!msg.trim() || sending}>
                    {sending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                    <Send className="mr-1.5 h-3.5 w-3.5" />
                    Send
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
