"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { X, Loader2 } from "lucide-react";

export function RemoveMemberButton({ memberId, memberName, isInvite }: { memberId: string; memberName: string; isInvite?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function remove() {
    const confirmText = isInvite
      ? `Cancel the invite for ${memberName}?`
      : `Remove ${memberName} from the team? They'll lose access to ${isInvite ? "the business" : "all business contracts"} on their next sign-in.`;
    if (!confirm(confirmText)) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/business/team/${memberId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setErr(data?.error ?? "Failed"); setBusy(false); return; }
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="ghost" size="sm" onClick={remove} disabled={busy}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
        {isInvite ? "Cancel invite" : "Remove"}
      </Button>
      {err && <span className="text-xs text-destructive">{err}</span>}
    </div>
  );
}
