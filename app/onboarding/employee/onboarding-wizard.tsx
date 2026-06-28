"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Check, ChevronRight, ChevronLeft, Sparkles, AlertTriangle, Loader2,
  ShieldCheck, User, Lock, Info, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { EmployeeProfileSchema } from "@/lib/schemas";
import { CategoryIcon } from "@/components/marketing/category-icon";

type Step = "profile" | "tier" | "skill" | "tierb_intro" | "verify" | "done";
const STEPS: Step[] = ["profile", "tier", "skill", "tierb_intro", "verify", "done"];

type Cat = { id: string; slug: string; name: string; icon: string; tier: string; status: string };

export function EmployeeOnboarding({
  profile, skills, categories,
}: { profile: any; skills: any[]; categories: Cat[] }) {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>(profile?.bio ? "tier" : "profile");

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

      {step === "profile"    && <ProfileStep onDone={() => setStep("tier")} />}
      {step === "tier"       && <TierStep onPickTier={(tier) => setStep(tier === "tier_b" ? "tierb_intro" : "skill")} />}
      {step === "skill"      && <SkillTestStep categories={categories.filter(c => c.tier === "micro_task")} onDone={() => setStep("verify")} />}
      {step === "tierb_intro"&& <TierBIntroStep categories={categories.filter(c => c.tier === "role_engagement")} onDone={() => setStep("verify")} />}
      {step === "verify"     && <VerifyStep onDone={() => setStep("done")} onSkip={() => setStep("done")} />}
      {step === "done"       && <DoneStep />}
    </div>
  );
}

/* ====================================================================== */
/* Step 1 — Profile                                                       */
/* ====================================================================== */

