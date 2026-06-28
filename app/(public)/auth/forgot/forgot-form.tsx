"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, ArrowLeft, Loader2, AlertCircle, CheckCircle2, Clock } from "lucide-react";

export function ForgotForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") ?? "/auth/reset";

  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);
  const [cooldown, setCooldown] = React.useState(0);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (cooldown > 0) return;
    setErr(null); setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data?.error ?? "Something went wrong");
        setLoading(false);
        return;
      }
      setSent(true);
      setCooldown(60);
    } catch (e: any) {
      setErr(e?.message ?? "Failed");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Check your email</p>
            <p className="mt-0.5 text-xs">
              If an account exists for <span className="font-mono">{email}</span>, we've sent a 6-digit code.
              The code expires in 10 minutes.
            </p>
          </div>
        </div>

        <Button
          type="button"
          className="w-full"
          onClick={() => {
            router.push(`/auth/reset?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
          }}
        >
          I have the code — continue
        </Button>

        <div className="text-center text-xs text-muted-foreground">
          Didn't get it?{" "}
          <button
            type="button"
            disabled={cooldown > 0}
            onClick={onSubmit as any}
            className="font-medium text-primary disabled:opacity-50"
          >
            {cooldown > 0 ? <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> Resend in {cooldown}s</span> : "Resend code"}
          </button>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          <Link href="/auth/signin" className="inline-flex items-center gap-1 font-medium text-primary">
            <ArrowLeft className="h-3 w-3" /> Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email"><Mail className="mr-1 inline h-3 w-3" />Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </div>
      {err && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{err}
        </div>
      )}
      <Button type="submit" className="w-full" disabled={loading || cooldown > 0}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
        {loading ? "Sending code…" : "Send reset code"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Remember your password?{" "}
        <Link href="/auth/signin" className="font-medium text-primary">Log in</Link>
      </p>
    </form>
  );
}
