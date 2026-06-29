"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Briefcase, Hammer, Check, AlertCircle, MailCheck, Building2, User, Phone,
  Globe, Hash, IdCard, Shield, ChevronRight, ChevronLeft, ArrowRight, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { signUpWithEmail, signUpBusiness, signInWithGoogle } from "../actions";

/* -------------------------------------------------------------------------- */
/*  Top-level account type toggle                                             */
/* -------------------------------------------------------------------------- */

type AccountType = "individual" | "business";
type Role = "buyer" | "employee" | "both";

const ACCOUNT_TYPES: { value: AccountType; label: string; sub: string; Icon: any }[] = [
  { value: "individual", label: "Individual",   sub: "Hire or work as a person",   Icon: User },
  { value: "business",   label: "Business",     sub: "Hire as an organisation",    Icon: Building2 },
];

const ROLES: { value: Role; title: string; desc: string; Icon: any }[] = [
  { value: "buyer",    title: "Hire",  desc: "Post tasks and pay people",                  Icon: Briefcase },
  { value: "employee", title: "Work",  desc: "Earn by completing verified tasks",          Icon: Hammer },
  { value: "both",     title: "Both",  desc: "Hire some days, work other days",            Icon: Briefcase },
];

const ENTITY_TYPES = [
  { value: "sole_proprietorship", label: "Sole proprietorship" },
  { value: "partnership",         label: "Partnership" },
  { value: "llp",                 label: "LLP" },
  { value: "private_limited",     label: "Private limited company" },
  { value: "public_limited",      label: "Public limited company" },
  { value: "society",             label: "Society" },
  { value: "trust",               label: "Trust" },
  { value: "huf",                 label: "HUF" },
  { value: "other",               label: "Other" },
];

