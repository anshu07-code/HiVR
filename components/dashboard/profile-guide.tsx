"use client";

/**
 * ProfileGuide — an interactive guide that helps the user build a
 * profile card exactly like the one on the Find People page.
 *
 * What it does:
 *  - Shows a LIVE mini PersonCard preview on the left, using the
 *    user's current profile data. As the user fills in fields in
 *    the other tabs, the preview updates.
 *  - Shows a step-by-step checklist on the right. Each step is
 *    either "done" (green check) or "missing" (highlighted prompt).
 *    Clicking a step jumps to the relevant tab.
 *  - Explains which field affects which part of the card.
 */

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PersonCard } from "@/components/find-people/person-card";
import {
  CheckCircle2, Circle, Sparkles, Camera, MapPin, FileText, Briefcase,
  Award, Clock, BadgeCheck, ArrowRight, Lightbulb, X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Initial = {
  fullName: string; email: string; avatarUrl: string | null; coverUrl: string | null;
  headline: string; bio: string; location: string; experienceType: string;
  hourlyRatePaise: number | null; availabilityHours: number | null; timezone: string;
  skills: { category_id: string; name?: string; slug?: string; icon?: string; is_primary?: boolean; years_experience?: number }[];
  socialLinks: any[];
};

type Tab = "basics" | "skills" | "videos" | "education" | "experience" | "projects" | "certs" | "links" | "resume";

type Props = {
  initial: Initial;
  currentTab: Tab;
  setTab: (t: Tab) => void;
  initialCompleteness: number;
};

/**
 * Each step maps a user-facing field to (a) where to fix it, (b) the
 * visible part of the card it controls, and (c) a short why-it-matters
 * blurb. The order is the same order they'll appear on the finished
 * card top-to-bottom.
 */
const STEPS: Array<{
  id: string;
  label: string;
  why: string;
  cardPart: string;
  tab: Tab;
  Icon: React.ComponentType<{ className?: string }>;
  isDone: (i: Initial) => boolean;
}> = [
  {
    id: "photo",
    label: "Add a clear profile photo",
    why: "Cards with real photos get ~3× more profile views. Buyers shortlist based on first impressions.",
    cardPart: "The avatar (half-out, half-in)",
    tab: "basics",
    Icon: Camera,
    isDone: (i) => !!i.avatarUrl,
  },
  {
    id: "name",
    label: "Use your real full name",
    why: "Buyers want to know who they're hiring. Initials and handles look unfinished.",
    cardPart: "Below the avatar",
    tab: "basics",
    Icon: Sparkles,
    isDone: (i) => i.fullName.trim().split(/\s+/).length >= 2,
  },
  {
    id: "headline",
    label: "Write a 1-line headline",
    why: "Headline shows up right under your name. Think of it as your tagline — what you do, for whom, and why it matters.",
    cardPart: "Subtitle under the name",
    tab: "basics",
    Icon: FileText,
    isDone: (i) => (i.headline ?? "").trim().length >= 10,
  },
  {
    id: "bio",
    label: "Write a 2-line bio",
    why: "Buyers scan bios for proof you'll deliver. Mention your strongest skill, years of experience, and the result you produce.",
    cardPart: "2 lines under the headline",
    tab: "basics",
    Icon: FileText,
    isDone: (i) => (i.bio ?? "").trim().length >= 60,
  },
  {
    id: "location",
    label: "Add your city",
    why: "Many buyers prefer people in their timezone. Adding a city unlocks local-search filters.",
    cardPart: "Location row",
    tab: "basics",
    Icon: MapPin,
    isDone: (i) => (i.location ?? "").trim().length > 0,
  },
  {
    id: "rate",
    label: "Set an hourly rate",
    why: "Cards without a rate get filtered out by buyers who use a budget. Even a placeholder is better than blank.",
    cardPart: "Rate in the location row",
    tab: "basics",
    Icon: Briefcase,
    isDone: (i) => (i.hourlyRatePaise ?? 0) > 0,
  },
  {
    id: "availability",
    label: "Set your weekly hours",
    why: "Anything > 0 h/week triggers the green 'Available' badge — buyers filter heavily by this.",
    cardPart: "Triggers the Available badge",
    tab: "basics",
    Icon: Clock,
    isDone: (i) => (i.availabilityHours ?? 0) > 0,
  },
  {
    id: "skills",
    label: "Add at least 1 skill",
    why: "Skills become the colored pills on the bottom of the card and let you appear in category searches.",
    cardPart: "Skill pills (bottom of card)",
    tab: "skills",
    Icon: Award,
    isDone: (i) => i.skills.length >= 1,
  },
  {
    id: "links",
    label: "Add at least 1 social link",
    why: "Portfolio / GitHub / LinkedIn build trust. Adds the 'verified by external proof' signal.",
    cardPart: "Boosted to the public profile",
    tab: "links",
    Icon: BadgeCheck,
    isDone: (i) => i.socialLinks.length >= 1,
  },
  {
    id: "verified",
    label: "Complete KYC (Aadhaar)",
    why: "Adds the green checkmark on your avatar. Verified cards rank higher in search results.",
    cardPart: "Green checkmark on the avatar",
    tab: "basics",
    Icon: BadgeCheck,
    isDone: (i) => false, // KYC status isn't on `Initial`; we show this as always-pending
  },
];

export function ProfileGuide({ initial, currentTab, setTab, initialCompleteness }: Props) {
  const [dismissed, setDismissed] = React.useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem("pg_dismissed") === "true";
  });
  const [activeStep, setActiveStep] = React.useState<string | null>(null);

  // Compute per-step status from the live data.
  const stepStatus = React.useMemo(
    () => STEPS.map(s => ({ ...s, done: s.isDone(initial) })),
    [initial]
  );
  const doneCount = stepStatus.filter(s => s.done).length;
  const totalCount = stepStatus.length;
  const liveCompleteness = Math.round((doneCount / totalCount) * 100);

  React.useEffect(() => {
    sessionStorage.setItem("pg_dismissed", String(dismissed));
  }, [dismissed]);

  if (dismissed) {
    return (
      <button
        onClick={() => setDismissed(false)}
        className="fixed bottom-24 right-4 z-30 inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:bg-accent md:bottom-6"
      >
        <Lightbulb className="h-3.5 w-3.5" />
        Show profile guide
      </button>
    );
  }

  return (
    <Card className="overflow-hidden border-primary/20">
      <CardHeader className="flex flex-row items-start justify-between gap-2 bg-gradient-to-br from-primary/5 via-primary/[0.02] to-transparent pb-3">
        <div className="flex items-start gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary">
            <Lightbulb className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-base">Profile guide — build a card buyers click</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              The card on the left is your live preview. As you fill in the form, it updates in real time. Use the steps on the right to track what's still missing.
            </p>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Dismiss guide"
        >
          <X className="h-4 w-4" />
        </button>
      </CardHeader>

      <CardContent className="grid gap-5 p-5 md:grid-cols-[260px,1fr]">
        {/* Live preview */}
        <div className="rounded-lg border bg-muted/30 p-4">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Your card (live preview)
          </p>
          <PersonCard
            id="preview"
            full_name={initial.fullName || "Your Name"}
            avatar_url={initial.avatarUrl}
            headline={initial.headline}
            bio={initial.bio}
            location={initial.location}
            avg_rating={null}
            total_reviews={0}
            experience_type={initial.experienceType}
            hourly_rate_paise={initial.hourlyRatePaise}
            availability_hours={initial.availabilityHours}
            is_top={false}
            is_available={(initial.availabilityHours ?? 0) > 0}
            is_verified={false}
            skills={initial.skills.map((s, i) => ({
              id: s.category_id,
              category: { name: s.name ?? "Skill", slug: s.slug ?? "skill", tier: "micro_task", icon: s.icon ?? "code" },
            }))}
            className="pointer-events-none"
          />
        </div>

        {/* Checklist */}
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">
                {doneCount} of {totalCount} steps complete
              </span>
              <span className="text-muted-foreground">{liveCompleteness}%</span>
            </div>
            <Progress value={liveCompleteness} className="mt-1.5 h-1.5" />
          </div>

          <ol className="space-y-1">
            {stepStatus.map((s) => {
              const isActive = activeStep === s.id;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveStep(s.id);
                      setTab(s.tab);
                      document.getElementById(`tab-${s.tab}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    onMouseEnter={() => setActiveStep(s.id)}
                    onMouseLeave={() => setActiveStep(null)}
                    className={cn(
                      "group flex w-full items-start gap-3 rounded-lg border p-2.5 text-left transition-colors",
                      isActive
                        ? "border-primary/40 bg-primary/5"
                        : s.done
                          ? "border-success/30 bg-success/5 hover:border-success/40"
                          : "border-border bg-card hover:border-primary/30 hover:bg-accent/40"
                    )}
                  >
                    <span className={cn(
                      "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full",
                      s.done ? "bg-success/20 text-success" : "bg-muted text-muted-foreground"
                    )}>
                      {s.done ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={cn(
                        "flex items-center gap-1.5 text-sm font-medium",
                        s.done && "text-success"
                      )}>
                        <s.Icon className="h-3.5 w-3.5 shrink-0" />
                        {s.label}
                      </p>
                      {(isActive || !s.done) && (
                        <>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{s.why}</p>
                          <p className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-primary">
                            <span>Controls:</span>
                            <span className="rounded-full bg-primary/10 px-1.5 py-0.5">{s.cardPart}</span>
                          </p>
                        </>
                      )}
                    </div>
                    <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
