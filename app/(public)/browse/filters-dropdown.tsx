"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { SlidersHorizontal, X, Sparkles, RotateCcw } from "lucide-react";
import { formatINR } from "@/lib/utils";

/**
 * "Filters" dropdown that sits next to the search bar on /browse. Opens a
 * popover containing all the secondary filters (sort, tier, pricing, budget,
 * posted, experience, identity, work mode) + the "Featured" Pro upsell.
 *
 * The category filter stays in the left panel — this dropdown is for
 * everything else. State is held locally until the user clicks "Apply",
 * which navigates with all the new query params.
 */
export function FiltersDropdown({ initial, activeCount }: {
  initial: {
    sort?: string;
    tier?: string;
    pricing?: string;
    budget?: string;
    posted?: string;
    verified?: string;
    remote?: string;
    experience?: string;
    q?: string;
    category?: string;
  };
  activeCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const popoverRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  const [sort, setSort] = React.useState(initial.sort ?? "newest");
  const [tier, setTier] = React.useState(initial.tier ?? "any");
  const [pricing, setPricing] = React.useState(initial.pricing ?? "any");
  const [budget, setBudget] = React.useState(initial.budget ?? "any");
  const [posted, setPosted] = React.useState(initial.posted ?? "anytime");
  const [experience, setExperience] = React.useState(initial.experience ?? "any");
  const [verified, setVerified] = React.useState(initial.verified === "true");
  const [remote, setRemote] = React.useState(initial.remote === "true");

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Close on Escape
  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function apply() {
    const params = new URLSearchParams();
    if (initial.q) params.set("q", initial.q);
    if (initial.category) params.set("category", initial.category);
    if (sort !== "newest") params.set("sort", sort);
    if (tier !== "any") params.set("tier", tier);
    if (pricing !== "any") params.set("pricing", pricing);
    if (budget !== "any") params.set("budget", budget);
    if (posted !== "anytime") params.set("posted", posted);
    if (experience !== "any") params.set("experience", experience);
    if (verified) params.set("verified", "true");
    if (remote) params.set("remote", "true");
    setOpen(false);
    router.push(`/browse?${params.toString()}`);
  }

  function clearAll() {
    setSort("newest");
    setTier("any");
    setPricing("any");
    setBudget("any");
    setPosted("anytime");
    setExperience("any");
    setVerified(false);
    setRemote(false);
  }

  const localActive = [
    sort !== "newest" ? sort : null,
    tier !== "any" ? tier : null,
    pricing !== "any" ? pricing : null,
    budget !== "any" ? budget : null,
    posted !== "anytime" ? posted : null,
    experience !== "any" ? experience : null,
    verified ? "verified" : null,
    remote ? "remote" : null,
  ].filter(Boolean).length;

  return (
    <div className="relative">
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(v => !v)}
        className="gap-1.5 shrink-0"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Filters
        {activeCount > 0 && (
          <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
            {activeCount}
          </span>
        )}
      </Button>

      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Filters"
          className="absolute right-0 top-full z-50 mt-2 w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Filters</h3>
              {localActive > 0 && (
                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                  {localActive} active
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {localActive > 0 && (
                <Button onClick={clearAll} variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs">
                  <RotateCcw className="h-3 w-3" />
                  Reset
                </Button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close filters"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="scrollbar-thin max-h-[70vh] overflow-y-auto p-4 space-y-4">
            {/* Sort by */}
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sort by</Label>
              <RadioGroup value={sort} onValueChange={setSort} className="mt-2 space-y-1.5">
                {[
                  { v: "newest",    l: "Newest first" },
                  { v: "budget_hi", l: "Budget: high → low" },
                  { v: "budget_lo", l: "Budget: low → high" },
                  { v: "ending",    l: "Ending soonest" },
                ].map(o => (
                  <label key={o.v} className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value={o.v} /><span>{o.l}</span>
                  </label>
                ))}
              </RadioGroup>
            </div>

            <Separator />

            {/* Tier */}
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tier</Label>
              <RadioGroup value={tier} onValueChange={setTier} className="mt-2 space-y-1.5">
                {[
                  { v: "any",             l: "Any" },
                  { v: "micro_task",      l: "Tier A · Micro-task" },
                  { v: "role_engagement", l: "Tier B · Role engagement" },
                ].map(o => (
                  <label key={o.v} className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value={o.v} /><span>{o.l}</span>
                  </label>
                ))}
              </RadioGroup>
            </div>

            <Separator />

            {/* Pricing model */}
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pricing model</Label>
              <RadioGroup value={pricing} onValueChange={setPricing} className="mt-2 space-y-1.5">
                {[
                  { v: "any",             l: "Any" },
                  { v: "hourly",          l: "Hourly" },
                  { v: "fixed",           l: "Fixed per task" },
                  { v: "daily_rate",      l: "Daily rate (Tier B)" },
                  { v: "fixed_milestone", l: "Per milestone (Tier B)" },
                ].map(o => (
                  <label key={o.v} className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value={o.v} /><span>{o.l}</span>
                  </label>
                ))}
              </RadioGroup>
            </div>

            <Separator />

            {/* Budget */}
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Budget</Label>
              <RadioGroup value={budget} onValueChange={setBudget} className="mt-2 space-y-1.5">
                {[
                  { v: "any",       l: "Any" },
                  { v: "0-1000",    l: `Under ${formatINR(1000)}` },
                  { v: "1000-5000", l: `${formatINR(1000)} – ${formatINR(5000)}` },
                  { v: "5000-20000", l: `${formatINR(5000)} – ${formatINR(20000)}` },
                  { v: "20000-100000", l: `${formatINR(20000)} – ${formatINR(100000)}` },
                  { v: "100000", l: `${formatINR(100000)} +` },
                ].map(o => (
                  <label key={o.v} className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value={o.v} /><span>{o.l}</span>
                  </label>
                ))}
              </RadioGroup>
            </div>

            <Separator />

            {/* Posted within */}
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Posted within</Label>
              <RadioGroup value={posted} onValueChange={setPosted} className="mt-2 space-y-1.5">
                {[
                  { v: "anytime", l: "Anytime" },
                  { v: "24h",     l: "Last 24 hours" },
                  { v: "week",    l: "Last 7 days" },
                  { v: "month",   l: "Last 30 days" },
                ].map(o => (
                  <label key={o.v} className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value={o.v} /><span>{o.l}</span>
                  </label>
                ))}
              </RadioGroup>
            </div>

            <Separator />

            {/* Experience */}
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Experience level</Label>
              <RadioGroup value={experience} onValueChange={setExperience} className="mt-2 space-y-1.5">
                {[
                  { v: "any",    l: "Any" },
                  { v: "entry",  l: "Entry level (0–2 yrs)" },
                  { v: "mid",    l: "Mid level (2–5 yrs)" },
                  { v: "senior", l: "Senior (5+ yrs)" },
                  { v: "expert", l: "Expert / specialist" },
                ].map(o => (
                  <label key={o.v} className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value={o.v} /><span>{o.l}</span>
                  </label>
                ))}
              </RadioGroup>
            </div>

            <Separator />

            {/* Toggles */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Options</Label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={verified} onCheckedChange={(v) => setVerified(!!v)} />
                <span>Aadhaar-verified posters only</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={remote} onCheckedChange={(v) => setRemote(!!v)} />
                <span>Remote / async only</span>
              </label>
            </div>

            <Separator />

            {/* Pro upsell */}
            <div className="rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
              <p className="flex items-center gap-1.5 font-medium text-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Buyer Pro feature
              </p>
              <p className="mt-1.5">
                Boosted posts and priority queueing unlock on the Buyer Pro plan.{" "}
                <a href="/pricing" className="text-primary underline">See plans</a>
              </p>
            </div>
          </div>

          {/* Sticky apply bar */}
          <div className="flex items-center gap-2 border-t bg-card p-3">
            <Button onClick={clearAll} variant="ghost" size="sm" className="shrink-0">
              Reset
            </Button>
            <Button onClick={apply} className="flex-1">Apply filters</Button>
          </div>
        </div>
      )}
    </div>
  );
}
