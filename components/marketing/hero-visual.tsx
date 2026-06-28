"use client";

/**
 * HeroVisual — the rotating "what can I hire for" preview in the landing
 * page hero. Cycles through 5 live category mini-scenes on a 4s timer.
 *
 * Theme-aware by construction: every color, border, and background uses
 * a CSS variable (bg-card, text-card-foreground, bg-muted, border-border,
 * text-primary, bg-success, …) so the same component renders correctly
 * in light, dark, and eye-shield modes without any theme-specific code.
 *
 * Pauses rotation on hover so the user can read the active scene.
 */

import { useEffect, useRef, useState } from "react";
import { Clock, ShieldCheck, Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// -------------------------------------------------------------------------
//                            SCENE DEFINITIONS
// -------------------------------------------------------------------------

type Scene = {
  id: string;
  category: string;
  title: string;
  duration: string;
  budget: string;
  pricingModel: string;
  pricingLabel: string;
  preview: React.ReactNode;
};

const ROTATE_MS = 2500;

/* ─── 1. Spreadsheet & Data ─── */
const SpreadsheetPreview = () => (
  <div className="overflow-hidden rounded-md border border-border bg-background/60">
    <div className="grid grid-cols-3 border-b border-border bg-muted/50 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
      <div className="px-2 py-1.5">Vendor</div>
      <div className="px-2 py-1.5">Amount</div>
      <div className="px-2 py-1.5">Status</div>
    </div>
    {[
      { v: "Acme Co.",   a: "₹1,42,800", s: "matched"  },
      { v: "Brightline", a: "₹87,200",   s: "matched"  },
      { v: "Cosmic Ltd", a: "₹63,450",   s: "resolved" },
    ].map((row, i) => (
      <div
        key={row.v}
        className={cn(
          "grid grid-cols-3 text-[11px] animate-cell-fill",
          i < 2 && "border-b border-border/60"
        )}
        style={{ animationDelay: `${i * 120}ms` }}
      >
        <div className="px-2 py-1.5 text-card-foreground">{row.v}</div>
        <div className="px-2 py-1.5 font-mono text-card-foreground">{row.a}</div>
        <div className="px-2 py-1.5">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium",
              row.s === "resolved"
                ? "bg-success/15 text-success"
                : "bg-primary/15 text-primary"
            )}
          >
            <span className="h-1 w-1 rounded-full bg-current" />
            {row.s}
          </span>
        </div>
      </div>
    ))}
  </div>
);

/* ─── 2. Tech Micro-Tasks ─── */
const CodePreview = () => (
  <div className="overflow-hidden rounded-md border border-border bg-muted/50 font-mono text-[10.5px] leading-relaxed">
    <div className="flex items-center gap-1.5 border-b border-border bg-background/40 px-2 py-1">
      <span className="h-1.5 w-1.5 rounded-full bg-rose-500/70" />
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500/70" />
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/70" />
      <span className="ml-2 text-muted-foreground">~/repo/billing.ts</span>
      <span className="ml-auto inline-flex items-center gap-1 text-[9px] text-success">
        <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
        tests ✓
      </span>
    </div>
    <div className="space-y-0.5 p-2 text-card-foreground">
      <div>
        <span className="text-rose-500">const</span>{" "}
        <span className="text-primary">fix</span> ={" "}
        <span className="text-amber-500">async</span> () =&gt; {`{`}
      </div>
      <div className="pl-3">
        <span className="text-amber-500">await</span> test.
        <span className="text-primary">run</span>();
      </div>
      <div>
        {`}`} <span className="text-emerald-500">// null ref patched</span>
        <span className="ml-1 inline-block h-2.5 w-1.5 animate-pulse bg-amber-500 align-middle" />
      </div>
    </div>
  </div>
);

