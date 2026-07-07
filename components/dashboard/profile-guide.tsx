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
  Award, Clock, ArrowRight, Lightbulb, ChevronDown, ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Initial = {
  fullName: string; email: string; avatarUrl: string | null; coverUrl?: string | null;
  headline: string; bio: string; location: string; experienceType: string;
  hourlyRatePaise: number | null; availabilityHours: number | null; timezone: string;
  skills: { category_id: string; name?: string; slug?: string; icon?: string; is_primary?: boolean; years_experience?: number; rate_per_hour_paise?: number | null; rate_per_task_paise?: number | null }[];
  socialLinks: any[];
  educationCount: number;
  experienceCount: number;
  projectsCount: number;
  certificationsCount: number;
  hasResume: boolean;
};

type Tab = "basics" | "skills" | "videos" | "education" | "experience" | "projects" | "certs" | "achievements" | "links" | "resume";

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
    why: "Buyers want to know who they're hiring.",
    cardPart: "Below the avatar",
    tab: "basics",
    Icon: Sparkles,
    isDone: (i) => !!i.fullName,
  },
  {
    id: "headline",
    label: "Write a 1-line headline",
    why: "Headline shows up right under your name — what you do, for whom, and why it matters.",
    cardPart: "Subtitle under the name",
    tab: "basics",
    Icon: FileText,
    isDone: (i) => (i.headline ?? "").trim().length >= 10,
  },
  {
    id: "bio",
    label: "Write a bio",
    why: "Buyers scan bios for proof you'll deliver. Mention your strongest skill and experience.",
    cardPart: "2 lines under the headline",
    tab: "basics",
    Icon: FileText,
    isDone: (i) => (i.bio ?? "").trim().length > 20,
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
    id: "availability",
    label: "Set your weekly hours",
    why: "Anything > 0 h/week triggers the green 'Available' badge — buyers filter heavily by this.",
    cardPart: "Triggers the Available badge",
    tab: "basics",
    Icon: Clock,
    isDone: (i) => (i.availabilityHours ?? 0) > 0,
  },
  {
    id: "skills1",
    label: "Add at least 1 skill",
    why: "Skills become the colored pills on the bottom of the card and let you appear in category searches.",
    cardPart: "Skill pills (bottom of card)",
    tab: "skills",
    Icon: Award,
    isDone: (i) => i.skills.length >= 1,
  },
  {
    id: "skills3",
    label: "Add 3+ skills",
    why: "Having multiple skills shows you're versatile and increases your match rate in search results.",
    cardPart: "More skill pills",
    tab: "skills",
    Icon: Award,
    isDone: (i) => i.skills.length >= 3,
  },
  {
    id: "education",
    label: "Add your education",
    why: "Buyers trust qualified professionals. Schools, colleges, and certifications build credibility.",
    cardPart: "Shown in your profile details",
    tab: "education",
    Icon: Award,
    isDone: (i) => i.educationCount > 0,
  },
  {
    id: "experience",
    label: "Add work experience",
    why: "Past projects and roles prove you can deliver. Even internships count.",
    cardPart: "Shown in your profile details",
    tab: "experience",
    Icon: Briefcase,
    isDone: (i) => i.experienceCount > 0,
  },
  {
    id: "projects",
    label: "Add portfolio projects",
    why: "Show real work samples — buyers love seeing what you've actually built.",
    cardPart: "Shown in your profile details",
    tab: "projects",
    Icon: Briefcase,
    isDone: (i) => i.projectsCount > 0,
  },
  {
    id: "certs",
    label: "Add certifications",
    why: "Certifications validate your expertise and help you stand out from other freelancers.",
    cardPart: "Shown in your profile details",
    tab: "certs",
    Icon: Award,
    isDone: (i) => i.certificationsCount > 0,
  },
  {
    id: "resume",
    label: "Upload your resume",
    why: "A resume gives buyers a complete picture of your professional background at a glance.",
    cardPart: "Downloadable from your profile",
    tab: "resume",
    Icon: FileText,
    isDone: (i) => i.hasResume,
  },
  {
    id: "links",
    label: "Add social links",
    why: "LinkedIn, GitHub, and portfolio links let buyers verify your work and reach out.",
    cardPart: "Social links section",
    tab: "links",
    Icon: Award,
    isDone: (i) => (i.socialLinks ?? []).length > 0,
  },
];

export function ProfileGuide({ initial, currentTab, setTab, initialCompleteness }: Props) {
  const [collapsed, setCollapsed] = React.useState(false);
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
    sessionStorage.setItem("pg_collapsed", String(collapsed));
  }, [collapsed]);

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
              The card on the left is your live preview. Use the steps on the right to track what's still missing.
            </p>
          </div>
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={collapsed ? "Expand guide" : "Collapse guide"}
        >
          {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
      </CardHeader>

      {!collapsed && (
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
              <span className="text-muted-foreground">{initialCompleteness}%</span>
            </div>
            <Progress value={initialCompleteness} className="mt-1.5 h-1.5" />
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
      )}
    </Card>
  );
}
