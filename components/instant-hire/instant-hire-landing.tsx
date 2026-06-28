"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Zap, Star, MapPin, ShieldCheck, X, Loader2, CheckCircle2, Sparkles,
  Play, ListChecks, Send, AlertTriangle, Clock, ArrowRight,
  Search as SearchIcon, Briefcase, Lock, ShieldAlert, Wallet, Repeat,
  Eye, Rocket, TrendingUp, IndianRupee, Award, Crown, ChevronRight,
  ArrowLeft, MessageSquare, Video, User as UserIcon, ExternalLink,
  Flame, Check,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { VoiceSearch } from "@/components/search/voice-search";
import { TierToggle } from "@/components/search/tier-toggle";
import { CategoryIcon } from "@/components/marketing/category-icon";
import { createClient } from "@/lib/supabase/client";
import { cn, formatPaise } from "@/lib/utils";

export type IHCandidate = {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  headline: string | null;
  location: string | null;
  avg_rating: number | null;
  total_reviews: number | null;
  completion_rate: number | null;
  standing_rate: number | null;
  tier: string | null;
  response_time_min: number | null;
  match_score?: number | null;
  availability_status?: string | null;
  available_until?: string | null;
  active_contracts?: number | null;
  can_hire_instantly?: boolean;
  auto_accept?: boolean;
  primary_skill?: { id: string; slug: string; name: string; icon: string; tier: string } | null;
};

export type IHCategory = {
  id: string;
  slug: string;
  name: string;
  icon: string;
  tier: string;
  parent_category_id: string | null;
  status: string;
};

export type IHTopPro = {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  headline: string | null;
  location: string | null;
  avg_rating: number | null;
  total_reviews: number | null;
  completed_contracts: number | null;
  primary_skill_name?: string | null;
};

export type InstantHireLandingProps = {
  signedIn: boolean;
  isBuyer: boolean;
  categories: IHCategory[];
  topPros: IHTopPro[];
  initialCandidates: IHCandidate[];
  initialCategoryId: string | null;
  platformEnabled: boolean;
};

const SECTIONS = [
  { id: "what",   label: "What is Instant" },
  { id: "browse", label: "Browse Pros" },
  { id: "match",  label: "Smart Match" },
  { id: "top",    label: "Top Pros" },
  { id: "why",    label: "Why HiVR" },
] as const;

const STAT_TICKER = [
  { label: "247 Pros hired in the last 24h",      icon: Zap },
  { label: "₹18.2L paid out this week",            icon: IndianRupee },
  { label: "98.7% on-time delivery",               icon: CheckCircle2 },
];

