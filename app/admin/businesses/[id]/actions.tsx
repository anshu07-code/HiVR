"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Ban, ShieldCheck, AlertTriangle, Loader2, RefreshCcw, CheckCircle2 } from "lucide-react";

export function AdminBusinessActions({
  businessId, isSuspended, kycStatus, ownerName, businessName,
}: { businessId: string; isSuspended: boolean; kycStatus: string; ownerName: string; businessName: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);

  async function act(action: "suspend" | "unsuspend" | "verify-kyc" | "reject-kyc") {
    setBusy(action); setErr(null); setOk(null);

    let reason: string | null = null;
    if (action === "suspend") {
      reason = prompt(`Suspend ${businessName}? They won't be able to send offers / create contracts / accept invites.\n\nReason (will be shown to the business):`, "Repeated TOS violations");
      if (reason === null) { setBusy(null); return; }
    } else if (action === "reject-kyc") {
      reason = prompt(`Reject KYC for ${businessName}?\n\nReason (will be shown to the business):`, "Documents don't match the entity");
      if (reason === null) { setBusy(null); return; }
    }

    try {
      const res = await fetch(`/api/admin/businesses/${businessId}/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data?.error ?? "Failed"); setBusy(null); return; }
      setOk(data?.message ?? "Done");
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
        <CardTitle className="text-base">Admin actions</CardTitle>
        <CardDescription>Trust & Safety controls</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {err && <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">{err}</p>}
        {ok && <p className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-xs text-emerald-700 dark:text-emerald-400">{ok}</p>}

        {kycStatus !== "verified" && (
          <Button variant="gradient" size="sm" className="w-full" disabled={busy !== null} onClick={() => act("verify-kyc")}>
            {busy === "verify-kyc" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            Approve KYC
          </Button>
        )}
        {(kycStatus === "pending" || kycStatus === "in_review") && (
          <Button variant="outline" size="sm" className="w-full" disabled={busy !== null} onClick={() => act("reject-kyc")}>
            {busy === "reject-kyc" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            Reject KYC
          </Button>
        )}

        {isSuspended ? (
          <Button variant="outline" size="sm" className="w-full" disabled={busy !== null} onClick={() => act("unsuspend")}>
            {busy === "unsuspend" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Lift suspension
          </Button>
        ) : (
          <Button variant="destructive" size="sm" className="w-full" disabled={busy !== null} onClick={() => act("suspend")}>
            {busy === "suspend" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
            Suspend business
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