/* ─── 3. Mentoring ─── */
const MentoringPreview = () => (
  <div className="relative overflow-hidden rounded-md border border-border bg-muted/50 p-3">
    <div className="flex items-center gap-3">
      <div className="relative">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-violet-500 text-xs font-semibold text-white">
          PM
        </div>
        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-success" />
      </div>
      <div className="relative">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-amber-500 text-xs font-semibold text-white">
          AK
        </div>
        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-success" />
      </div>
      <div className="ml-auto flex items-center gap-1.5 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-500">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
        LIVE
      </div>
    </div>
    <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
      <span>JEE Maths · Ch. 8</span>
      <span className="ml-auto font-mono">00:24:18</span>
    </div>
    {/* equalizer-style audio bars to suggest active conversation */}
    <div className="mt-1.5 flex h-3 items-end gap-0.5">
      {[0.4, 0.9, 0.6, 1, 0.7, 0.5, 0.85, 0.45, 0.95, 0.6].map((h, i) => (
        <span
          key={i}
          className="block w-0.5 rounded-sm bg-primary/60 animate-sound-wave"
          style={{
            height: `${h * 100}%`,
            animationDelay: `${i * 80}ms`,
          }}
        />
      ))}
    </div>
  </div>
);

/* ─── 4. Full Stack Dev ─── */
const FullStackPreview = () => (
  <div className="overflow-hidden rounded-md border border-border bg-muted/50">
    <div className="flex items-center gap-1.5 border-b border-border bg-background/40 px-2 py-1">
      <div className="flex gap-0.5">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500/70" />
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500/70" />
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/70" />
      </div>
      <div className="ml-1 flex-1 truncate rounded-sm bg-background/60 px-1.5 py-0.5 text-[9px] text-muted-foreground">
        app.hivr.com / checkout
      </div>
      <span className="text-[9px] text-success">200 OK</span>
    </div>
    <div className="space-y-1.5 p-2">
      <div className="h-2 w-3/4 rounded bg-foreground/15" />
      <div className="h-1.5 w-1/2 rounded bg-foreground/10" />
      <div className="flex items-center gap-1.5">
        <div className="h-5 w-16 rounded bg-primary/30 animate-bar-grow" />
        <div
          className="h-5 w-12 rounded border border-primary/40 animate-bar-grow"
          style={{ animationDelay: "120ms" }}
        />
        <span className="ml-auto text-[9px] font-mono text-success">
          23ms
        </span>
      </div>
    </div>
  </div>
);

/* ─── 5. AI / ML Engineering ─── */
const AIPreview = () => (
  <div className="space-y-1.5 rounded-md border border-border bg-muted/50 p-2">
    <div className="ml-auto max-w-[80%] rounded-lg bg-primary/15 px-2 py-1 text-[10.5px] text-card-foreground animate-msg-in">
      Summarise Q3 burn rate
    </div>
    <div className="flex items-start gap-1.5 animate-msg-in" style={{ animationDelay: "200ms" }}>
      <div className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-violet-500 text-[8px] font-bold text-white">
        AI
      </div>
      <div className="max-w-[85%] rounded-lg bg-background/60 px-2 py-1 text-[10.5px] text-card-foreground">
        <span className="animate-stream">$1.2M burn · 18mo runway</span>
        <span className="ml-0.5 inline-block h-2.5 w-1 animate-pulse bg-emerald-500 align-middle" />
      </div>
    </div>
  </div>
);

const SCENES: Scene[] = [
  {
    id: "spreadsheet",
    category: "Spreadsheet & Data · Tier A",
    title: "Reconcile 3 vendor CSVs into one clean sheet",
    duration: "12 hrs",
    budget: "₹6,000",
    pricingModel: "Fixed",
    pricingLabel: "per task",
    preview: <SpreadsheetPreview />,
  },
  {
    id: "tech",
    category: "Tech Micro-Tasks · Tier A",
    title: "Fix null-ref bug in billing.ts + add tests",
    duration: "4 hrs",
    budget: "₹2,400",
    pricingModel: "Fixed",
    pricingLabel: "per task",
    preview: <CodePreview />,
  },
  {
    id: "mentoring",
    category: "Mentoring · Tier A",
    title: "Live 1:1 JEE Maths session — chapter 8",
    duration: "1 hr",
    budget: "₹800",
    pricingModel: "Hourly",
    pricingLabel: "per session",
    preview: <MentoringPreview />,
  },
  {
    id: "fullstack",
    category: "Full Stack Dev · Tier B",
    title: "Build checkout endpoint with Stripe webhooks",
    duration: "3 days",
    budget: "₹18,000",
    pricingModel: "Per day",
    pricingLabel: "milestone",
    preview: <FullStackPreview />,
  },
  {
    id: "ai",
    category: "AI / ML Engineering · Tier B",
    title: "Fine-tune RAG on 200 support tickets",
    duration: "5 days",
    budget: "₹32,000",
    pricingModel: "Per day",
    pricingLabel: "milestone",
    preview: <AIPreview />,
  },
];

