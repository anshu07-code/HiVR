"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, Scale, Send, Loader2 } from "lucide-react";

export function DisputeActions({
  disputeId, contractId, status, employeeName, raisedByRole,
}: { disputeId: string; contractId: string; status: string; employeeName: string; raisedByRole: "business" | "employee" }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  async function resolve(resolution: "resolved_business" | "resolved_employee" | "split", notes: string) {
    setBusy(resolution); setErr(null);
    try {
      const res = await fetch(`/api/business/disputes/${disputeId}/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resolution, notes }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data?.error ?? "Failed"); setBusy(null); return; }
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Resolve</CardTitle>
        <CardDescription>You can resolve this dispute now, or wait for auto-decide.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {err && <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">{err}</p>}
        <p className="text-xs text-muted-foreground">Resolving in your favour (or splitting) will release funds accordingly and may add a strike to the employee.</p>
        <div className="grid grid-cols-1 gap-2">
          <Button variant="gradient" size="sm" disabled={busy !== null} onClick={() => {
            const notes = prompt(`Release the funds to your business? Briefly note why:`, "Resolved in our favour — work didn't meet the agreed spec.");
            if (notes !== null) resolve("resolved_business", notes);
          }}>
            {busy === "resolved_business" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Release funds to me
          </Button>
          <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => {
            const notes = prompt(`Release the funds to ${employeeName}? Briefly note why:`, "Resolved in their favour — work met the agreed spec.");
            if (notes !== null) resolve("resolved_employee", notes);
          }}>
            {busy === "resolved_employee" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
            Release funds to {employeeName.split(" ")[0]}
          </Button>
          <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => {
            const notes = prompt("Split 50/50? Briefly note why: ", "Both parties contributed — split is fair.");
            if (notes !== null) resolve("split", notes);
          }}>
            {busy === "split" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Scale className="h-3.5 w-3.5" />}
            Split 50/50
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
