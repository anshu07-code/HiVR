"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus, X, Loader2, FileText } from "lucide-react";

export function AddEvidenceButton({ disputeId }: { disputeId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState<string>("message_log");
  const [content, setContent] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function submit() {
    const text = content.trim();
    if (!text) { setErr("Add a description."); return; }
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/business/disputes/${disputeId}/evidence`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, content: text }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data?.error ?? "Failed"); setBusy(false); return; }
      setContent(""); setOpen(false);
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" /> Add evidence
      </Button>
    );
  }

  return (
    <div className="w-full rounded-lg border bg-card p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Add evidence</h3>
        <Button size="icon" variant="ghost" onClick={() => { setOpen(false); setErr(null); setContent(""); }}><X className="h-4 w-4" /></Button>
      </div>
      <div className="space-y-2">
        <div className="space-y-1">
          <Label htmlFor="evidence-type">Type</Label>
          <select id="evidence-type" value={type} onChange={(e) => setType(e.target.value)} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
            <option value="message_log">Message log</option>
            <option value="deliverable">Deliverable</option>
            <option value="spec_quote">Spec / agreement quote</option>
            <option value="third_party">Third-party attestation</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="evidence-content">Description</Label>
          <Textarea id="evidence-content" rows={4} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Explain what this evidence shows and why it supports your position. Be specific." />
        </div>
        {err && <p className="text-xs text-destructive">{err}</p>}
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button size="sm" variant="gradient" onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
            Submit
          </Button>
        </div>
      </div>
    </div>
  );
}
