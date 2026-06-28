"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Send, Loader2, Mail } from "lucide-react";

const ROLES = [
  { value: "owner",               label: "Owner / Proprietor" },
  { value: "director",            label: "Director" },
  { value: "authorised_signatory", label: "Authorised signatory" },
  { value: "hr",                  label: "HR / People ops" },
  { value: "manager",             label: "Manager" },
  { value: "other",               label: "Other" },
];

export function InviteMemberForm({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setErr(null); setOk(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/business/team/invite", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setErr(data?.error ?? "Failed to send invite"); setBusy(false); return; }
      setOk(`Invite sent to ${data.email}`);
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[1fr,180px,auto]">
      <div className="space-y-1">
        <Label htmlFor="email" className="sr-only">Email</Label>
        <Input id="email" name="email" type="email" required placeholder="teammate@yourcompany.com" disabled={disabled || busy} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="role" className="sr-only">Role</Label>
        <select id="role" name="role" required defaultValue="hr" disabled={disabled || busy} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
          {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>
      <Button type="submit" variant="gradient" disabled={disabled || busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {busy ? "Sending..." : "Send invite"}
      </Button>
      {err && <p className="sm:col-span-3 text-xs text-destructive">{err}</p>}
      {ok && <p className="sm:col-span-3 text-xs text-emerald-600">{ok}</p>}
    </form>
  );
}
