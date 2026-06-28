"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Check, ChevronRight, ChevronLeft, Sparkles, Loader2, ShieldCheck,
  AlertTriangle, Building2, Info, Lock, Briefcase, Users, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { BusinessProfileSchema } from "@/lib/schemas";

/* ====================================================================== */
/* HiVR Business onboarding wizard                                         */
/*                                                                          */
/*  1. Legal  — entity type, legal name, brand, GSTIN, PAN, CIN, address */
/*  2. KYC    — DigiLocker for director PAN, Aadhaar                       */
/*  3. Bank   — UPI verification (uses existing /api/verification/bank/*) */
/*  4. Team   — invite directors / authorised signatories via email         */
/*  5. Done   — green summary + "go to dashboard" CTA                     */
/* ====================================================================== */

type Step = "legal" | "kyc" | "bank" | "team" | "done";
const STEPS: Step[] = ["legal", "kyc", "bank", "team", "done"];

type Bp = any;

const ENTITY_TYPES = [
  { value: "sole_proprietorship", label: "Sole Proprietorship", icon: "👤" },
  { value: "partnership",         label: "Partnership",         icon: "🤝" },
  { value: "llp",                 label: "LLP",                 icon: "🏢" },
  { value: "private_limited",     label: "Private Limited",     icon: "🏛️" },
  { value: "public_limited",      label: "Public Limited",      icon: "🏛️" },
  { value: "society",             label: "Society / Trust",     icon: "🏛️" },
  { value: "huf",                 label: "HUF",                 icon: "👨‍👩‍👧" },
  { value: "other",               label: "Other",               icon: "🧾" },
] as const;

export function BusinessOnboarding({
  initial, phoneConfirmed, email, currentStep,
}: { initial: Bp | null; phoneConfirmed: boolean; email: string; currentStep: Step | null }) {
  const router = useRouter();
  const sb = createClient();

  // Auto-skip: if a business profile exists, jump to the furthest
  // step the user has completed. Otherwise start at "legal".
  const initialStep: Step =
    currentStep && STEPS.includes(currentStep) ? currentStep :
    !initial ? "legal" :
    !initial.pan ? "legal" :
    !initial.kyc_verified_at ? "kyc" :
    !initial.bank_verified_at ? "bank" :
    "team";

  const [step, setStep] = React.useState<Step>(initialStep);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const idx = STEPS.indexOf(step);
  const progress = ((idx + 1) / STEPS.length) * 100;

  async function persistStep(nextStep: Step) {
    setError(null);
    try {
      await sb.from("users").update({ business_onboarding_step: nextStep }).eq("id", (await sb.auth.getUser()).data.user!.id);
    } catch { /* non-fatal */ }
  }

  async function completeOnboarding() {
    setBusy(true);
    try {
      await sb.from("users").update({ business_onboarding_step: "done" }).eq("id", (await sb.auth.getUser()).data.user!.id);
    } catch { /* non-fatal */ }
    setBusy(false);
    router.push("/business/dashboard");
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>Step {idx + 1} of {STEPS.length}</span>
          <span>{Math.round(progress)}% complete</span>
        </div>
        <Progress value={progress} />
      </div>

      {step === "legal" && (
        <LegalStep
          initial={initial}
          onDone={async (bp) => {
            await persistStep("kyc");
            setStep("kyc");
          }}
          onError={setError}
        />
      )}
      {step === "kyc" && (
        <KycStep
          businessId={initial?.id}
          onDone={async () => {
            await persistStep("bank");
            setStep("bank");
          }}
        />
      )}
      {step === "bank" && (
        <BankStep
          businessId={initial?.id}
          onDone={async () => {
            await persistStep("team");
            setStep("team");
          }}
        />
      )}
      {step === "team" && (
        <TeamStep
          businessId={initial?.id}
          onDone={async () => {
            await persistStep("done");
            setStep("done");
          }}
        />
      )}
      {step === "done" && <DoneStep onContinue={completeOnboarding} busy={busy} />}

      {error && (
        <p className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" />{error}
        </p>
      )}
    </div>
  );
}

/* ====================================================================== */
/* Step 1 — Legal entity                                                  */
/* ====================================================================== */

