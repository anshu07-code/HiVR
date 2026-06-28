"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, MessageSquare, Briefcase, ClipboardList } from "lucide-react";

export function ApplicantActions({ applicantId, status, userId, jobId }: { applicantId: string; status: string; userId: string; jobId: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  async function update(action: "shortlist" | "reject" | "interview" | "offer" | "reset") {
    setBusy(action); setErr(null);
    try {
      const res = await fetch(`/api/business/applicants/${applicantId}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data?.error ?? "Failed"); return; }
      if (data?.redirectTo) {
        router.push(data.redirectTo);
        return;
      }
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {err && <span className="text-xs text-destructive">{err}</span>}
      {status === "pending" && (
        <>
          <Button variant="gradient" size="sm" disabled={busy !== null} onClick={() => update("shortlist")}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Shortlist
          </Button>
          <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => update("interview")}>
            <MessageSquare className="h-3.5 w-3.5" /> Interview
          </Button>
          <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => update("reject")}>
            <XCircle className="h-3.5 w-3.5" /> Reject
          </Button>
        </>
      )}
      {status === "shortlisted" && (
        <>
          <Button variant="gradient" size="sm" disabled={busy !== null} onClick={() => update("interview")}>
            <MessageSquare className="h-3.5 w-3.5" /> Interview
          </Button>
          <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => update("offer")}>
            <Briefcase className="h-3.5 w-3.5" /> Send offer
          </Button>
          <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => update("reject")}>
            <XCircle className="h-3.5 w-3.5" /> Reject
          </Button>
        </>
      )}
      {status === "interviewing" && (
        <>
          <Button variant="gradient" size="sm" disabled={busy !== null} onClick={() => update("offer")}>
            <Briefcase className="h-3.5 w-3.5" /> Send offer
          </Button>
          <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => update("reject")}>
            <XCircle className="h-3.5 w-3.5" /> Reject
          </Button>
        </>
      )}
      {(status === "rejected" || status === "hired") && (
        <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => update("reset")}>
          <ClipboardList className="h-3.5 w-3.5" /> Move to pending
        </Button>
      )}
    </div>
  );
}
