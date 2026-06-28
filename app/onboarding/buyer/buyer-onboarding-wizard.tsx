"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Check, ChevronRight, Loader2, ShieldCheck, AlertTriangle,
  Building2, User, Info, ArrowRight, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

/* ====================================================================== */
/* Slimmed-down buyer onboarding. Identity verification is now handled    */
/* by the new /onboarding/verify flow (free, no DigiLocker). We only     */
/* collect the business profile bits here, then redirect to the verify   */
/* wizard.                                                                */
/* ====================================================================== */

type Step = "profile" | "done";
const STEPS: Step[] = ["profile", "done"];

const PATTERNS: Record<string, { re: RegExp; placeholder: string; hint: string; mask: (v: string) => string }> = {
  gstin: { re: /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}\d{1}Z[A-Z\d]{1}$/, placeholder: "22AAAAA0000A1Z5",
           hint: "15-character GSTIN (e.g. 22AAAAA0000A1Z5).",
           mask: (v) => v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 15) },
};

export function BuyerOnboarding({
  profile, userEmail,
}: {
  profile: any;
  userEmail: string;
}) {
  const router = useRouter();
  const isBusiness = profile?.buyer_type === "business";
  const [step, setStep] = React.useState<Step>(!profile || !profile.buyer_type ? "profile" : "done");

  const idx = STEPS.indexOf(step);
  const progress = ((idx + 1) / STEPS.length) * 100;

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>Step {idx + 1} of {STEPS.length}</span>
          <span>{Math.round(progress)}% complete</span>
        </div>
        <Progress value={progress} />
      </div>

      {step === "profile" && <ProfileStep initial={profile} onDone={() => setStep("done")} />}
      {step === "done"    && <DoneStep />}
    </div>
  );
}

function ProfileStep({ initial, onDone }: { initial: any; onDone: () => void }) {
  const sb = createClient();
  const [buyerType, setBuyerType] = React.useState<"individual" | "business">(initial?.buyer_type ?? "individual");
  const [companyName, setCompanyName] = React.useState(initial?.company_name ?? "");
  const [gstin, setGstin] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const gstinPattern = PATTERNS.gstin;
  const gstinValid = buyerType !== "business" || gstinPattern.re.test(gstin);

  async function submit() {
    if (buyerType === "business" && companyName.trim().length < 2) {
      setError("Enter your business / company name.");
      return;
    }
    if (buyerType === "business" && !gstinValid) {
      setError(gstinPattern.hint);
      return;
    }
    setSubmitting(true);
    setError(null);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { setSubmitting(false); return; }
    const { error: e } = await sb.from("buyer_profiles").upsert({
      user_id: user.id,
      buyer_type: buyerType,
      company_name: buyerType === "business" ? companyName.trim() : null,
      gstin: buyerType === "business" ? gstin : null,
    } as any);
    if (e) { setError(e.message); setSubmitting(false); return; }
    setSubmitting(false);
    onDone();
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-2xl font-semibold">Tell us about your work</h2>
        <p className="text-sm text-muted-foreground">This helps us apply the right verification rules to your account.</p>
      </div>

      <RadioGroup value={buyerType} onValueChange={(v) => setBuyerType(v as "individual" | "business")} className="grid gap-2 sm:grid-cols-2">
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-4 has-[button[data-state=checked]]:border-primary has-[button[data-state=checked]]:bg-primary/5">
          <RadioGroupItem value="individual" id="bt-individual" />
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-muted">
            <User className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">I&apos;m hiring for myself</div>
            <div className="text-xs text-muted-foreground">Personal tasks. Identity verification happens on the next step.</div>
          </div>
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-4 has-[button[data-state=checked]]:border-primary has-[button[data-state=checked]]:bg-primary/5">
          <RadioGroupItem value="business" id="bt-business" />
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-muted">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">I&apos;m hiring for a business</div>
            <div className="text-xs text-muted-foreground">Adds a GSTIN requirement on top of individual checks.</div>
          </div>
        </label>
      </RadioGroup>

      {buyerType === "business" && (
        <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
          <div className="space-y-1.5">
            <Label htmlFor="company_name">Business / company name</Label>
            <Input id="company_name" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Acme Studio LLP" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gstin">GSTIN</Label>
            <Input id="gstin" value={gstin} onChange={e => setGstin(gstinPattern.mask(e.target.value))} placeholder={gstinPattern.placeholder} className="font-mono tracking-wider" />
            <p className="text-[11px] text-muted-foreground">{gstinPattern.hint}</p>
          </div>
        </div>
      )}

      {error && (
        <p className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" />{error}
        </p>
      )}

      <div className="flex justify-end">
        <Button onClick={submit} disabled={submitting} variant="gradient">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Continue <ChevronRight className="h-4 w-4" /></>}
        </Button>
      </div>
    </div>
  );
}

function DoneStep() {
  return (
    <div className="space-y-5 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-success/15 text-success">
        <Check className="h-6 w-6" />
      </div>
      <h2 className="font-display text-2xl font-semibold">Almost there</h2>
      <p className="text-sm text-muted-foreground">
        Your business profile is saved. Next up: a quick free identity verification — selfie + government ID, no DigiLocker needed.
      </p>
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-left text-xs text-muted-foreground">
        <p className="flex items-center gap-1 font-medium text-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> What changed
        </p>
        <ul className="mt-1 list-disc pl-4 space-y-0.5">
          <li>Aadhaar / PAN / Bank are <strong>no longer required</strong> for buyers.</li>
          <li>Your selfie + any one government ID is enough — we OCR it locally, no third party.</li>
          <li>Most buyers get auto-approved in &lt;60 seconds.</li>
        </ul>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Button asChild variant="gradient" size="lg">
          <a href="/onboarding/verify">
            <ShieldCheck className="h-4 w-4" />Start identity verification <ArrowRight className="h-4 w-4" />
          </a>
        </Button>
        <a href="/dashboard" className="text-[10px] text-muted-foreground hover:underline">Skip for now → dashboard</a>
      </div>
    </div>
  );
}