export function SignUpForm() {
  const sp = useSearchParams();
  const initialType: AccountType = sp.get("type") === "business" ? "business" : "individual";
  const [type, setType] = React.useState<AccountType>(initialType);

  return (
    <div className="space-y-5">
      <AccountTypeToggle value={type} onChange={setType} />
      {type === "individual" ? <IndividualForm initialRole={sp.get("role")} /> : <BusinessWizard />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Shared top-level toggle                                                   */
/* -------------------------------------------------------------------------- */

function AccountTypeToggle({ value, onChange }: { value: AccountType; onChange: (v: AccountType) => void }) {
  return (
    <div role="tablist" aria-label="Account type" className="grid grid-cols-2 gap-1 rounded-lg border bg-muted/30 p-1">
      {ACCOUNT_TYPES.map(({ value: v, label, sub, Icon }) => {
        const active = value === v;
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(v)}
            className={cn(
              "flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="flex flex-col items-start leading-tight">
              <span>{label}</span>
              <span className="text-[10px] font-normal text-muted-foreground">{sub}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Individual signup form                                                    */
/* -------------------------------------------------------------------------- */

function IndividualForm({ initialRole }: { initialRole: string | null }) {
  const initial: Role = (initialRole === "employee" || initialRole === "both") ? initialRole : "buyer";
  const [role, setRole] = React.useState<Role>(initial);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [googleLoading, setGoogleLoading] = React.useState(false);
  const [pendingEmail, setPendingEmail] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null); setLoading(true);
    const fd = new FormData(e.currentTarget);
    fd.set("role_intent", role);
    try {
      const res = await signUpWithEmail(fd);
      if (res && typeof res === "object") {
        if (typeof res.error === "string" && res.error) setError(res.error);
        else if (res.needsEmailConfirmation) setPendingEmail(res.email ?? "");
      }
    } catch (err) {
      const msg = (err as Error)?.message ?? "";
      if (!msg.includes("NEXT_REDIRECT")) setError(msg || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError(null); setGoogleLoading(true);
    const res = await signInWithGoogle();
    if (res?.error) { setError(res.error); setGoogleLoading(false); }
  }

  if (pendingEmail) {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="space-y-3 p-5 text-center">
          <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-primary/15 text-primary">
            <MailCheck className="h-5 w-5" />
          </div>
          <h3 className="font-display text-lg font-semibold">Check your email</h3>
          <p className="text-sm text-muted-foreground">
            We sent a confirmation link to <span className="font-medium text-foreground">{pendingEmail}</span>.
            Click it to activate your account, then <Link href="/auth/signin" className="font-medium text-primary underline">log in</Link>.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">I want to…</legend>
        <div role="radiogroup" className="grid grid-cols-3 gap-2">
          {ROLES.map(({ value, title, desc, Icon }) => {
            const active = role === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-selected={active}
                onClick={() => setRole(value)}
                className={cn(
                  "flex h-full flex-col items-start gap-1 rounded-md border p-3 text-left transition-colors",
                  "hover:border-foreground/30",
                  active && "border-primary bg-primary/5 ring-1 ring-primary/20",
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <Icon className="h-4 w-4" />
                  {active && <Check className="h-3.5 w-3.5 text-primary" />}
                </div>
                <div className="text-sm font-semibold">{title}</div>
                <div className="text-xs text-muted-foreground">{desc}</div>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="full_name">Full name</Label>
        <Input id="full_name" name="full_name" required minLength={2} maxLength={80} autoComplete="name" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="phone">Phone {role === "employee" ? "(optional)" : "(required for hiring)"}</Label>
        <Input id="phone" name="phone" type="tel" required={role !== "employee"} placeholder="+91 98xxxxxxxx" autoComplete="tel" />
        {role !== "employee" && (
          <p className="text-[11px] text-muted-foreground">Required for posting tasks. We send a one-time code via SMS to verify.</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p className="text-destructive">{error}</p>
        </div>
      )}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Creating account…" : "Create individual account"}
      </Button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
        <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">or</span></div>
      </div>

      <Button type="button" variant="outline" className="w-full gap-2" disabled={googleLoading} onClick={handleGoogle}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
        {googleLoading ? "Signing in…" : "Continue with Google"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href={{ pathname: "/auth/signin", query: { type: "individual" } }} className="font-medium text-primary">Log in</Link>
      </p>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/*  Business signup — 3-step wizard                                           */
/* -------------------------------------------------------------------------- */

type BusinessStep = 1 | 2 | 3;

const BUSINESS_STEPS: { n: BusinessStep; title: string; sub: string; Icon: any }[] = [
  { n: 1, title: "Business details", sub: "Legal entity, PAN, GSTIN",       Icon: Building2 },
  { n: 2, title: "Work login",       sub: "Work email + password you'll use to sign in", Icon: Shield },
  { n: 3, title: "Authorised signatory", sub: "The person responsible for this account", Icon: User },
];

function BusinessWizard() {
  const [step, setStep] = React.useState<BusinessStep>(1);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [pendingEmail, setPendingEmail] = React.useState<string | null>(null);

  // One form for the whole wizard — we use refs to read every field on submit.
  const formRef = React.useRef<HTMLFormElement>(null);

  // Validation per step. Returns null on success, or an error string.
  function validateStep(s: BusinessStep): string | null {
    const fd = new FormData(formRef.current!);
    const get = (k: string) => String(fd.get(k) ?? "").trim();

    if (s === 1) {
      if (get("legal_name").length < 2) return "Enter the legal name of your business.";
      if (!get("entity_type")) return "Pick an entity type.";
      if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(get("pan").toUpperCase())) return "Business PAN must be 10 chars (e.g. ABCDE1234F).";
      const g = get("gstin");
      if (g && !/^\d{2}[A-Z]{5}\d{4}[A-Z]{1}\d{1}Z[A-Z\d]{1}$/.test(g.toUpperCase())) return "GSTIN must be 15 chars (or leave blank).";
      const w = get("website");
      if (w && !/^https?:\/\/.+/.test(w)) return "Website must start with http(s):// (or leave blank).";
      return null;
    }
    if (s === 2) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(get("work_email"))) return "Enter a valid work email.";
      if (!/^\+?[1-9]\d{6,14}$/.test(get("work_phone"))) return "Use international format: +91XXXXXXXXXX";
      if (get("password").length < 8) return "Password must be at least 8 characters.";
      return null;
    }
    if (s === 3) {
      if (get("contact_name").length < 2) return "Enter the signatory's full name.";
      if (!get("contact_role")) return "Pick a role in the business.";
      if (!/^\+?[1-9]\d{6,14}$/.test(get("contact_phone"))) return "Use international format: +91XXXXXXXXXX";
      return null;
    }
    return null;
  }

  function next() {
    const err = validateStep(step);
    if (err) { setError(err); return; }
    setError(null);
    setStep(s => (Math.min(3, s + 1) as BusinessStep));
  }
  function back() {
    setError(null);
    setStep(s => (Math.max(1, s - 1) as BusinessStep));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null); setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await signUpBusiness(fd);
      if (res && typeof res === "object") {
        if (typeof res.error === "string" && res.error) setError(res.error);
        else if (res.needsEmailConfirmation) setPendingEmail(res.email ?? "");
      }
    } catch (err) {
      const msg = (err as Error)?.message ?? "";
      if (!msg.includes("NEXT_REDIRECT")) setError(msg || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (pendingEmail) {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="space-y-3 p-5 text-center">
          <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-primary/15 text-primary">
            <MailCheck className="h-5 w-5" />
          </div>
          <h3 className="font-display text-lg font-semibold">Check your work email</h3>
          <p className="text-sm text-muted-foreground">
            We sent a confirmation link to <span className="font-medium text-foreground">{pendingEmail}</span>.
            Click it to activate your business account, then <Link href={{ pathname: "/auth/signin", query: { type: "business" } }} className="font-medium text-primary underline">log in</Link>.
          </p>
          <p className="text-xs text-muted-foreground">The work email becomes your business login.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-5">
      <Stepper currentStep={step} onStepClick={(n) => n < step && setStep(n)} />

      <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">
        <Sparkles className="mr-1 inline h-3 w-3" />
        You'll log in with the <strong>work email</strong> of the authorised signatory. Use a personal email only if you're a sole proprietor without a work email.
      </p>

      {step === 1 && <Step1 />}
      {step === 2 && <Step2 />}
      {step === 3 && <Step3 />}

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p className="text-destructive">{error}</p>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={back} disabled={step === 1 || loading}>
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
        {step < 3 ? (
          <Button type="button" variant="gradient" onClick={next} disabled={loading}>
            Continue <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button type="submit" variant="gradient" disabled={loading}>
            <Building2 className="h-4 w-4" />
            {loading ? "Creating…" : "Create business account"} <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>

      <p className="text-center text-sm text-muted-foreground">
        Already have a business account?{" "}
        <Link href={{ pathname: "/auth/signin", query: { type: "business" } }} className="font-medium text-primary">Log in</Link>
      </p>
    </form>
  );
}

/* ---------- Stepper ---------- */

function Stepper({ currentStep, onStepClick }: { currentStep: BusinessStep; onStepClick: (n: BusinessStep) => void }) {
  // Horizontal stepper that ONLY renders the steps that are visible:
  //   * on Step 1 → Step 1 active
  //   * on Step 2 → Step 1 (done) + Step 2 (active)
  //   * on Step 3 → Step 1 + Step 2 (done) + Step 3 (active)
  // This keeps the stepper compact and leaves the full card width
  // available for the active step's form fields (prevents Step 3
  // fields from overflowing on narrow viewports).
  const visible = BUSINESS_STEPS.filter((s) => s.n <= currentStep);

  return (
    <ol className="flex items-center gap-2">
      {visible.map((s, i) => {
        const done = currentStep > s.n;
        const active = currentStep === s.n;
        const clickable = currentStep > s.n;
        return (
          <li key={s.n} className="flex flex-1 items-center gap-2">
            <button
              type="button"
              disabled={!clickable}
              onClick={() => onStepClick(s.n)}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors",
                active && "border-primary bg-primary/5",
                done && "border-emerald-500/40 bg-emerald-500/5 cursor-pointer hover:border-emerald-500/60",
              )}
            >
              <span
                className={cn(
                  "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
                  active && "bg-primary text-primary-foreground",
                  done && "bg-emerald-500 text-white",
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : s.n}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block truncate text-[10px] uppercase tracking-wider",
                    active ? "text-primary" : "text-emerald-700 dark:text-emerald-300",
                  )}
                >
                  Step {s.n} {done && "✓"}
                </span>
                <span className="block truncate text-xs font-medium">{s.title}</span>
              </span>
            </button>
            {i < visible.length - 1 && (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- Step 1: Business details ---------- */

function Step1() {
  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Building2 className="h-3.5 w-3.5" /> Business details
      </h3>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="legal_name">Legal name of business</Label>
          <Input id="legal_name" name="legal_name" required minLength={2} maxLength={160} placeholder="e.g. Acme Studios Pvt Ltd" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="brand_name">Brand / trade name (optional)</Label>
          <Input id="brand_name" name="brand_name" maxLength={80} placeholder="e.g. Acme" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="entity_type">Entity type</Label>
          <select id="entity_type" name="entity_type" required defaultValue="private_limited" className="h-9 w-full rounded-md border bg-background px-3 text-sm">
            {ENTITY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pan"><IdCard className="mr-1 inline h-3 w-3" />Business PAN</Label>
            <Input id="pan" name="pan" required maxLength={10} minLength={10} placeholder="ABCDE1234F" className="font-mono uppercase" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gstin"><Hash className="mr-1 inline h-3 w-3" />GSTIN (optional)</Label>
            <Input id="gstin" name="gstin" maxLength={15} minLength={15} placeholder="22ABCDE1234F1Z5" className="font-mono uppercase" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="website"><Globe className="mr-1 inline h-3 w-3" />Website (optional)</Label>
          <Input id="website" name="website" type="url" placeholder="https://acme.com" />
        </div>
      </div>
    </div>
  );
}

/* ---------- Step 2: Work login ---------- */

function Step2() {
  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Shield className="h-3.5 w-3.5" /> Work login
      </h3>
      <p className="text-xs text-muted-foreground">This is what you'll use to sign in. It must be unique to your business.</p>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="work_email">Work email</Label>
          <Input id="work_email" name="work_email" type="email" required autoComplete="email" placeholder="hiring@acme.com" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="work_phone">Work phone</Label>
          <Input id="work_phone" name="work_phone" type="tel" required placeholder="+91 22 1234 5678" autoComplete="tel" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
        </div>
      </div>
    </div>
  );
}

/* ---------- Step 3: Authorised signatory ---------- */

function Step3() {
  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <User className="h-3.5 w-3.5" /> Authorised signatory
      </h3>
      <p className="text-xs text-muted-foreground">The person responsible for this account. Must be authorised to enter contracts.</p>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="contact_name">Full name</Label>
          <Input id="contact_name" name="contact_name" required minLength={2} maxLength={80} autoComplete="name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contact_role">Role in business</Label>
          <select id="contact_role" name="contact_role" required defaultValue="owner" className="h-9 w-full rounded-md border bg-background px-3 text-sm">
            <option value="owner">Owner / Proprietor</option>
            <option value="director">Director</option>
            <option value="authorised_signatory">Authorised signatory</option>
            <option value="hr">HR / People ops</option>
            <option value="manager">Manager</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contact_phone"><Phone className="mr-1 inline h-3 w-3" />Personal phone (for eKYC)</Label>
          <Input id="contact_phone" name="contact_phone" type="tel" required placeholder="+91 98xxxxxxxx" />
        </div>
      </div>
    </div>
  );
}
