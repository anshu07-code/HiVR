"use client";

import * as React from "react";
import {
  Landmark, Check, AlertTriangle, Loader2, ExternalLink, IndianRupee, Shield,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type BankStepResult = {
  upiId: string;
  accountHolder: string;
  ifsc: string;
  last4: string;
  upiProvider: string;
};

const UPI_REGEX = /^[\w.-]+@[\w]{2,30}$/;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

type Phase = "form" | "awaiting_payment" | "verifying" | "verified";

export function BankStep({
  userFullName,
  onComplete,
}: {
  userFullName: string;
  onComplete: (r: BankStepResult) => void;
}) {
  const [phase, setPhase] = React.useState<Phase>("form");
  const [upiId, setUpiId] = React.useState("");
  const [accountHolder, setAccountHolder] = React.useState(userFullName || "");
  const [ifsc, setIfsc] = React.useState("");
  const [startBusy, setStartBusy] = React.useState(false);
  const [verifyBusy, setVerifyBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [bankVerificationId, setBankVerificationId] = React.useState<string | null>(null);
  const [sandboxCode, setSandboxCode] = React.useState<string | null>(null);
  const [expiresAt, setExpiresAt] = React.useState<string | null>(null);
  const [amountPaise, setAmountPaise] = React.useState<number>(100);
  const [paymentLinkUrl, setPaymentLinkUrl] = React.useState<string | null>(null);
  const [paymentNote, setPaymentNote] = React.useState<string | null>(null);
  const [provider, setProvider] = React.useState<string>("manual_sandbox");

  const [code, setCode] = React.useState("");
  const [verifiedLast4, setVerifiedLast4] = React.useState<string | null>(null);
  const [verifiedProvider, setVerifiedProvider] = React.useState<string | null>(null);
  const upiValid = UPI_REGEX.test(upiId.trim());
  const ifscValid = IFSC_REGEX.test(ifsc.trim().toUpperCase());
  const holderValid = accountHolder.trim().length >= 2;
  const formValid = upiValid && ifscValid && holderValid;
  const isRazorpay = provider === "razorpay";

  async function onStart() {
    if (!formValid) {
      setError("Fill in your UPI ID, account holder name, and IFSC.");
      return;
    }
    setStartBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/verification/bank/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          upiId: upiId.trim().toLowerCase(),
          accountHolder: accountHolder.trim(),
          ifsc: ifsc.trim().toUpperCase(),
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Failed to start");
      setBankVerificationId(json.bank_verification_id);
      setSandboxCode(json.sandbox_code ?? null);
      setExpiresAt(json.expires_at ?? null);
      setAmountPaise(json.amount_paise ?? 100);
      setPaymentLinkUrl(json.payment_link_url ?? null);
      setPaymentNote(json.note ?? null);
      setProvider(json.provider ?? "manual_sandbox");
      setPhase("awaiting_payment");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStartBusy(false);
    }
  }

  async function onVerify() {
    if (!bankVerificationId) return;
    if (code.trim().length < 4) {
      setError("Enter the code from your UPI app.");
      return;
    }
    setVerifyBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/verification/bank/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bankVerificationId,
          code: code.trim().toUpperCase(),
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Verification failed");
      setVerifiedLast4(json.last4 ?? null);
      setVerifiedProvider(json.upi_provider ?? null);
      setPhase("verified");
      onComplete({
        upiId: upiId.trim().toLowerCase(),
        accountHolder: accountHolder.trim(),
        ifsc: ifsc.trim().toUpperCase(),
        last4: json.last4 ?? "",
        upiProvider: json.upi_provider ?? "",
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setVerifyBusy(false);
    }
  }

  function reset() {
    setPhase("form");
    setBankVerificationId(null);
    setSandboxCode(null);
    setExpiresAt(null);
    setCode("");
    setError(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
        <IndianRupee className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="flex-1">
          <p className="font-semibold text-amber-700">₹1 verification fee</p>
          <p className="mt-0.5 text-xs text-amber-700/80">
            Non-refundable, used to confirm your bank account via UPI. HiVR keeps the rupee as the verification fee.
          </p>
        </div>
        <Shield className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
      </div>

      {phase === "form" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Landmark className="h-4 w-4" /> Bank account details
            </CardTitle>
            <CardDescription>
              We send a ₹1 UPI collect to your account. The 6-character note in the payment is your verification code.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="upiId">UPI ID</Label>
                <Input
                  id="upiId"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  placeholder="name@bank"
                  autoComplete="off"
                  inputMode="email"
                />
                {upiId && !upiValid && (
                  <p className="text-[10px] text-destructive">UPI ID should look like name@bank (e.g. nupur@paytm).</p>
                )}
                {upiValid && (
                  <p className="text-[10px] text-muted-foreground">
                    Looks good.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="accountHolder">Account holder name</Label>
                <Input
                  id="accountHolder"
                  value={accountHolder}
                  onChange={(e) => setAccountHolder(e.target.value)}
                  placeholder="As on your bank account"
                  autoComplete="off"
                />
                {accountHolder && !holderValid && (
                  <p className="text-[10px] text-destructive">Enter the full name on the account.</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ifsc">IFSC</Label>
                <Input
                  id="ifsc"
                  value={ifsc}
                  onChange={(e) => setIfsc(e.target.value.toUpperCase())}
                  placeholder="HDFC0001234"
                  autoComplete="off"
                  maxLength={11}
                  className="font-mono"
                />
                {ifsc && !ifscValid && (
                  <p className="text-[10px] text-destructive">IFSC format: 4 letters, 0, 6 alphanumeric (e.g. HDFC0001234).</p>
                )}
              </div>
            </div>

            {error && (
              <p className="inline-flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}
              </p>
            )}

            <div className="flex items-center justify-end">
              <Button onClick={onStart} disabled={!formValid || startBusy} variant="gradient">
                {startBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <IndianRupee className="h-4 w-4" />}
                {startBusy ? "Starting…" : "Send ₹1 to verify"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {phase === "awaiting_payment" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Landmark className="h-4 w-4" /> Pay ₹1 from your UPI app
            </CardTitle>
            <CardDescription>
              {isRazorpay
                ? "Click the button below to pay ₹1 via Razorpay. After completing the payment, enter the 6-character code from the transaction note."
                : "Open your UPI app and pay ₹1 to hivr@hdfcbank. The 6-character note is your code."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
              {isRazorpay && paymentLinkUrl ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button asChild variant="gradient">
                  <a href={paymentLinkUrl}>
                    <ExternalLink className="h-4 w-4" /> Pay ₹1 via Razorpay
                  </a>
                </Button>
              </div>
            ) : null}

            <div className="space-y-2 rounded-lg border bg-muted/20 p-4">
              <Label htmlFor="code" className="text-sm font-semibold">I paid — enter the code</Label>
              <p className="text-[10px] text-muted-foreground">
                The 6-character code appears in your UPI transaction note.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s+/g, ""))}
                  placeholder="e.g. ABCD12"
                  autoComplete="off"
                  maxLength={8}
                  className="font-mono text-lg tracking-widest"
                />
                <Button onClick={onVerify} disabled={verifyBusy || code.trim().length < 4} variant="gradient">
                  {verifyBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {verifyBusy ? "Verifying…" : "Verify code"}
                </Button>
              </div>
              {expiresAt && (
                <p className="text-[10px] text-muted-foreground">
                  Link expires at {new Date(expiresAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "short", timeStyle: "medium" })} IST
                </p>
              )}
            </div>

            {sandboxCode && !isRazorpay && (
              <p className="rounded-md border border-dashed bg-muted/30 px-2 py-1 text-center text-[10px] text-muted-foreground">
                Sandbox: type <span className="font-mono font-semibold text-foreground">{sandboxCode}</span> here
              </p>
            )}

            {paymentNote && (
              <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                <p className="font-medium">Your verification code: <span className="font-mono font-semibold text-foreground">{sandboxCode}</span></p>
                <p className="mt-0.5">Look for this code in the UPI transaction note after paying.</p>
              </div>
            )}

            {error && (
              <p className="inline-flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}
              </p>
            )}

            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={reset} disabled={verifyBusy}>
                Back
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {phase === "verifying" && (
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-sm">
            <Loader2 className="h-5 w-5 animate-spin" /> Verifying your payment…
          </CardContent>
        </Card>
      )}

      {phase === "verified" && (
        <Card className="border-emerald-500/30">
          <CardContent className="space-y-3 p-6 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-500/15 text-emerald-600">
              <Check className="h-6 w-6" />
            </div>
            <p className="font-display text-lg font-semibold">Bank account verified</p>
            <p className="text-xs text-muted-foreground">
              {verifiedProvider ?? "UPI"} · ending <span className="font-mono font-semibold text-foreground">•••• {verifiedLast4 ?? "0000"}</span>
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