function ProfileStep({ onDone }: { onDone: () => void }) {
  const { register, handleSubmit, control, formState: { errors } } = useForm({
    resolver: zodResolver(EmployeeProfileSchema),
    defaultValues: { bio: "", languages: ["English"], location: "", experience_type: "fresher" as const },
  });
  const [lang, setLang] = React.useState("English");
  const [submitting, setSubmitting] = React.useState(false);
  const sb = createClient();

  async function onSubmit(values: any) {
    setSubmitting(true);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { setSubmitting(false); return; }
    const { error } = await sb.from("employee_profiles").upsert({
      user_id: user.id,
      bio: values.bio,
      languages: [lang],
      location: values.location,
      experience_type: values.experience_type,
    });
    if (error) { setSubmitting(false); return; }
    setSubmitting(false);
    onDone();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div>
        <h2 className="font-display text-2xl font-semibold">Tell us about you</h2>
        <p className="text-sm text-muted-foreground">This shows up on your public profile. Be specific — buyers love that.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="bio">Short bio</Label>
        <Textarea id="bio" rows={4} placeholder="I'm a 3rd-year CS student at XYZ, comfortable with Python and React. I love cleaning messy data and writing SQL queries that actually run." {...register("bio")} />
        {errors.bio && <p className="text-xs text-destructive">{errors.bio.message as string}</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="location">Location</Label>
          <Input id="location" placeholder="Bangalore, India" {...register("location")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="languages">Primary language</Label>
          <select
            id="languages"
            value={lang}
            onChange={e => setLang(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {["English","Hindi","Tamil","Telugu","Bengali","Marathi","Gujarati","Kannada","Malayalam","Punjabi","Other"].map(l => <option key={l}>{l}</option>)}
          </select>
        </div>
      </div>
      <div>
        <Label>Experience</Label>
        <Controller
          control={control}
          name="experience_type"
          render={({ field }) => (
            <RadioGroup
              value={field.value}
              onValueChange={field.onChange}
              className="mt-2 grid gap-2 sm:grid-cols-2"
            >
              <label className="flex items-start gap-2 rounded-md border p-3 has-[button[data-state=checked]]:border-primary has-[button[data-state=checked]]:bg-primary/5 cursor-pointer">
                <RadioGroupItem value="experienced" id="exp-experienced" />
                <div className="flex-1">
                  <div className="text-sm font-semibold">I have work experience</div>
                  <div className="text-xs text-muted-foreground">You&apos;ll be able to upload resume + portfolio.</div>
                </div>
              </label>
              <label className="flex items-start gap-2 rounded-md border p-3 has-[button[data-state=checked]]:border-primary has-[button[data-state=checked]]:bg-primary/5 cursor-pointer">
                <RadioGroupItem value="fresher" id="exp-fresher" />
                <div className="flex-1">
                  <div className="text-sm font-semibold">I&apos;m a student / fresher</div>
                  <div className="text-xs text-muted-foreground">No problem — show us what you can do instead. We welcome first-timers.</div>
                </div>
              </label>
            </RadioGroup>
          )}
        />
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
/* Step 2 — Tier                                                          */
/* ====================================================================== */

function TierStep({ onPickTier }: { onPickTier: (tier: "tier_a" | "tier_b") => void }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-2xl font-semibold">Pick your track</h2>
        <p className="text-sm text-muted-foreground">You can do both — but each tier has its own verification step.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <button onClick={() => onPickTier("tier_a")} className="rounded-xl border p-5 text-left transition-colors hover:border-primary/50">
          <Badge variant="tierA">Tier A — Micro-Tasks</Badge>
          <h3 className="mt-2 font-display text-lg font-semibold">Bounded, single-sitting work</h3>
          <p className="mt-1 text-sm text-muted-foreground">Spreadsheet, bug fixes, mentoring. Auto-tested practical challenge.</p>
        </button>
        <button onClick={() => onPickTier("tier_b")} className="rounded-xl border p-5 text-left transition-colors hover:border-primary/50">
          <Badge variant="tierB">Tier B — Role Engagements</Badge>
          <h3 className="mt-2 font-display text-lg font-semibold">Multi-week project capacity</h3>
          <p className="mt-1 text-sm text-muted-foreground">Full Stack, AI/ML, NLP. Portfolio review + live technical interview.</p>
        </button>
      </div>
    </div>
  );
}

/* ====================================================================== */
/* Step 3 — Skill test (Tier A)                                           */
/* ====================================================================== */

function SkillTestStep({ categories, onDone }: { categories: Cat[]; onDone: () => void }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-2xl font-semibold">Take a skill test</h2>
        <p className="text-sm text-muted-foreground">Pick a category and pass a 20–60 min practical test to unlock contracts in that category.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {categories.map(c => (
          <a key={c.id} href={`/dashboard/skills/test?category=${c.slug}`} className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:border-primary/50">
            <div className="grid h-10 w-10 place-items-center rounded-md bg-primary/10 text-primary">
              <CategoryIcon name={c.icon} className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">{c.name}</div>
              <div className="text-xs text-muted-foreground">20-60 min practical</div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </a>
        ))}
      </div>
      <div className="flex justify-between">
        <Button variant="ghost" onClick={onDone}><ChevronLeft className="h-4 w-4" />Skip for now</Button>
      </div>
    </div>
  );
}

/* ====================================================================== */
/* Step 4 — Tier B intro                                                   */
/* ====================================================================== */

function TierBIntroStep({ categories, onDone }: { categories: Cat[]; onDone: () => void }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-2xl font-semibold">Tier B — interview-required</h2>
        <p className="text-sm text-muted-foreground">
          For role engagements, you need a portfolio review + live technical interview. Book a slot from
          <a href="/dashboard/interviews" className="ml-1 text-primary underline">/dashboard/interviews</a> when admins post one.
        </p>
      </div>
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
        <p className="font-medium">Why this step exists</p>
        <p className="mt-1 text-muted-foreground">
          Tier B buyers pay premium day-rates or per-milestone. They need someone with verified, demonstrable engineering judgment — not just an automated test. Interviews are conducted by senior verified engineers and use a category-specific rubric.
        </p>
      </div>
      <div className="grid gap-2">
        {categories.map(c => (
          <div key={c.id} className="flex items-center gap-3 rounded-lg border p-4">
            <div className="grid h-10 w-10 place-items-center rounded-md bg-violet-500/10 text-violet-700 dark:text-violet-300">
              <CategoryIcon name={c.icon} className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold">{c.name}</div>
              <div className="text-xs text-muted-foreground">Interview slots opening soon</div>
            </div>
            <Button asChild variant="gradient" size="sm">
              <a href="/dashboard/interviews">View slots</a>
            </Button>
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <Button onClick={onDone} variant="gradient">Continue <ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

/* ====================================================================== */
/* Step 5 — Verify (NEW: free, no DigiLocker)                              */
/* ====================================================================== */

function VerifyStep({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-2xl font-semibold">Verify your identity</h2>
        <p className="text-sm text-muted-foreground">
          HiVR has moved to a free, in-app verification. No DigiLocker, no third-party KYC provider. Just a selfie and a government ID.
        </p>
      </div>
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="font-semibold">How the new flow works</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
              <li><strong>3-second liveness selfie</strong> — blink, turn, smile. Your camera is mirrored, not recorded.</li>
              <li><strong>OCR your ID locally</strong> — we extract name, DOB, document number without sending them anywhere.</li>
              <li><strong>Most users get auto-approved in &lt;60 seconds.</strong> The rest go to a human reviewer.</li>
              <li>Your document number is HMAC-hashed before storage. We never store plaintext.</li>
            </ul>
          </div>
        </div>
      </div>
      <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
        <Info className="mr-1 inline h-3.5 w-3.5" />
        Old DigiLocker / Aadhaar eKYC is no longer needed. Existing verifications stay valid.
      </div>
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onSkip}><ChevronLeft className="h-4 w-4" />Skip for now</Button>
        <Button asChild variant="gradient" size="lg">
          <a href="/onboarding/verify">
            Start verification <ArrowRight className="h-4 w-4" />
          </a>
        </Button>
      </div>
    </div>
  );
}

/* ====================================================================== */
/* Step 6 — Done                                                          */
/* ====================================================================== */

function DoneStep() {
  return (
    <div className="space-y-5 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-success/15 text-success">
        <Check className="h-6 w-6" />
      </div>
      <h2 className="font-display text-2xl font-semibold">You&apos;re set up</h2>
      <p className="text-sm text-muted-foreground">Head to your dashboard to see skill tests, contracts, and your tier progression.</p>
      <div className="flex justify-center gap-2">
        <Button asChild variant="gradient"><a href="/dashboard">Go to dashboard</a></Button>
        <Button asChild variant="outline"><a href="/browse">Browse tasks</a></Button>
      </div>
    </div>
  );
}