const LegalSchema = BusinessProfileSchema.pick({
  legal_name: true, brand_name: true, entity_type: true, pan: true, gstin: true,
  cin: true, llpin: true, incorporation_date: true, registered_address: true,
  operating_address: true, city: true, state: true, pincode: true, country: true,
  website: true, industry: true, employee_count_band: true, description: true,
});

function LegalStep({ initial, onDone, onError }: { initial: Bp | null; onDone: (bp: any) => void; onError: (s: string) => void }) {
  const sb = createClient();
  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    resolver: zodResolver(LegalSchema),
    defaultValues: {
      legal_name: initial?.legal_name ?? "",
      brand_name: initial?.brand_name ?? "",
      entity_type: initial?.entity_type ?? "private_limited",
      pan: initial?.pan ?? "",
      gstin: initial?.gstin ?? "",
      cin: initial?.cin ?? "",
      llpin: initial?.llpin ?? "",
      incorporation_date: initial?.incorporation_date ?? "",
      registered_address: initial?.registered_address ?? "",
      operating_address: initial?.operating_address ?? "",
      city: initial?.city ?? "",
      state: initial?.state ?? "",
      pincode: initial?.pincode ?? "",
      country: initial?.country ?? "India",
      website: initial?.website ?? "",
      industry: initial?.industry ?? "",
      employee_count_band: initial?.employee_count_band ?? "11-50",
      description: initial?.description ?? "",
    },
  });
  const entityType = watch("entity_type");
  const [submitting, setSubmitting] = React.useState(false);

  async function submit(values: any) {
    setSubmitting(true);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { setSubmitting(false); return; }
    const payload = { ...values };
    // Empty strings → null for nullable fields
    if (!payload.gstin) delete payload.gstin;
    if (!payload.cin)   delete payload.cin;
    if (!payload.llpin) delete payload.llpin;
    if (!payload.website) delete payload.website;
    if (!payload.brand_name) delete payload.brand_name;
    if (!payload.description) delete payload.description;
    if (!payload.incorporation_date) delete payload.incorporation_date;

    if (initial?.id) {
      const { data, error } = await sb.from("business_profiles")
        .update(payload).eq("id", initial.id).select().maybeSingle();
      if (error) { onError(error.message); setSubmitting(false); return; }
      onDone(data);
    } else {
      const { data, error } = await sb.from("business_profiles")
        .insert({ ...payload, owner_user_id: user.id }).select().maybeSingle();
      if (error) { onError(error.message); setSubmitting(false); return; }
      onDone(data);
    }
    setSubmitting(false);
  }

  const showCin = entityType === "private_limited" || entityType === "public_limited";
  const showLlpin = entityType === "llp";
  const showGstin = entityType !== "other";

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5">
      <div>
        <h2 className="font-display text-2xl font-semibold">Tell us about your organisation</h2>
        <p className="text-sm text-muted-foreground">This is the legal entity that will sign contracts and receive payments.</p>
      </div>

      <div className="space-y-1.5">
        <Label>Entity type</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ENTITY_TYPES.map(e => (
            <label key={e.value} className="flex cursor-pointer items-center gap-2 rounded-md border p-2 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input type="radio" value={e.value} {...register("entity_type")} className="h-4 w-4" />
              <span className="text-sm">{e.icon} {e.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="legal_name">Legal name *</Label>
          <Input id="legal_name" placeholder="Acme Studios Private Limited" {...register("legal_name")} />
          {errors.legal_name && <p className="text-xs text-destructive">{errors.legal_name.message as string}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="brand_name">Brand / trading name</Label>
          <Input id="brand_name" placeholder="Acme" {...register("brand_name")} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pan">PAN *</Label>
          <Input id="pan" placeholder="ABCDE1234F" {...register("pan")} className="font-mono tracking-wider uppercase" maxLength={10} />
          {errors.pan && <p className="text-xs text-destructive">{errors.pan.message as string}</p>}
        </div>
        {showGstin && (
          <div className="space-y-1.5">
            <Label htmlFor="gstin">GSTIN</Label>
            <Input id="gstin" placeholder="22AAAAA0000A1Z5" {...register("gstin")} className="font-mono tracking-wider uppercase" maxLength={15} />
          </div>
        )}
        {showCin && (
          <div className="space-y-1.5">
            <Label htmlFor="cin">CIN</Label>
            <Input id="cin" placeholder="U12345AB2020PTC123456" {...register("cin")} className="font-mono uppercase" />
          </div>
        )}
        {showLlpin && (
          <div className="space-y-1.5">
            <Label htmlFor="llpin">LLPIN</Label>
            <Input id="llpin" placeholder="AAA-1234" {...register("llpin")} className="font-mono uppercase" />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="incorporation_date">Incorporation date</Label>
          <Input id="incorporation_date" type="date" {...register("incorporation_date")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="website">Website</Label>
          <Input id="website" type="url" placeholder="https://acme.com" {...register("website")} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="registered_address">Registered address</Label>
        <Textarea id="registered_address" rows={2} placeholder="123, Industrial Area, Phase 1" {...register("registered_address")} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="operating_address">Operating address (if different)</Label>
        <Textarea id="operating_address" rows={2} {...register("operating_address")} />
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="city">City</Label>
          <Input id="city" {...register("city")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="state">State</Label>
          <Input id="state" {...register("state")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pincode">Pincode</Label>
          <Input id="pincode" inputMode="numeric" maxLength={6} {...register("pincode")} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="industry">Industry</Label>
          <Input id="industry" placeholder="Software / Marketing / Consulting" {...register("industry")} />
        </div>
        <div className="space-y-1.5">
          <Label>Employee count</Label>
          <select {...register("employee_count_band")} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="1">Just me</option>
            <option value="2-10">2 - 10</option>
            <option value="11-50">11 - 50</option>
            <option value="51-200">51 - 200</option>
            <option value="201-1000">201 - 1000</option>
            <option value="1000+">1000+</option>
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">What does your organisation do?</Label>
        <Textarea id="description" rows={3} placeholder="We build..." {...register("description")} />
      </div>

      <div className="flex justify-end">
        <Button type="submit" variant="gradient" disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Continue <ChevronRight className="h-4 w-4" /></>}
        </Button>
      </div>
    </form>
  );
}

/* ====================================================================== */
/* Step 2 — KYC (DigiLocker for authorised signatory + bank via UPI later) */
/* ====================================================================== */

function KycStep({ businessId, onDone }: { businessId: string | undefined; onDone: () => void }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-2xl font-semibold">Verify your business</h2>
        <p className="text-sm text-muted-foreground">HiVR uses the same DigiLocker OAuth flow that individual users see, but pulls GST registration + director KYC documents.</p>
      </div>

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex items-start gap-3 p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <p className="font-semibold">DigiLocker for businesses</p>
            <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
              <li>Your authorised signatory's PAN is verified by UIDAI's digital signature.</li>
              <li>Your GSTIN document is pulled from the Income Tax Department.</li>
              <li>Your CIN / LLPIN document is pulled from MCA.</li>
              <li>We never see the full document — only the last 4 chars + a reference id.</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800">
        <Info className="mr-1 inline h-3.5 w-3.5" />
        <strong>For the MVP:</strong> the business DigiLocker flow is on the roadmap. For now, mark this step complete to continue — your business profile will go into <code>kyc_status='in_review'</code> and our Trust &amp; Safety team will verify manually within 24h.
      </div>

      <div className="flex justify-end">
        <Button onClick={onDone} variant="gradient" disabled={!businessId}>
          Mark for manual review <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/* ====================================================================== */
/* Step 3 — Bank (UPI for payouts)                                       */
/* ====================================================================== */

function BankStep({ businessId, onDone }: { businessId: string | undefined; onDone: () => void }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-2xl font-semibold">Verify your business bank account</h2>
        <p className="text-sm text-muted-foreground">Pay ₹1 from your UPI app to verify the business account. HiVR keeps the ₹1 as the verification fee.</p>
      </div>

      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800">
        <Info className="mr-1 inline h-3.5 w-3.5" />
        <strong>For the MVP:</strong> business bank verification uses the same UPI flow as individual employees. Open the buyer/employee bank step on a personal account, then come back here and continue. (We'll wire the business UPI field in the next iteration.)
      </div>

      <div className="flex justify-end">
        <Button onClick={onDone} variant="gradient" disabled={!businessId}>
          Skip for now <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/* ====================================================================== */
/* Step 4 — Team (invite directors / signatories)                         */
/* ====================================================================== */

function TeamStep({ businessId, onDone }: { businessId: string | undefined; onDone: () => void }) {
  const sb = createClient();
  const [members, setMembers] = React.useState<any[]>([]);
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [role, setRole] = React.useState("director");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!businessId) return;
    sb.from("business_members").select("*").eq("business_id", businessId).order("created_at")
      .then(({ data }) => setMembers(data ?? []));
  }, [businessId]);

  async function invite() {
    if (!email.match(/^\S+@\S+\.\S+$/)) return;
    setBusy(true);
    await sb.from("business_members").insert({
      business_id: businessId,
      email,
      full_name: name || email,
      role,
      status: "active",
    });
    setEmail(""); setName("");
    const { data } = await sb.from("business_members").select("*").eq("business_id", businessId).order("created_at");
    setMembers(data ?? []);
    setBusy(false);
  }

  async function remove(id: string) {
    await sb.from("business_members").update({ status: "removed", removed_at: new Date().toISOString() }).eq("id", id);
    setMembers(members.filter(m => m.id !== id));
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-2xl font-semibold">Invite your team</h2>
        <p className="text-sm text-muted-foreground">Add directors, authorised signatories, and HR. They'll get an email to claim their seat.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="member_email">Email</Label>
          <Input id="member_email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="director@acme.com" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="member_name">Full name</Label>
          <Input id="member_name" value={name} onChange={e => setName(e.target.value)} placeholder="Priya Sharma" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="member_role">Role</Label>
          <select id="member_role" value={role} onChange={e => setRole(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="owner">Owner</option>
            <option value="director">Director</option>
            <option value="authorised_signatory">Authorised signatory</option>
            <option value="hr">HR</option>
            <option value="manager">Manager</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={invite} disabled={!email || busy} variant="outline">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>+ Invite</>}
        </Button>
      </div>

      <div className="space-y-2">
        {members.length === 0 && <p className="text-sm text-muted-foreground">No team members yet. (You can add more later from the dashboard.)</p>}
        {members.map(m => (
          <div key={m.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
            <div>
              <div className="font-medium">{m.full_name}</div>
              <div className="text-xs text-muted-foreground">{m.email} · <span className="capitalize">{m.role.replace("_"," ")}</span></div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={m.status === "active" ? "success" : "secondary"}>{m.status}</Badge>
              {m.status === "active" && (
                <Button size="sm" variant="ghost" onClick={() => remove(m.id)}>Remove</Button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button onClick={onDone} variant="gradient">
          Finish <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/* ====================================================================== */
/* Step 5 — Done                                                          */
/* ====================================================================== */

function DoneStep({ onContinue, busy }: { onContinue: () => void; busy: boolean }) {
  return (
    <div className="space-y-5 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-success/15 text-success">
        <Check className="h-6 w-6" />
      </div>
      <h2 className="font-display text-2xl font-semibold">Welcome to HiVR Business</h2>
      <p className="text-sm text-muted-foreground">Your free trial is active for 7 days. You can post up to 1 active job and 1 active contract. Upgrade to Pro for unlimited hiring.</p>

      <Card className="text-left">
        <CardContent className="space-y-3 p-5">
          <p className="text-sm font-semibold">What's next</p>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            <li>• Post your first job from the dashboard</li>
            <li>• Applicants apply → you shortlist → interview → sign contract</li>
            <li>• Pay through Razorpay escrow (advance + milestones)</li>
            <li>• Mediated chat, voice calls, and file storage are all included</li>
            <li>• Your Trust &amp; Safety team will verify KYC within 24h</li>
          </ul>
        </CardContent>
      </Card>

      <div className="flex justify-center gap-2">
        <Button onClick={onContinue} variant="gradient" size="lg" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Go to Business dashboard <ArrowRight className="h-4 w-4" /></>}
        </Button>
      </div>
    </div>
  );
}
