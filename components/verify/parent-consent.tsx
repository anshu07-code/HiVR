"use client";

import * as React from "react";
import { Mail, Phone, Loader2, AlertTriangle, Check, ShieldCheck, ArrowLeft, ArrowRight, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

export type ParentConsentResult = { parentEmail?: string; parentPhone?: string; otp?: string };

/**
 * For minors 13-14 only. Two paths:
 *   - "Parent has HiVR account" — enter email, send magic link via
 *     /api/verification/parent-consent (which uses Supabase auth.generateLink).
 *   - "Parent doesn't have an account" — enter phone, send OTP, verify.
 */
export function ParentConsent({ childName, onComplete, onBack }: { childName?: string; onComplete: (r: ParentConsentResult) => void; onBack: () => void }) {
  const [mode, setMode] = React.useState<"email" | "phone">("email");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("+91");
  const [otp, setOtp] = React.useState("");
  const [otpSent, setOtpSent] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [verifying, setVerifying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<{ kind: "email" | "phone"; at: string } | null>(null);

  async function sendEmail() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setSending(true); setError(null);
    try {
      const res = await fetch("/api/verification/parent-consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parentEmail: email.trim().toLowerCase() }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.reason ?? "Failed to send consent link");
      setDone({ kind: "email", at: new Date().toISOString() });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function sendOtp() {
    if (!/^\+?[1-9]\d{6,14}$/.test(phone)) {
      setError("Enter a valid phone in international format (e.g. +91XXXXXXXXXX).");
      return;
    }
    setSending(true); setError(null);
    try {
      const res = await fetch("/api/verification/parent-consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parentPhone: phone }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.reason ?? "Failed to send OTP");
      setOtpSent(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function verifyOtp() {
    if (!/^\d{6}$/.test(otp)) {
      setError("Enter the 6-digit code.");
      return;
    }
    setVerifying(true); setError(null);
    try {
      const res = await fetch("/api/verification/parent-consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parentPhone: phone, otp }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.reason ?? "Wrong code");
      onComplete({ parentPhone: phone, otp });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setVerifying(false);
    }
  }

  function submitEmail() {
    onComplete({ parentEmail: email.trim().toLowerCase() });
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-display text-lg font-semibold">Parent consent required</h3>
        <p className="text-xs text-muted-foreground">
          You&apos;re 13 or 14. Indian law requires a parent or legal guardian to consent before you use HiVR.
        </p>
      </div>

      <div className="rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
        <p className="text-foreground font-semibold">Consent statement</p>
        <p className="mt-1 italic">
          &ldquo;I am the parent/legal guardian of {childName ?? "the user"} and consent to them using HiVR.
          I understand they cannot receive payouts to a bank account without a PAN, and their earnings will be sent
          to a FAMPay handle I oversee.&rdquo;
        </p>
      </div>

      <RadioGroup
        value={mode}
        onValueChange={(v) => { setMode(v as "email" | "phone"); setError(null); setOtpSent(false); setDone(null); }}
        className="grid gap-2 sm:grid-cols-2"
      >
        <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
          <RadioGroupItem value="email" id="parent-email-mode" />
          <Mail className="h-4 w-4 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm font-semibold">Parent has HiVR account</div>
            <div className="text-[10px] text-muted-foreground">We&apos;ll email a consent link.</div>
          </div>
        </label>
        <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
          <RadioGroupItem value="phone" id="parent-phone-mode" />
          <Phone className="h-4 w-4 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm font-semibold">Parent doesn&apos;t have account</div>
            <div className="text-[10px] text-muted-foreground">Verify via SMS OTP.</div>
          </div>
        </label>
      </RadioGroup>

      {mode === "email" && !done && (
        <div className="space-y-1.5">
          <Label htmlFor="parent_email">Parent email</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="parent_email"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null); }}
              placeholder="parent@example.com"
              className="pl-9"
              autoComplete="email"
            />
          </div>
        </div>
      )}

      {mode === "email" && done && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-700">
          <ShieldCheck className="mr-1 inline h-3.5 w-3.5" />Consent link sent. We&apos;ll let you proceed now; the parent can confirm later.
          <Button size="sm" variant="link" className="ml-2 h-auto p-0" onClick={submitEmail}>
            Continue <ArrowRight className="ml-0.5 h-3 w-3" />
          </Button>
        </div>
      )}

      {mode === "phone" && (
        <div className="space-y-2">
          <div className="space-y-1.5">
            <Label htmlFor="parent_phone">Parent phone</Label>
            <div className="relative">
              <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="parent_phone"
                value={phone}
                onChange={(e) => { setPhone(e.target.value); setError(null); }}
                placeholder="+91XXXXXXXXXX"
                inputMode="tel"
                className="pl-9 font-mono"
                disabled={otpSent}
              />
            </div>
          </div>
          {otpSent && (
            <div className="space-y-1.5">
              <Label htmlFor="parent_otp">6-digit code</Label>
              <Input
                id="parent_otp"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                inputMode="numeric"
                className="text-center font-mono tracking-[0.4em]"
                maxLength={6}
              />
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" />{error}
        </p>
      )}

      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" />Back
        </Button>
        {mode === "email" ? (
          <Button onClick={sendEmail} disabled={sending || !email} variant="gradient" size="sm">
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
            {sending ? "Sending…" : "Send consent link"}
          </Button>
        ) : otpSent ? (
          <Button onClick={verifyOtp} disabled={verifying || otp.length !== 6} variant="gradient" size="sm">
            {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            {verifying ? "Verifying…" : "Verify code"}
          </Button>
        ) : (
          <Button onClick={sendOtp} disabled={sending || !phone} variant="gradient" size="sm">
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Phone className="h-3.5 w-3.5" />}
            {sending ? "Sending…" : "Send OTP"}
          </Button>
        )}
      </div>
    </div>
  );
}
