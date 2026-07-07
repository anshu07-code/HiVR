"use client";

import * as React from "react";
import { X, Lightbulb, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

export function SuggestCategoryModal() {
  const [open, setOpen] = React.useState(false);
  const [domain, setDomain] = React.useState("");
  const [subcategories, setSubcategories] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [done, setDone] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!domain.trim() || !subcategories.trim()) return;
    setSending(true);
    try {
      await fetch("/api/suggest-category", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain: domain.trim(), subcategories: subcategories.trim() }),
      });
      setDone(true);
    } catch {}
    setSending(false);
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full border border-dashed border-primary/40 bg-primary/5 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10">
        <Lightbulb className="h-4 w-4" />
        Suggest a category
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => { if (!sending) setOpen(false); }}>
          <div className="relative w-full max-w-md rounded-2xl border bg-card p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <button type="button" onClick={() => { if (!sending) setOpen(false); }}
              className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted">
              <X className="h-4 w-4" />
            </button>

            {done ? (
              <div className="py-8 text-center">
                <Lightbulb className="mx-auto h-10 w-10 text-primary" />
                <p className="mt-3 font-semibold">Thanks for your suggestion!</p>
                <p className="mt-1 text-sm text-muted-foreground">We&apos;ll review it and consider adding this category.</p>
                <Button size="sm" className="mt-4" onClick={() => { setOpen(false); setDone(false); setDomain(""); setSubcategories(""); }}>Close</Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <h2 className="font-display text-lg font-semibold">Suggest a Category</h2>
                  <p className="text-sm text-muted-foreground">Tell us what domain you&apos;d like to see on HiVR and what subcategories it should include.</p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Domain / Category name</label>
                  <Input value={domain} onChange={e => setDomain(e.target.value)} placeholder="e.g. Blockchain & Web3" required />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Subcategories (one per line)</label>
                  <Textarea value={subcategories} onChange={e => setSubcategories(e.target.value)}
                    placeholder="e.g. Smart Contract Development&#10;DApp Frontend&#10;Solidity Auditing&#10;DeFi Consulting"
                    className="min-h-[120px]" required />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)} disabled={sending}>Cancel</Button>
                  <Button type="submit" size="sm" disabled={!domain.trim() || !subcategories.trim() || sending}>
                    {sending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                    Submit suggestion
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
