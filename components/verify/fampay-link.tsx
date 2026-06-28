"use client";

import * as React from "react";
import { Wallet, ExternalLink, AlertTriangle, Check, ArrowLeft, Info, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateFAMPayHandle } from "@/lib/verification";

export type FAMPayResult = { handle: string };

/**
 * Minor-only step. The user enters their FAMPay handle so we know
 * where to send their earnings (their parent oversees it). We also
 * expose a deep link to the FAMPay app.
 */
export function FAMPayLink({ childName, onComplete, onSkip }: { childName?: string; onComplete: (r: FAMPayResult) => void; onSkip: () => void }) {
  const [handle, setHandle] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const valid = validateFAMPayHandle(handle);

  function submit() {
    if (!valid) {
      setError("Handle must look like 'username@fampay' — letters, digits, dots, underscores, hyphens (3-30 chars).");
      return;
    }
    onComplete({ handle: handle.trim().toLowerCase() });
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-display text-lg font-semibold">Link your FAMPay handle</h3>
        <p className="text-xs text-muted-foreground">
          FAMPay is a kid-friendly UPI wallet. Minors under 18 can&apos;t receive payouts to a regular bank, so HiVR
          routes their earnings to a FAMPay wallet{childName ? ` for ${childName}` : ""} that a parent oversees.
        </p>
      </div>

      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-3.5 w-3.5 text-primary" />
          <div>
            <p className="font-semibold">What is FAMPay?</p>
            <p className="mt-0.5 text-muted-foreground">
              FAMPay is a UPI app built for teens. Your earnings land in your FAMPay wallet; a parent linked
              to your account can transfer them out, set spending limits, and approve every transaction.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="handle">FAMPay handle</Label>
        <div className="relative">
          <Wallet className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="handle"
            value={handle}
            onChange={(e) => { setHandle(e.target.value.toLowerCase().trim()); setError(null); }}
            placeholder="yourname@fampay"
            inputMode="text"
            autoComplete="off"
            className="pl-9 font-mono"
          />
        </div>
        <p className={handle.length === 0 ? "text-[11px] text-muted-foreground" : valid ? "text-[11px] text-emerald-600" : "text-[11px] text-amber-700"}>
          {handle.length === 0 ? "Example: arjun@fampay" : valid ? <>Looks good <Check className="inline h-3 w-3" /></> : "Should end with @fampay — only letters, digits, dot, underscore, hyphen."}
        </p>
      </div>

      {error && (
        <p className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" />{error}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <a
          href="https://fampay.in/download"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border bg-muted/30 px-3 py-1.5 text-xs text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" />Open FAMPay app
        </a>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onSkip}>
            <ArrowLeft className="h-3.5 w-3.5" />Back
          </Button>
          <Button onClick={submit} disabled={!valid} variant="gradient" size="sm">
            Continue <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
