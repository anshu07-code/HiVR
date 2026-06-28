"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, ArrowLeft, Loader2, AlertCircle, CheckCircle2, Eye, EyeOff, ShieldCheck } from "lucide-react";

export function ResetForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const initialEmail = sp.get("email") ?? "";
  const initialCode = sp.get("code") ?? "";
  const next = sp.get("next") ?? "/dashboard";

  const [email, setEmail] = React.useState(initialEmail);
  const [code, setCode] = React.useState(initialCode);
  const [pw, setPw] = React.useState("");
  const [pw2, setPw2] = React.useState("");
  const [showPw, setShowPw] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const pwScore = React.useMemo(() => {
    let s = 0;
    if (pw.length >= 8) s++;
    if (pw.length >= 12) s++;
    if (/[A-Z]/.test(pw)) s++;
    if (/[0-9]/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
    return s;
  }, [pw]);

  function onCodeChange(v: string) {
    // Allow only digits, max 6
    const digits = v.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);

    if (!email || !code || code.length !== 6) {
      setErr("Enter your email and the 6-digit code.");
      return;
    }
    if (pw.length < 8) {
      setErr("New password must be at least 8 characters.");
      return;
    }
    if (pw !== pw2) {
      setErr("Passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      // 1. Verify the OTP — server returns a short-lived session token
      const v = await fetch("/api/auth/reset/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const vData = await v.json();
      if (!v.ok) {
        setErr(vData?.error ?? "Invalid or expired code");
        setLoading(false);
        return;
      }

      // 2. With the session token, set the new password
      const r = await fetch("/api/auth/reset/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code, password: pw, session_token: vData.session_token }),
      });
      const rData = await r.json();
      if (!r.ok) {
        setErr(rData?.error ?? "Failed to set new password");
        setLoading(false);
        return;
      }

      // Success → redirect to signin (the user must sign in with the new password)
      router.push(`/auth/signin?reset=1&next=${encodeURIComponent(next)}`);
    } catch (e: any) {
      setErr(e?.message ?? "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          readOnly={!!initialEmail}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="code">6-digit code</Label>
        <Input
          id="code"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => onCodeChange(e.target.value)}
          placeholder="123456"
          className="text-center font-mono text-lg tracking-widest"
        />
        <p className="text-[11px] text-muted-foreground">Check your email for the 6-digit code. Expires in 10 minutes.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="pw">New password</Label>
        <div className="relative">
          <Input
            id="pw"
            type={showPw ? "text" : "password"}
            required
            minLength={8}
            autoComplete="new-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
          <button
            type="button"
            aria-label={showPw ? "Hide password" : "Show password"}
            onClick={() => setShowPw(s => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
          >
            {showPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>
        {pw.length > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="flex gap-0.5">
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className={`h-1 w-6 rounded ${
                    pwScore > i
                      ? pwScore <= 2 ? "bg-destructive" : pwScore <= 3 ? "bg-amber-500" : "bg-emerald-500"
                      : "bg-muted"
                  }`}
                />
              ))}
            </div>
            <span className="text-[10px] text-muted-foreground">
              {pwScore <= 2 ? "Weak" : pwScore <= 3 ? "OK" : "Strong"}
            </span>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="pw2">Confirm new password</Label>
        <Input
          id="pw2"
          type={showPw ? "text" : "password"}
          required
          minLength={8}
          autoComplete="new-password"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
        />
      </div>

      {err && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{err}
        </div>
      )}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
        {loading ? "Resetting password…" : "Reset password"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Didn't get the code?{" "}
        <Link href={{ pathname: "/auth/forgot", query: { email } }} className="font-medium text-primary">Send a new one</Link>
        {" · "}
        <Link href="/auth/signin" className="inline-flex items-center gap-1 font-medium text-primary">
          <ArrowLeft className="h-3 w-3" /> Back to sign in
        </Link>
      </p>
    </form>
  );
}