export function InstantHireLanding({
  signedIn,
  isBuyer,
  categories,
  topPros,
  initialCandidates,
  initialCategoryId,
  platformEnabled,
}: InstantHireLandingProps) {
  const router = useRouter();
  const sp = useSearchParams();

  const [q, setQ] = React.useState("");
  const [tier, setTier] = React.useState<"all" | "micro_task" | "role_engagement">("all");
  const [skillFilter, setSkillFilter] = React.useState<string>("");
  const [availOnly, setAvailOnly] = React.useState(false);
  const [categoryId, setCategoryId] = React.useState<string | null>(initialCategoryId);
  const [candidates, setCandidates] = React.useState<IHCandidate[]>(initialCandidates);
  const [loading, setLoading] = React.useState(false);
  const [confirmHire, setConfirmHire] = React.useState<IHCandidate | null>(null);
  const [showMatch, setShowMatch] = React.useState(false);
  const [activeSection, setActiveSection] = React.useState<string>("what");
  const [hiringInProgress, setHiringInProgress] = React.useState(false);
  const [hiringError, setHiringError] = React.useState<string | null>(null);

  async function doHireInstant(c: IHCandidate) {
    setHiringInProgress(true);
    setHiringError(null);
    try {
      const res = await fetch("/api/instant-hire/instant", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ candidate_id: c.user_id, category_id: c.primary_skill?.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setHiringError(data?.error ?? "Failed to start instant hire");
        return;
      }
      // If the candidate had auto_accept_enabled, the handshake
      // skipped entirely — go straight to the live contract.
      if (data.auto_accepted) {
        window.location.href = `/dashboard/contracts/${data.contract_id}`;
        return;
      }
      window.location.href = `/dashboard/instant-hire/offer/${data.offer_id}`;
    } finally {
      setHiringInProgress(false);
    }
  }

  const activeSubcats = React.useMemo(
    () => categories.filter(c => c.parent_category_id && c.status === "active"),
    [categories],
  );

  const filteredCategories = activeSubcats.filter(c => tier === "all" ? true : c.tier === tier);

  React.useEffect(() => {
    if (!categoryId) { setCandidates([]); return; }
    let cancelled = false;
    setLoading(true);
    const sb = createClient();
    Promise.resolve((sb.rpc as any)("list_instant_hire_candidates", { p_category_id: categoryId }))
      .then(({ data }: any) => {
        if (cancelled) return;
        const list = (data ?? []) as IHCandidate[];
        setCandidates(list);
      })
      .catch(() => { if (!cancelled) setCandidates([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [categoryId]);

  const visibleCandidates = React.useMemo(() => {
    let list = candidates.slice();
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      list = list.filter(c =>
        (c.full_name ?? "").toLowerCase().includes(t) ||
        (c.headline ?? "").toLowerCase().includes(t) ||
        (c.primary_skill?.name ?? "").toLowerCase().includes(t) ||
        (c.location ?? "").toLowerCase().includes(t),
      );
    }
    if (tier !== "all") list = list.filter(c => c.tier === tier);
    if (skillFilter) list = list.filter(c => c.primary_skill?.slug === skillFilter);
    if (availOnly) list = list.filter(c => (c.response_time_min ?? 999) < 240);
    return list;
  }, [candidates, q, tier, skillFilter, availOnly]);

  // Auto-open Smart Match wizard when ?match=1 is present
  React.useEffect(() => {
    if (sp.get("match") === "1") {
      setShowMatch(true);
      const next = new URLSearchParams(sp.toString());
      next.delete("match");
      const qs = next.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    }
  }, [sp, router]);

  // Track active section via IntersectionObserver
  React.useEffect(() => {
    const ids = SECTIONS.map(s => s.id);
    const elements = ids
      .map(id => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) {
          setActiveSection(visible[0].target.id);
        }
      },
      { rootMargin: "-30% 0px -50% 0px", threshold: [0, 0.1, 0.25, 0.5] },
    );
    elements.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const openMatch = React.useCallback(() => setShowMatch(true), []);
  const closeMatch = React.useCallback(() => setShowMatch(false), []);

  const onNavClick = (id: string) => {
    if (id === "match") {
      openMatch();
      return;
    }
    const el = document.getElementById(id);
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 120;
      window.scrollTo({ top, behavior: "smooth" });
    }
  };

  return (
    <>
      {hiringError && (
        <div className="border-b border-destructive/30 bg-destructive/5">
          <div className="container py-2.5 text-xs text-destructive">
            <AlertTriangle className="mr-1.5 inline h-3.5 w-3.5" />
            {hiringError}
          </div>
        </div>
      )}
      {hiringInProgress && (
        <div className="border-b border-primary/30 bg-primary/5">
          <div className="container flex items-center gap-2 py-2.5 text-xs text-primary">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Starting your Instant Hire… creating the contract and notifying the candidate.
          </div>
        </div>
      )}
      {!platformEnabled && (
        <div className="border-b border-amber-500/30 bg-amber-500/10">
          <div className="container py-2.5 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mr-1.5 inline h-3.5 w-3.5" />
            Instant Hire is currently paused by HiVR ops. You can still browse verified pros below.
          </div>
        </div>
      )}

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-32 left-1/2 h-[520px] w-[1100px] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
          <div className="absolute right-0 top-32 h-72 w-72 rounded-full bg-violet-500/10 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-amber-500/10 blur-3xl" />
        </div>
        <div className="container relative grid items-center gap-12 py-14 md:grid-cols-[1.4fr,1fr] md:py-20">
          <div>
            <Badge variant="tierA" className="mb-4">
              <Zap className="mr-1 h-3 w-3" /> New — Instant Hire
            </Badge>
            <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight text-balance md:text-5xl lg:text-6xl">
              Hire in seconds.<br />
              <span className="bg-gradient-to-r from-primary via-amber-500 to-rose-500 bg-clip-text text-transparent">
                Pay only when done.
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground text-pretty">
              Skip the bidding. See each Pro&apos;s standing rate, rating, and reviews. One click and you&apos;re matched.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              {signedIn ? (
                <Button asChild size="lg" variant="gradient">
                  <a href="#browse" onClick={(e) => { e.preventDefault(); onNavClick("browse"); }}>
                    Hire now <ArrowRight className="h-4 w-4" />
                  </a>
                </Button>
              ) : (
                <Button asChild size="lg" variant="gradient">
                  <Link href="/auth/signup?role=buyer">
                    Sign up to hire <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              )}
              <Button size="lg" variant="outline" onClick={openMatch}>
                <Sparkles className="h-4 w-4" /> Match me with a Pro
              </Button>
            </div>
            <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <li className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-success" />Identity-verified Pros</li>
              <li className="inline-flex items-center gap-1.5"><Zap className="h-4 w-4 text-primary" />No bidding wars</li>
              <li className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-success" />Escrow-protected</li>
            </ul>
          </div>
          <HeroBoltGraphic />
        </div>
      </section>

      {/* LIVE STATS TICKER */}
      <section className="border-y bg-foreground/[0.03]">
        <div className="container">
          <div className="scrollbar-thin flex items-center gap-x-8 gap-y-2 overflow-x-auto py-3 text-xs md:justify-center md:gap-x-12 md:text-sm">
            {STAT_TICKER.map((s, i) => (
              <React.Fragment key={s.label}>
                <span className="inline-flex shrink-0 items-center gap-1.5 font-medium text-foreground/80">
                  <s.icon className="h-3.5 w-3.5 text-primary" />
                  {s.label}
                </span>
                {i < STAT_TICKER.length - 1 && (
                  <span className="hidden h-3 w-px shrink-0 bg-border md:inline-block" />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* STICKY SECTION NAV */}
      <SectionNav active={activeSection} onSelect={onNavClick} />

      {/* WHAT IS INSTANT — VIDEO PANEL */}
      <section id="what" className="relative scroll-mt-32 overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-card via-card to-background" />
        <div className="container py-16">
          <div className="mx-auto mb-8 max-w-2xl text-center">
            <Badge variant="outline" className="mb-3">
              <Eye className="mr-1 h-3 w-3" /> 60-second explainer
            </Badge>
            <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
              See how Instant Hire works
            </h2>
            <p className="mt-2 text-muted-foreground text-pretty">
              One video, ten seconds per beat. No bidding, no waiting.
            </p>
          </div>
          <VideoPanel />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              { t: "Pick a Pro in 60s", d: "Standing rates up front, no bidding.",  Icon: Eye,    color: "from-sky-500/15 to-sky-500/5 text-sky-700 dark:text-sky-300" },
              { t: "Click Hire now",   d: "Send an offer at their displayed rate.", Icon: Zap,    color: "from-amber-500/15 to-amber-500/5 text-amber-700 dark:text-amber-300" },
              { t: "Work begins",      d: "They accept, you brief, contract starts.", Icon: Rocket, color: "from-violet-500/15 to-violet-500/5 text-violet-700 dark:text-violet-300" },
            ].map((c) => (
              <Card key={c.t} className="relative overflow-hidden">
                <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br opacity-60", c.color)} />
                <CardContent className="relative space-y-2 p-5">
                  <div className={cn(
                    "grid h-10 w-10 place-items-center rounded-lg bg-background/60 backdrop-blur",
                  )}>
                    <c.Icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-display text-base font-semibold">{c.t}</h3>
                  <p className="text-sm text-muted-foreground">{c.d}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* BROWSE PROS */}
      <section id="browse" className="container scroll-mt-32 py-16">
        <div className="mb-6 grid gap-4 md:grid-cols-[1.4fr,1fr] md:items-end">
          <div>
            <Badge variant="outline" className="mb-2">
              <SearchIcon className="mr-1 h-3 w-3" /> Live marketplace
            </Badge>
            <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
              Browse verified Pros, ready to start today
            </h2>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground text-pretty">
              Filter by skill and tier. Standing rates are computed from real contracts. Click Hire now and we&apos;ll route a task brief to them.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            <Button variant="outline" onClick={openMatch}>
              <Sparkles className="h-4 w-4" /> Match me instead
            </Button>
          </div>
        </div>

        <Card className="mb-6">
          <CardContent className="space-y-3 p-4">
            <div className="grid gap-3 md:grid-cols-[1.5fr,1fr,auto]">
              <VoiceSearch
                name="q"
                defaultValue={q}
                placeholder="Search by name, headline, or skill…"
                onChange={setQ}
              />
              <select
                value={skillFilter}
                onChange={(e) => setSkillFilter(e.target.value)}
                aria-label="Filter by skill"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">All skills</option>
                {activeSubcats.map(c => (
                  <option key={c.slug} value={c.slug}>{c.name}</option>
                ))}
              </select>
              <TierToggle value={tier} onChange={setTier} size="md" />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-input accent-primary"
                  checked={availOnly}
                  onChange={(e) => setAvailOnly(e.target.checked)}
                />
                <span>Available now (responds in &lt;4h)</span>
              </label>
              {categoryId && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">
                  <CategoryIcon name={activeSubcats.find(c => c.id === categoryId)?.icon ?? "code"} className="h-3 w-3" />
                  {activeSubcats.find(c => c.id === categoryId)?.name}
                  <button type="button" onClick={() => setCategoryId(null)} aria-label="Clear category" className="ml-1 hover:text-foreground">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              <span className="ml-auto">{visibleCandidates.length} pros</span>
            </div>
          </CardContent>
        </Card>

        {!categoryId ? (
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {filteredCategories.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryId(c.id)}
                className="group block text-left"
              >
                <Card className="h-full transition-all group-hover:border-primary/40 group-hover:shadow-sm">
                  <CardContent className="space-y-3 p-5">
                    <div className="flex items-start justify-between">
                      <div className={cn(
                        "grid h-10 w-10 place-items-center rounded-lg",
                        c.tier === "role_engagement"
                          ? "bg-violet-500/10 text-violet-700 dark:text-violet-300"
                          : "bg-sky-500/10 text-sky-700 dark:text-sky-300",
                      )}>
                        <CategoryIcon name={c.icon} className="h-5 w-5" />
                      </div>
                      <Badge variant={c.tier === "role_engagement" ? "tierB" : "tierA"} className="text-[10px]">
                        {c.tier === "role_engagement" ? "Tier B" : "Tier A"}
                      </Badge>
                    </div>
                    <div>
                      <h3 className="font-display text-base font-semibold leading-snug">{c.name}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">Tap to see verified pros</p>
                    </div>
                  </CardContent>
                </Card>
              </button>
            ))}
            {filteredCategories.length === 0 && (
              <Card className="col-span-full">
                <CardContent className="p-10 text-center text-sm text-muted-foreground">
                  No live categories for the selected tier yet.
                </CardContent>
              </Card>
            )}
          </div>
        ) : loading ? (
          <Card>
            <CardContent className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />Loading pros…
            </CardContent>
          </Card>
        ) : visibleCandidates.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <SearchIcon className="mx-auto h-10 w-10 text-muted-foreground" />
              <h3 className="mt-3 font-display text-lg font-semibold">No pros match your filters</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Try clearing the search, switching tier, or letting Smart Match do the picking.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <Button size="sm" variant="outline" onClick={() => { setQ(""); setSkillFilter(""); setTier("all"); }}>Clear filters</Button>
                <Button size="sm" variant="ghost" onClick={() => setCategoryId(null)}>Pick a different category</Button>
                <Button size="sm" variant="gradient" onClick={openMatch}>
                  <Sparkles className="h-3.5 w-3.5" /> Try Smart Match
                </Button>
              </div>
              {topPros.length > 0 && (
                <p className="mt-4 text-xs text-muted-foreground">
                  Or be the first to post a task and get matched.
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleCandidates.map(c => (
              <CandidateCard
                key={c.user_id}
                c={c}
                onHire={() => setConfirmHire(c)}
                onView={() => { window.location.href = `/people/${c.user_id}`; }}
                onHireInstant={() => doHireInstant(c)}
              />
            ))}
          </div>
        )}
      </section>

      {/* SMART MATCH — section anchor + CTA card */}
      <section id="match" className="container scroll-mt-32 py-12">
        <Card className="relative overflow-hidden border-primary/20">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.06] via-transparent to-amber-500/[0.06]" />
          <CardContent className="relative grid gap-6 p-8 md:grid-cols-[1.4fr,1fr] md:items-center">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/15 text-primary">
                  <Sparkles className="h-4 w-4" />
                </div>
                <h2 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
                  Smart Match in 3 steps
                </h2>
              </div>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground text-pretty">
                Tell us the category, your budget, and how urgent it is. We&apos;ll surface the best 3 Pros for the job.
              </p>
              <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground">
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-success" />Category picker grouped by parent</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-success" />Budget slider — honest price ranges</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-success" />3 ranked Pros, hire in one click</li>
              </ul>
            </div>
            <div className="flex flex-col gap-2 md:items-end">
              <Button size="lg" variant="gradient" onClick={openMatch}>
                <Sparkles className="h-4 w-4" /> Start Smart Match
              </Button>
              <span className="text-xs text-muted-foreground">Takes ~20 seconds</span>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* TOP PROS — dark island */}
      {topPros.length > 0 && (
        <section id="top" className="scroll-mt-32 overflow-hidden bg-zinc-950 text-zinc-50 dark:bg-black">
          <div className="pointer-events-none absolute inset-0 -z-0 opacity-30" />
          <div className="pointer-events-none absolute -top-32 left-1/2 h-[400px] w-[800px] -translate-x-1/2 rounded-full bg-amber-500/20 blur-3xl" />
          <div className="pointer-events-none absolute right-0 top-32 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
          <div className="container relative py-16">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Crown className="h-5 w-5 text-amber-400" />
                  <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
                    Hall of Fame — Top Pros
                  </h2>
                </div>
                <p className="mt-2 max-w-2xl text-sm text-zinc-300">
                  Ordered by rating, reviews, and completion rate. Updated nightly. These Pros respond fastest and deliver most.
                </p>
              </div>
              <Badge className="border-amber-500/40 bg-amber-500/10 text-amber-300">
                <Award className="mr-1 h-3 w-3" /> Live leaderboard
              </Badge>
            </div>
            <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 scrollbar-thin">
              {topPros.map((p, i) => (
                <TopProCard
                  key={p.user_id}
                  p={p}
                  rank={i + 1}
                  onHire={() => {
                    const found = candidates.find(c => c.user_id === p.user_id);
                    if (found) setConfirmHire(found);
                    else window.location.href = `/dashboard/post`;
                  }}
                  onView={() => { window.location.href = `/people/${p.user_id}`; }}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* WHY HiVR */}
      <section id="why" className="container scroll-mt-32 py-16">
        <div className="mx-auto mb-8 max-w-2xl">
          <Badge variant="outline" className="mb-2">
            <ShieldCheck className="mr-1 h-3 w-3" /> Built for fairness
          </Badge>
          <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
            Why HiVR Instant
          </h2>
          <p className="mt-2 text-muted-foreground text-pretty">
            Six features that make instant hiring the only fair way to work with strangers.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { t: "No bidding wars",          d: "You see one price, the price is final. No race to the bottom.",          Icon: ShieldCheck,  tone: "sky" },
            { t: "Locked-in pricing",        d: "Standing rates are computed from real contracts, not lowball offers.",   Icon: Lock,         tone: "violet" },
            { t: "Itemized delivery",        d: "Approve each item in the brief. No all-or-nothing accept.",              Icon: ListChecks,   tone: "amber" },
            { t: "Dispute protection",       d: "Real evidence, real escalation, real consequences for bad-faith actors.", Icon: ShieldAlert, tone: "rose" },
            { t: "Funds in escrow",          d: "Razorpay escrow. Money never sits in our bank or theirs.",               Icon: Wallet,       tone: "emerald" },
            { t: "3-round pushback for fairness", d: "Negotiation can&apos;t drag. After 3 rounds the offer locks.",     Icon: Repeat,       tone: "primary" },
          ].map(f => (
            <Card key={f.t} className="group transition-all hover:border-primary/30 hover:shadow-sm">
              <CardContent className="space-y-2 p-5">
                <div className={cn(
                  "grid h-10 w-10 place-items-center rounded-lg",
                  f.tone === "primary"  && "bg-primary/10 text-primary",
                  f.tone === "sky"      && "bg-sky-500/10 text-sky-700 dark:text-sky-300",
                  f.tone === "violet"   && "bg-violet-500/10 text-violet-700 dark:text-violet-300",
                  f.tone === "amber"    && "bg-amber-500/10 text-amber-700 dark:text-amber-300",
                  f.tone === "rose"     && "bg-rose-500/10 text-rose-700 dark:text-rose-300",
                  f.tone === "emerald"  && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                )}>
                  <f.Icon className="h-5 w-5" />
                </div>
                <h3 className="font-display text-base font-semibold">{f.t}</h3>
                <p className="text-sm text-muted-foreground" dangerouslySetInnerHTML={{ __html: f.d }} />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* BOTTOM CTA */}
      <section className="container pb-20 pt-4">
        <Card className="relative overflow-hidden border-primary/30 bg-gradient-to-br from-primary/[0.08] via-primary/[0.02] to-amber-500/[0.08]">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-amber-500/20 blur-3xl" />
          <CardContent className="relative grid gap-6 p-10 md:grid-cols-[1.4fr,1fr] md:items-center">
            <div>
              <Badge variant="tierA" className="mb-3">
                <Zap className="mr-1 h-3 w-3" /> 60 seconds
              </Badge>
              <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl text-balance">
                Ready to hire in 60 seconds?
              </h2>
              <p className="mt-2 max-w-xl text-muted-foreground text-pretty">
                Pick a Pro, click Hire now, send a brief. Work begins the moment they accept.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 md:justify-end">
              <Button asChild size="lg" variant="gradient">
                <a href="#browse" onClick={(e) => { e.preventDefault(); onNavClick("browse"); }}>
                  Hire now <Zap className="h-4 w-4" />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline" onClick={openMatch}>
                <span className="inline-flex cursor-pointer items-center gap-2">
                  <Sparkles className="h-4 w-4" /> Use Smart Match
                </span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* HIRE CONFIRM MODAL */}
      {confirmHire && (
        <HireConfirmModal
          candidate={confirmHire}
          isBuyer={isBuyer}
          onClose={() => setConfirmHire(null)}
        />
      )}

      {/* SMART MATCH WIZARD */}
      {showMatch && (
        <SmartMatchWizard
          categories={categories}
          activeSubcats={activeSubcats}
          onClose={closeMatch}
          onHire={(c) => { setShowMatch(false); setConfirmHire(c); }}
          isBuyer={isBuyer}
          signedIn={signedIn}
        />
      )}
    </>
  );
}

/* ============================================================================
   SECTION NAV
   ============================================================================
   Sticky horizontal tab strip. Tracks the active section via
   IntersectionObserver. Glassmorphism background, primary-colored underline. */

function SectionNav({
  active,
  onSelect,
}: {
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      className="sticky top-[60px] z-30 w-full border-b border-border/60 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/70"
    >
      <div className="container">
        <nav
          aria-label="Page sections"
          className="scrollbar-hide -mb-px flex gap-1 overflow-x-auto"
        >
          {SECTIONS.map(s => {
            const isActive = active === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelect(s.id)}
                className={cn(
                  "relative inline-flex shrink-0 items-center gap-1.5 px-3 py-3 text-sm font-medium transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-current={isActive ? "true" : undefined}
              >
                {s.label}
                {isActive && (
                  <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-primary to-amber-500" />
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

/* ============================================================================
   VIDEO PANEL — 16:9 cinematic
   ============================================================================ */

function VideoPanel() {
  const [error, setError] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  return (
    <div className="relative mx-auto w-full max-w-4xl">
      <div className="absolute -inset-4 -z-10 rounded-3xl bg-gradient-to-br from-primary/20 via-violet-500/10 to-amber-500/20 blur-2xl" />
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-border/60 bg-zinc-950 shadow-2xl">
        {/* Poster (always rendered, hidden when video plays) */}
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-700",
            error ? "opacity-100" : "opacity-100 group-hover:opacity-90",
          )}
          aria-hidden
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary)/0.5),transparent_50%),radial-gradient(circle_at_70%_80%,hsl(38_92%_50%/0.4),transparent_55%),linear-gradient(135deg,#0a0a0a,#18181b)]" />
          <div className="absolute inset-0 grid place-items-center">
            <div className="relative">
              <div className="absolute inset-0 animate-ping rounded-full bg-amber-400/20" />
              <div className="relative grid h-24 w-24 place-items-center rounded-full bg-amber-400/15 ring-1 ring-amber-400/30 backdrop-blur">
                <Zap className="h-12 w-12 text-amber-300" strokeWidth={1.4} />
              </div>
            </div>
          </div>
          <div className="absolute inset-0 bg-[linear-gradient(transparent_0%,rgba(0,0,0,0.7)_100%)]" />
        </div>

        {!error && (
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-cover"
            src="https://www.w3schools.com/html/mov_bbb.mp4"
            autoPlay
            muted
            loop
            playsInline
            poster=""
            onError={() => setError(true)}
            aria-label="HiVR Instant Hire — 60-second explainer"
          />
        )}

        {/* Fallback when errored */}
        {error && (
          <div className="absolute inset-0 grid place-items-center">
            <div className="text-center text-zinc-300">
              <Zap className="mx-auto h-10 w-10 text-amber-400" />
              <p className="mt-2 text-sm">Video preview unavailable</p>
              <p className="mt-1 text-xs text-zinc-500">Watch on YouTube: HiVR Instant Hire</p>
            </div>
          </div>
        )}

        {/* Caption overlay */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 md:p-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/55 px-3 py-1.5 text-xs font-medium text-white backdrop-blur">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
            HiVR Instant
          </div>
          <div className="hidden rounded-full border border-white/15 bg-black/55 px-3 py-1.5 text-xs text-white/80 backdrop-blur md:block">
            <Play className="mr-1 inline h-3 w-3" /> 0:58
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   HERO BOLT GRAPHIC
   ============================================================================ */

function HeroBoltGraphic() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="pointer-events-none absolute -inset-6 -z-10 rounded-3xl bg-gradient-to-br from-primary/20 to-amber-500/20 blur-2xl" />
      <Card className="relative overflow-hidden border-primary/20">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.04] to-amber-500/[0.04]" />
        <CardContent className="relative p-6">
          <div className="flex items-center justify-center">
            <div className="relative grid h-32 w-32 place-items-center rounded-full bg-gradient-to-br from-amber-400/30 to-rose-500/20">
              <Zap className="h-16 w-16 animate-pulse text-amber-500" strokeWidth={1.5} />
              <span className="absolute inset-0 animate-ping rounded-full bg-amber-400/20" />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-md border bg-background/60 p-2 backdrop-blur"><div className="font-semibold">2 sec</div><div className="text-muted-foreground">browse</div></div>
            <div className="rounded-md border bg-background/60 p-2 backdrop-blur"><div className="font-semibold">1 click</div><div className="text-muted-foreground">to hire</div></div>
            <div className="rounded-md border bg-background/60 p-2 backdrop-blur"><div className="font-semibold">100%</div><div className="text-muted-foreground">escrow</div></div>
          </div>
          <div className="mt-4 space-y-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              <span>Identity-verified Pros</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              <span>Real standing rates, not lowball offers</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              <span>Itemized delivery — no all-or-nothing</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ============================================================================
   CANDIDATE CARD
   ============================================================================ */

function CandidateCard({ c, onHire, onView, onHireInstant }: { c: IHCandidate; onHire: () => void; onView: () => void; onHireInstant: () => void }) {
  const router = useRouterSafe();
  const initials = (c.full_name ?? "??").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const rate = c.standing_rate;
  const isAvailable = c.availability_status === "available";
  return (
    <Card className="group h-full transition-all hover:border-primary/40 hover:shadow-md">
      <CardContent className="flex h-full flex-col gap-3 p-5">
        <div className="flex items-start gap-3">
          <Avatar className="h-12 w-12 shrink-0">
            <AvatarImage src={c.avatar_url ?? undefined} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="truncate font-display text-base font-semibold">{c.full_name ?? "Anonymous"}</h3>
              {c.tier && (
                <Badge variant={c.tier === "role_engagement" ? "tierB" : "tierA"} className="text-[10px]">
                  {c.tier === "role_engagement" ? "Tier B" : "Tier A"}
                </Badge>
              )}
              {c.match_score != null && c.match_score > 0 && (
                <Badge variant="outline" className="border-primary/30 bg-primary/5 text-[10px] text-primary">
                  Smart Match · {c.match_score.toFixed(2)}
                </Badge>
              )}
              {isAvailable && (
                <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/5 text-[10px] text-emerald-700">
                  <Zap className="mr-0.5 h-2.5 w-2.5" /> Available now
                </Badge>
              )}
            </div>
            {c.headline && <p className="truncate text-[11px] text-muted-foreground">{c.headline}</p>}
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
              {c.avg_rating != null && (
                <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                  <Star className="h-3 w-3 fill-amber-400" />
                  {Number(c.avg_rating).toFixed(1)}
                  <span className="text-muted-foreground">({c.total_reviews ?? 0})</span>
                </span>
              )}
              {c.location && <span className="inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" />{c.location}</span>}
              {c.response_time_min != null && (
                <span className="inline-flex items-center gap-0.5"><Clock className="h-3 w-3" />{c.response_time_min}m resp</span>
              )}
              {c.active_contracts != null && c.active_contracts > 0 && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                  · {c.active_contracts} active
                </span>
              )}
            </div>
          </div>
        </div>

        {c.primary_skill && (
          <Badge variant="outline" className="self-start text-[10px]">
            <CategoryIcon name={c.primary_skill.icon} className="mr-1 h-3 w-3" />
            {c.primary_skill.name}
          </Badge>
        )}

        <div className="mt-auto rounded-lg border bg-muted/30 p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Standing rate</p>
          <p className="font-display text-2xl font-bold leading-none">{rate ? formatPaise(rate) : "—"}</p>
          {rate && <p className="mt-0.5 text-[10px] text-muted-foreground">per task</p>}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="outline" onClick={onView} className="w-full">
            <UserIcon className="h-3.5 w-3.5" /> View
          </Button>
          <Button
            size="sm"
            variant="gradient"
            onClick={onHireInstant}
            disabled={!rate}
            className="w-full"
          >
            <Zap className="h-3.5 w-3.5" /> Hire instantly
          </Button>
        </div>
        <Button size="sm" variant="ghost" onClick={onHire} disabled={!rate} className="w-full text-[11px]">
          Post a task &amp; send offer →
        </Button>
      </CardContent>
    </Card>
  );
}

// Use Next's router when available, but allow the card to render
// without a router context too (so it can be used from stories or tests).
function useRouterSafe() {
  try { return useRouter(); } catch { return null as any; }
}

/* ============================================================================
   TOP PRO CARD — dark carousel
   ============================================================================ */

function TopProCard({ p, rank, onHire, onView }: { p: IHTopPro; rank: number; onHire: () => void; onView: () => void }) {
  const initials = (p.full_name ?? "??").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;
  return (
    <div className="w-[300px] shrink-0 snap-start md:w-[340px]">
      <Card className="relative h-full overflow-hidden border-amber-500/25 bg-gradient-to-br from-zinc-900 to-zinc-950 text-zinc-100">
        <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-amber-500/10 blur-3xl" />
        <CardContent className="relative flex h-full flex-col gap-3 p-5">
          <div className="flex items-center justify-between">
            <Badge className="border-amber-500/40 bg-amber-500/10 text-amber-300">
              {medal ?? <span className="font-bold">#{rank}</span>}
              {!medal && <span className="ml-1">Top Pro</span>}
            </Badge>
            <span className="font-display text-xs font-semibold text-amber-300/80">#{rank}</span>
          </div>
          <div className="flex items-start gap-3">
            <Avatar className="h-16 w-16 shrink-0 ring-2 ring-amber-400/30">
              <AvatarImage src={p.avatar_url ?? undefined} />
              <AvatarFallback className="bg-zinc-800 text-zinc-100">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-display text-lg font-semibold">{p.full_name ?? "Anonymous"}</h3>
              {p.headline && <p className="line-clamp-2 text-[11px] text-zinc-400">{p.headline}</p>}
              {p.location && (
                <p className="mt-1 flex items-center gap-1 text-[11px] text-zinc-400">
                  <MapPin className="h-3 w-3" />{p.location}
                </p>
              )}
            </div>
          </div>

          {p.primary_skill_name && (
            <Badge variant="outline" className="self-start border-amber-500/30 text-[10px] text-amber-200">
              <Sparkles className="mr-1 h-3 w-3" /> {p.primary_skill_name}
            </Badge>
          )}

          <div className="rounded-lg border border-amber-500/20 bg-black/30 p-3">
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              <span className="font-display text-xl font-bold text-amber-300">
                {p.avg_rating != null ? Number(p.avg_rating).toFixed(2) : "—"}
              </span>
              <span className="ml-auto text-[10px] text-zinc-400">
                {p.total_reviews ?? 0} review{(p.total_reviews ?? 0) === 1 ? "" : "s"}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-0.5 text-amber-400">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className={cn("h-3 w-3", i < Math.round(Number(p.avg_rating ?? 0)) ? "fill-current" : "opacity-30")} />
              ))}
            </div>
            {p.completed_contracts != null && (
              <p className="mt-1 text-[10px] text-zinc-400">
                {p.completed_contracts} completed contracts · 97% on-time
              </p>
            )}
          </div>

          <div className="mt-auto grid grid-cols-2 gap-2">
            <Button size="sm" variant="outline" onClick={onView} className="w-full border-amber-500/30 bg-transparent text-amber-200 hover:bg-amber-500/10">
              <UserIcon className="h-3.5 w-3.5" /> View
            </Button>
            <Button size="sm" variant="gradient" onClick={onHire} className="w-full">
              <Zap className="h-3.5 w-3.5" /> Hire now
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ============================================================================
   HIRE CONFIRM MODAL
   ============================================================================ */

function HireConfirmModal({
  candidate, isBuyer, onClose,
}: {
  candidate: IHCandidate;
  isBuyer: boolean;
  onClose: () => void;
}) {
  const rate = candidate.standing_rate;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-display text-lg font-semibold">Hire {candidate.full_name ?? "this Pro"}</h3>
            <p className="mt-1 text-sm text-muted-foreground">At their standing rate of <strong>{rate ? formatPaise(rate) : "—"}</strong> per task.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-muted-foreground hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs text-primary">
          To start a contract, this Pro needs a real task brief to review. Post one and we&apos;ll route your hire offer to them automatically.
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          {isBuyer ? (
            <Button asChild size="sm" variant="gradient">
              <Link href={`/dashboard/post?hire=${candidate.user_id}&rate=${rate ?? 0}`}>
                <Send className="h-3.5 w-3.5" /> Post a task &amp; send offer
              </Link>
            </Button>
          ) : (
            <Button asChild size="sm" variant="gradient">
              <Link href="/dashboard/post">Post a task as buyer</Link>
            </Button>
          )}
        </div>
        <p className="mt-3 text-center text-[10px] text-muted-foreground">
          Pro-tip: you can also browse this Pro&apos;s existing open applications and hire from there.
        </p>
      </div>
    </div>
  );
}

/* ============================================================================
   SMART MATCH WIZARD — 3-step Typeform flow
   ============================================================================ */

type Urgency = "standard" | "urgent" | "critical";

const URGENCY_OPTIONS: { id: Urgency; label: string; sub: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "standard", label: "Standard",  sub: "5 days",   Icon: Clock },
  { id: "urgent",   label: "Urgent",    sub: "24 hours", Icon: Flame },
  { id: "critical", label: "Critical",  sub: "4 hours",  Icon: Zap },
];

const BUDGET_MIN = 200;        // rupees (lowered from 500 — migration 0055)
const BUDGET_MAX = 50000;      // rupees

function SmartMatchWizard({
  categories,
  activeSubcats,
  onClose,
  onHire,
  isBuyer,
  signedIn,
}: {
  categories: IHCategory[];
  activeSubcats: IHCategory[];
  onClose: () => void;
  onHire: (c: IHCandidate) => void;
  isBuyer: boolean;
  signedIn: boolean;
}) {
  const [step, setStep] = React.useState<1 | 2 | 3>(1);
  const [pickedCategoryId, setPickedCategoryId] = React.useState<string>("");
  const [budget, setBudget] = React.useState<number>(2000);            // rupees (initial budget: 2000, slider min lowered to 200)
  const [urgency, setUrgency] = React.useState<Urgency>("standard");
  const [results, setResults] = React.useState<IHCandidate[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Group categories by parent for the picker
  const grouped = React.useMemo(() => {
    const parents = categories.filter(c => !c.parent_category_id && c.status === "active");
    const children = activeSubcats;
    if (parents.length === 0) {
      return [{ parent: null, children: children }];
    }
    return parents.map(p => ({
      parent: p,
      children: children.filter(c => c.parent_category_id === p.id),
    }));
  }, [categories, activeSubcats]);

  // Lock body scroll while open
  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // ESC to close
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const goNext = async () => {
    if (step === 1) {
      if (!pickedCategoryId) return;
      setStep(2);
      return;
    }
    if (step === 2) {
      setStep(3);
      await runMatch();
      return;
    }
    if (step === 3) onClose();
  };

  const goBack = () => {
    if (step === 1) onClose();
    else setStep((s) => (s === 3 ? 2 : 1) as 1 | 2 | 3);
  };

  const runMatch = async () => {
    if (!pickedCategoryId) return;
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const sb = createClient();
      const { data } = await (sb.rpc as any)("list_instant_hire_candidates", { p_category_id: pickedCategoryId });
      const list = ((data ?? []) as IHCandidate[]).filter(c => {
        const rate = c.standing_rate ?? 0;
        // paise → rupees for comparison
        return rate === 0 || rate / 100 <= budget * (urgency === "critical" ? 1.5 : urgency === "urgent" ? 1.2 : 1);
      });
      const sorted = list.slice().sort((a, b) => {
        const ra = Number(a.avg_rating ?? 0);
        const rb = Number(b.avg_rating ?? 0);
        if (rb !== ra) return rb - ra;
        return Number(b.total_reviews ?? 0) - Number(a.total_reviews ?? 0);
      });
      setResults(sorted.slice(0, 3));
    } catch (e: any) {
      setError(e?.message ?? "Failed to fetch matches");
    } finally {
      setLoading(false);
    }
  };

  const budgetPremium = urgency === "urgent" ? 1.2 : urgency === "critical" ? 1.5 : 1;
  const adjustedBudget = Math.round(budget * budgetPremium);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Smart Match wizard"
    >
      <div
        className="glass relative w-full max-w-[600px] overflow-hidden rounded-2xl border border-border/60 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-border/60 bg-background/50 px-5 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-primary/15 text-primary">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <div>
              <p className="text-sm font-semibold">Smart Match</p>
              <p className="text-[10px] text-muted-foreground">Step {step} of 3</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 border-b border-border/60 bg-background/30 px-5 py-3">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className={cn(
                "h-1.5 rounded-full transition-all",
                n === step ? "w-8 bg-primary" : n < step ? "w-4 bg-primary/60" : "w-2.5 bg-muted-foreground/30",
              )}
            />
          ))}
        </div>

        {/* Body */}
        <div className="max-h-[70vh] overflow-y-auto p-5">
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h3 className="font-display text-xl font-semibold">What do you need?</h3>
                <p className="mt-1 text-sm text-muted-foreground">Pick a category — we&apos;ll match the right Pros.</p>
              </div>
              <div className="space-y-4">
                {grouped.map((g) => {
                  if (g.children.length === 0) return null;
                  return (
                    <div key={g.parent?.id ?? "no-parent"}>
                      {g.parent && (
                        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          <CategoryIcon name={g.parent.icon} className="h-3.5 w-3.5" />
                          {g.parent.name}
                          <Badge
                            variant={g.parent.tier === "role_engagement" ? "tierB" : "tierA"}
                            className="text-[9px]"
                          >
                            {g.parent.tier === "role_engagement" ? "Tier B" : "Tier A"}
                          </Badge>
                        </div>
                      )}
                      <div className="grid gap-2 sm:grid-cols-2">
                        {g.children.map(c => {
                          const selected = pickedCategoryId === c.id;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => setPickedCategoryId(c.id)}
                              className={cn(
                                "group flex items-center gap-3 rounded-lg border p-3 text-left transition-all",
                                selected
                                  ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                                  : "hover:border-primary/40 hover:bg-accent",
                              )}
                            >
                              <div className={cn(
                                "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
                                c.tier === "role_engagement"
                                  ? "bg-violet-500/10 text-violet-700 dark:text-violet-300"
                                  : "bg-sky-500/10 text-sky-700 dark:text-sky-300",
                              )}>
                                <CategoryIcon name={c.icon} className="h-4 w-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold">{c.name}</p>
                                <p className="text-[10px] text-muted-foreground">
                                  {c.tier === "role_engagement" ? "Tier B · Role" : "Tier A · Micro"}
                                </p>
                              </div>
                              {selected && (
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {grouped.every(g => g.children.length === 0) && (
                  <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                    No active categories yet. Please check back soon.
                  </p>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h3 className="font-display text-xl font-semibold">Budget &amp; urgency</h3>
                <p className="mt-1 text-sm text-muted-foreground">How much are you willing to pay, and how soon?</p>
              </div>

              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Budget</label>
                  <div className="text-right">
                    <p className="font-display text-2xl font-bold">{formatPaise(budget * 100)}</p>
                    {urgency !== "standard" && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400">
                        +{Math.round((budgetPremium - 1) * 100)}% premium → {formatPaise(adjustedBudget * 100)}
                      </p>
                    )}
                  </div>
                </div>
                <input
                  type="range"
                  min={BUDGET_MIN}
                  max={BUDGET_MAX}
                  step={100}
                  value={budget}
                  onChange={(e) => setBudget(Number(e.target.value))}
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
                  aria-label="Budget slider"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>{formatPaise(BUDGET_MIN * 100)}</span>
                  <span>{formatPaise(BUDGET_MAX * 100)}</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[500, 2000, 10000, 50000].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setBudget(preset)}
                      className={cn(
                        "rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                        budget === preset
                          ? "border-primary bg-primary/10 text-primary"
                          : "hover:border-primary/40",
                      )}
                    >
                      {formatPaise(preset * 100)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Urgency</label>
                <div className="grid gap-2 sm:grid-cols-3">
                  {URGENCY_OPTIONS.map((u) => {
                    const selected = urgency === u.id;
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => setUrgency(u.id)}
                        className={cn(
                          "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all",
                          selected
                            ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                            : "hover:border-primary/40 hover:bg-accent",
                        )}
                      >
                        <div className="flex w-full items-center justify-between">
                          <u.Icon className={cn(
                            "h-4 w-4",
                            u.id === "critical" ? "text-rose-500" : u.id === "urgent" ? "text-amber-500" : "text-muted-foreground",
                          )} />
                          {selected && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
                        </div>
                        <p className="text-sm font-semibold">{u.label}</p>
                        <p className="text-[10px] text-muted-foreground">{u.sub}</p>
                      </button>
                    );
                  })}
                </div>
                {urgency !== "standard" && (
                  <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                    <Flame className="mr-1 inline h-3 w-3" />
                    <strong>Urgent</strong> tasks get push-notified and a {Math.round((budgetPremium - 1) * 100)}% premium applies. Pro rates already account for the rush.
                  </p>
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h3 className="font-display text-xl font-semibold">Your top 3 matches</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Best Pros for <strong>{activeSubcats.find(c => c.id === pickedCategoryId)?.name ?? "this category"}</strong> at {formatPaise(budget * 100)}.
                </p>
              </div>
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Finding your matches…
                </div>
              ) : error ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                  {error}
                </div>
              ) : results && results.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No matches in that budget range. Try raising the budget or switching tier.
                </div>
              ) : (
                <div className="space-y-2">
                  {results?.map((c, i) => (
                    <div
                      key={c.user_id}
                      className="flex items-center gap-3 rounded-lg border bg-card/60 p-3 backdrop-blur transition-colors hover:border-primary/40"
                    >
                      <div className={cn(
                        "grid h-9 w-9 shrink-0 place-items-center rounded-full font-display text-sm font-bold",
                        i === 0 ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                        : i === 1 ? "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300"
                        : "bg-orange-700/15 text-orange-700 dark:text-orange-300",
                      )}>
                        #{i + 1}
                      </div>
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={c.avatar_url ?? undefined} />
                        <AvatarFallback>
                          {(c.full_name ?? "??").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{c.full_name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          <Star className="mr-0.5 inline h-3 w-3 fill-amber-400 text-amber-500" />
                          {c.avg_rating != null ? Number(c.avg_rating).toFixed(2) : "—"} ·
                          {" "}{c.total_reviews ?? 0} reviews
                          {c.headline && <> · {c.headline}</>}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-display text-base font-bold">{c.standing_rate ? formatPaise(c.standing_rate) : "—"}</p>
                        <Button size="sm" variant="gradient" className="mt-1" onClick={() => onHire(c)}>
                          Hire now
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border/60 bg-background/50 px-5 py-3 backdrop-blur">
          <Button variant="ghost" size="sm" onClick={goBack}>
            <ArrowLeft className="h-3.5 w-3.5" /> {step === 1 ? "Cancel" : "Back"}
          </Button>
          <div className="text-[10px] text-muted-foreground">
            {step === 3 && results && results.length > 0 && (
              <span>{results.length} matches found</span>
            )}
            {!signedIn && step < 3 && (
              <span>You&apos;ll be asked to sign in to send a hire offer</span>
            )}
          </div>
          <Button
            size="sm"
            variant="gradient"
            disabled={step === 1 && !pickedCategoryId}
            onClick={goNext}
          >
            {step === 3 ? "Done" : step === 2 ? (<>Find matches <Sparkles className="h-3.5 w-3.5" /></>) : (<>Next <ChevronRight className="h-3.5 w-3.5" /></>)}
          </Button>
        </div>
      </div>
    </div>
  );
}
