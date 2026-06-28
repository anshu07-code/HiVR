"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Phone, Loader2, AlertCircle } from "lucide-react";

export function StartCallForm({
  businessId, defaultTo, contractId, members, defaultName,
}: { businessId: string; defaultTo: string; contractId?: string; members: any[]; defaultName?: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setErr(null); setDone(false);
    const fd = new FormData(e.currentTarget);
    fd.set("business_id", businessId);
    if (contractId) fd.set("contract_id", contractId);
    try {
      const res = await fetch("/api/business/calls/initiate", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) { setErr(data?.error ?? "Failed to start call"); setBusy(false); return; }
      setDone(true);
      setTimeout(() => router.push(`/business/calls/${data.callId}`), 800);
    } catch (e: any) {
      setErr(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (members.length === 0) {
    return (
      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-300">
        <AlertCircle className="mr-1 inline h-3.5 w-3.5" />
        You don't have any active team members yet. <a href="/business/applicants" className="underline">Hire someone</a> first.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="to">Recipient</Label>
        <select id="to" name="to" required defaultValue={defaultTo} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
          <option value="">Pick a team member</option>
          {members.map((m: any) => (
            <option key={m.user_id} value={m.user?.id}>{m.user?.full_name}{m.user?.trust_tier ? ` (${m.user.trust_tier})` : ""}</option>
          ))}
        </select>
        {defaultName && <p className="text-xs text-muted-foreground">Pre-selected based on the contract you're viewing.</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="topic">Call topic (visible to both parties)</Label>
        <Input id="topic" name="topic" required minLength={3} maxLength={200} placeholder="e.g. Q3 deliverable walkthrough" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="agenda">Agenda (optional)</Label>
        <Textarea id="agenda" name="agenda" rows={3} maxLength={2000} placeholder="1. Review the deliverable&#10;2. Discuss next milestone&#10;3. Q&A" />
      </div>

      {err && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">{err}</p>
      )}
      {done && (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-sm text-emerald-700 dark:text-emerald-400">
          Call initiated! Redirecting to the call room...
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button type="submit" variant="gradient" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
          {busy ? "Initiating..." : "Call now"}
        </Button>
      </div>
    </form>
  );
}