// -------------------------------------------------------------------------
//                            COMPONENT
// -------------------------------------------------------------------------

export function HeroVisual() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (paused) return;
    timer.current = setInterval(() => {
      setActive((i) => (i + 1) % SCENES.length);
    }, ROTATE_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [paused]);

  const scene = SCENES[active];

  return (
    <div
      className="relative mx-auto w-full max-w-md"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <Card className="relative overflow-hidden">
        <CardContent className="space-y-3 p-5">
          {/* Rotating content — keyed by `active` so CSS animations
              re-run on each scene change. */}
          <div key={active} className="space-y-3 animate-fade-up">
            <div className="flex items-center gap-2">
              <Badge variant="live">Live</Badge>
              <span className="text-xs text-muted-foreground">
                {scene.category}
              </span>
            </div>
            <h3 className="min-h-[2.75rem] font-display text-base font-semibold leading-snug text-card-foreground">
              {scene.title}
            </h3>
            <div className="min-h-[112px]">{scene.preview}</div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-md bg-muted px-2 py-1.5 text-center">
                <div className="font-semibold text-card-foreground">
                  {scene.duration}
                </div>
                <div className="text-muted-foreground">est.</div>
              </div>
              <div className="rounded-md bg-muted px-2 py-1.5 text-center">
                <div className="font-semibold text-card-foreground">
                  {scene.budget}
                </div>
                <div className="text-muted-foreground">budget</div>
              </div>
              <div className="rounded-md bg-muted px-2 py-1.5 text-center">
                <div className="font-semibold text-card-foreground">
                  {scene.pricingModel}
                </div>
                <div className="text-muted-foreground">
                  {scene.pricingLabel}
                </div>
              </div>
            </div>
          </div>

          {/* Static trust strip — these don't rotate (they represent the
              platform, not a specific scene). */}
          <div className="flex -space-x-2">
            {["A", "B", "C", "D"].map((c, i) => (
              <div
                key={c}
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-full border-2 border-card text-xs font-medium text-primary-foreground",
                  ["bg-primary", "bg-amber-500", "bg-violet-500", "bg-emerald-500"][i]
                )}
              >
                {c}
              </div>
            ))}
            <div className="grid h-8 w-8 place-items-center rounded-full border-2 border-card bg-muted text-xs font-medium text-muted-foreground">
              +12
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-border pt-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              Posted 2h ago
            </div>
            <Button size="sm" variant="gradient">
              Hire
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Dot indicators — click to jump, also reflect auto-rotation. */}
      <div className="mt-3 flex items-center justify-center gap-1.5">
        {SCENES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActive(i)}
            aria-label={`Show ${s.category}`}
            className={cn(
              "h-1.5 rounded-full transition-all duration-300",
              i === active
                ? "w-6 bg-primary"
                : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60"
            )}
          />
        ))}
      </div>

      {/* Floating trust cards */}
      <Card className="absolute -bottom-6 -left-6 hidden w-60 rotate-[-4deg] shadow-lg md:block">
        <CardContent className="p-3">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-success/15 text-success">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-card-foreground">
                Aadhaar verified
              </p>
              <p className="text-[10px] text-muted-foreground">
                + live-skill tested
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="absolute -right-4 top-12 hidden w-48 rotate-[3deg] shadow-lg md:block">
        <CardContent className="p-3">
          <p className="text-xs font-semibold text-card-foreground">
            Tier A · Skill-Verified
          </p>
          <div className="mt-1 flex gap-0.5 text-amber-500">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="h-3 w-3 fill-current" />
            ))}
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            48 contracts · 100% completion
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
