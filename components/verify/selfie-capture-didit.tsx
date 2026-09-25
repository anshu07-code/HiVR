"use client";

import * as React from "react";
import { Loader2, AlertTriangle, CheckCircle2, ShieldCheck, ExternalLink, Smartphone, RefreshCw, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

export type DiditSelfieResult = {
  livenessScore: number;
  livenessStatus: "Approved" | "Declined" | "InReview";
  diditSessionId: string;
};

export function SelfieCaptureDidit({
  onComplete,
  onCancel,
}: {
  onComplete: (r: DiditSelfieResult) => void;
  onCancel: () => void;
}) {
  const [phase, setPhase] = React.useState<"intro" | "waiting" | "verifying" | "done" | "declined" | "review">("intro");
  const [error, setError] = React.useState<string | null>(null);
  const [score, setScore] = React.useState(0);
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  React.useEffect(() => {
    const pending = sessionStorage.getItem("didit_session_id");
    if (pending) {
      setSessionId(pending);
      setPhase("waiting");
      startPolling(pending);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  function startPolling(sid: string) {
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/didit/decision?session_id=${sid}`);
        if (!res.ok) return;
        const decision = await res.json();
        const liveness = decision.liveness;
        const overall = decision.status;
        if (liveness?.status === "Approved") {
          clearInterval(pollRef.current!);
          setSessionId(sid);
          handleDecision(sid);
        } else if (overall === "Declined" || liveness?.status === "Declined") {
          clearInterval(pollRef.current!);
          setPhase("declined");
          setError("Verification did not pass. Please try again.");
          sessionStorage.removeItem("didit_session_id");
        } else if (overall === "InReview" || overall === "Review" || overall === "PendingReview") {
          clearInterval(pollRef.current!);
          setSessionId(sid);
          handleDecision(sid);
        }
      } catch { /* poll silently */ }
    }, 3000);
  }

  async function handleDecision(sid: string) {
    setPhase("verifying");
    try {
      const res = await fetch(`/api/didit/decision?session_id=${sid}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to get decision" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const decision = await res.json();
      const liveness = decision.liveness;
      const overall = decision.status;
      if (liveness?.status === "Approved") {
        const s = liveness.score ?? 0;
        setScore(s);
        setPhase("done");
        sessionStorage.removeItem("didit_session_id");
        onComplete({
          livenessScore: Math.round(s),
          livenessStatus: "Approved",
          diditSessionId: sid,
        });
      } else if (overall === "InReview" || overall === "Review" || overall === "PendingReview") {
        const s = liveness?.score ?? 0;
        setScore(s);
        setPhase("review");
        sessionStorage.removeItem("didit_session_id");
        onComplete({
          livenessScore: Math.round(s),
          livenessStatus: "InReview",
          diditSessionId: sid,
        });
      } else if (liveness?.status === "Declined") {
        setPhase("declined");
        setError("Verification did not pass. Please try again.");
        sessionStorage.removeItem("didit_session_id");
      } else {
        setPhase("declined");
        setError("Verification failed. Please try again.");
        sessionStorage.removeItem("didit_session_id");
      }
    } catch (e) {
      setError((e as Error).message);
      setPhase("intro");
    }
  }

  async function startVerification() {
    setPhase("waiting");
    setError(null);
    try {
      const callbackUrl = window.location.origin + window.location.pathname;

      const res = await fetch("/api/didit/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callbackUrl }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Session creation failed" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const session = await res.json();

      setSessionId(session.session_id);
      sessionStorage.setItem("didit_session_id", session.session_id);

      window.open(session.url, "_blank");

      startPolling(session.session_id);
    } catch (e) {
      setError((e as Error).message);
      setPhase("intro");
    }
  }

  function checkNow() {
    if (sessionId) handleDecision(sessionId);
  }

  function retry() {
    if (pollRef.current) clearInterval(pollRef.current);
    setError(null);
    setPhase("intro");
    setSessionId(null);
    sessionStorage.removeItem("didit_session_id");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-lg font-semibold">Identity verification</h3>
          <p className="text-xs text-muted-foreground">
            {phase === "intro" && "Verify your identity through a secure verification page."}
            {phase === "waiting" && "Waiting for you to complete verification on your phone\u2026"}
            {phase === "verifying" && "Checking verification result\u2026"}
            {phase === "done" && "Identity verified \u2713"}
            {phase === "review" && "Under review \u2014 our team will verify shortly"}
            {phase === "declined" && "Verification failed \u2014 try again"}
          </p>
        </div>
        {phase === "done" && <ShieldCheck className="h-4 w-4 text-emerald-500" />}
        {phase === "review" && <Clock className="h-4 w-4 text-amber-500" />}
      </div>

      <div className="relative mx-auto flex aspect-square w-full max-w-md items-center justify-center overflow-hidden rounded-xl border bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5">
        {phase === "intro" && (
          <div className="p-8 text-center">
            <ExternalLink className="mx-auto h-12 w-12 text-primary/60" />
            <p className="mt-3 text-sm text-muted-foreground">
              A new tab will open with a secure verification page.
              Scan the QR code with your phone to complete the process.
            </p>
          </div>
        )}
        {phase === "waiting" && (
          <div className="grid place-items-center p-8 text-center">
            <Smartphone className="mx-auto h-12 w-12 text-primary/60" />
            <p className="mt-3 text-sm font-medium">Scan the QR code with your phone</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Complete the verification on your phone.
              Auto-checks every 3 seconds\u2026
            </p>
            <Button variant="outline" size="sm" className="mt-4" onClick={checkNow}>
              <RefreshCw className="mr-1 h-3 w-3" /> Check status
            </Button>
          </div>
        )}
        {phase === "verifying" && (
          <div className="grid place-items-center p-8 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <p className="mt-3 text-sm text-muted-foreground">Checking verification result\u2026</p>
          </div>
        )}
        {phase === "done" && (
          <div className="grid place-items-center p-8 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
            <p className="mt-2 text-sm font-semibold text-emerald-700">Identity verified</p>
            {score > 0 && (
              <p className="text-xs text-muted-foreground">Score: {score}/100</p>
            )}
          </div>
        )}
        {phase === "review" && (
          <div className="grid place-items-center p-8 text-center">
            <Clock className="mx-auto h-12 w-12 text-amber-500" />
            <p className="mt-2 text-sm font-semibold text-amber-700">Under review</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Your details didn\u2019t fully match. Our team will review and get back to you.
            </p>
          </div>
        )}
      </div>

      {error && (phase === "declined" || phase === "intro") && (
        <p className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/5 p-2 text-xs text-rose-700">
          <AlertTriangle className="h-3.5 w-3.5" />{error}
        </p>
      )}

      {phase === "intro" && (
        <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4 text-center">
          <p className="text-xs text-muted-foreground">
            A new tab will open. Scan the QR with your phone to complete verification.
            Your progress is saved \u2014 this page auto-detects completion.
          </p>
        </div>
      )}

      {phase === "done" && (
        <div className="rounded-xl border-2 border-emerald-500/30 bg-emerald-500/5 p-4 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
          <p className="mt-1 text-sm font-semibold text-emerald-700">Identity verified</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Your identity has been verified successfully
          </p>
        </div>
      )}

      {phase === "review" && (
        <div className="rounded-xl border-2 border-amber-500/30 bg-amber-500/5 p-4 text-center">
          <Clock className="mx-auto h-8 w-8 text-amber-500" />
          <p className="mt-1 text-sm font-semibold text-amber-700">Pending review</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Our team will review your details and update the status within 24 hours.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={phase === "waiting"}>
          Back
        </Button>
        <div className="flex gap-2">
          {phase === "intro" && (
            <Button onClick={startVerification} variant="gradient">
              <ExternalLink className="h-3.5 w-3.5" />
              Start verification
            </Button>
          )}
          {phase === "declined" && (
            <Button onClick={retry} variant="gradient">
              Try again
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
