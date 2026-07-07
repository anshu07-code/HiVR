"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Wallet, Briefcase, Award, TrendingUp, Star, ArrowRight, ListChecks, FileText,
  Plus, CheckCircle2, AlertCircle, Sparkles, Hammer, UserSearch, IndianRupee,
  Activity, Clock, Zap, Target, ChevronRight, BarChart3, Trophy, Flame,
  TrendingDown, Minus, Calendar, MessageSquare, Bell, ArrowUpRight, Eye,
  Layers, Gauge, CircleDot, X,
} from "lucide-react";
import { cn, formatPaise } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */
type Mode = "employee" | "buyer" | "both";

// Icon name as string (RSC-safe). We look up the component from
// lucide-react inside the client component. This is the standard
// pattern for passing icon references across the RSC boundary.
export type IconName =
  | "Wallet" | "Briefcase" | "Award" | "TrendingUp" | "Star" | "ListChecks"
  | "FileText" | "Plus" | "Sparkles" | "Hammer" | "UserSearch" | "IndianRupee"
  | "Activity" | "Clock" | "Zap" | "Target" | "Trophy" | "Flame"
  | "TrendingDown" | "ArrowRight" | "ArrowUpRight" | "Layers" | "Gauge"
  | "CheckCircle2" | "CircleDot";

type Accent = "primary" | "emerald" | "amber" | "sky" | "purple" | "rose";

type SparkSeries = { name: string; series: number[]; color: string };

export type PremiumKpis = Kpi[];
export type PremiumRecent = RecentItem[];
export type PremiumDaily = DailyPaise[];
export type PremiumHeat = HeatCell[];
export type PremiumLevel = Props["level"];
export type PremiumGreeting = Props["greeting"];
export type PremiumQuickActions = QuickAction[];

type Kpi = {
  label: string;
  value: string;
  hint?: string;
  delta?: number;            // % change vs prev period
  trend?: "up" | "down" | "flat";
  icon: string;               // IconName string, looked up via getIcon()
  accent: Accent;
  series?: number[];          // sparkline
  href?: string;
};

type DailyPaise = { day: string; paise: number };

type HeatCell = { date: string; value: number; hint?: string; buyerValue?: number; employeeValue?: number };

type RecentItem = {
  id: string;
  icon: string;               // IconName string
  iconAccent: Accent;
  title: string;
  subtitle?: string;
  amountPaise?: number;
  href?: string;
  at: string;
};

type QuickAction = {
  label: string;
  description: string;
  href: string;
  icon: string;               // IconName string
  accent: Accent;
  badge?: string;
};

type Props = {
  userId: string;
  fullName: string;
  mode: Mode;
  role: "buyer" | "employee" | "both";
  kpis: Kpi[];
  recent: RecentItem[];
  quickActions: QuickAction[];
  // Earning / spend time series
  spendDaily: DailyPaise[];     // last 30 days (buyer spend)
  earningsDaily: DailyPaise[];  // last 30 days (employee earnings)
  // Activity heatmap
  heatmap: HeatCell[];          // last 90 days
  // Profile level / progress
  level: { name: string; tier: string; progressPct: number; nextTier: string; xpToNext: number; xp: number };
  // Header greeting
  greeting: { title: string; subtitle: string; tag: string };
  // For the loading state when the user lands
  loading?: boolean;
};

/* ------------------------------------------------------------------ */
/*  Icon lookup — RSC-safe. Components in lucide-react are functions   */
/*  which can't be passed across the server→client boundary. The    */
/*  server passes icon NAMES; this map resolves them on the client.  */
/* ------------------------------------------------------------------ */
const ICONS: Record<IconName, React.ComponentType<{ className?: string }>> = {
  Wallet, Briefcase, Award, TrendingUp, Star, ListChecks,
  FileText, Plus, Sparkles, Hammer, UserSearch, IndianRupee,
  Activity, Clock, Zap, Target, Trophy, Flame,
  TrendingDown, ArrowRight, ArrowUpRight, Layers, Gauge,
  CheckCircle2, CircleDot,
};
function getIcon(name: string): React.ComponentType<{ className?: string }> {
  return (ICONS as Record<string, React.ComponentType<{ className?: string }>>)[name] ?? CircleDot;
}

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */
export function PremiumDashboard(props: Props) {
  const { fullName, greeting, kpis, recent, quickActions, spendDaily, earningsDaily, heatmap, level, mode } = props;

  return (
    <div className="space-y-5 overflow-x-hidden">
      {/* Hero greeting with mode chip + level */}
      <HeroGreeting
        fullName={fullName}
        title={greeting.title}
        subtitle={greeting.subtitle}
        tag={greeting.tag}
        level={level}
        mode={mode}
      />

      {/* KPI tiles with sparklines + trend arrows */}
      <KpiGrid kpis={kpis} />

      {/* Earnings / spend chart + heatmap */}
      {mode === "both" ? (
        <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
          <div className="lg:col-span-2 min-w-0">
            <EarningsCard daily={spendDaily} accent="sky" title="Spend · last 30 days" />
          </div>
          <div className="min-w-0">
            <ActivityHeatmapCard heatmap={heatmap} valueKey="buyerValue" title="Buyer activity · 90d" />
          </div>
          <div className="lg:col-span-2 min-w-0">
            <EarningsCard daily={earningsDaily} accent="emerald" title="Earnings · last 30 days" />
          </div>
          <div className="min-w-0">
            <ActivityHeatmapCard heatmap={heatmap} valueKey="employeeValue" title="Employee activity · 90d" />
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
          {(mode === "buyer") && (
            <div className="lg:col-span-2 min-w-0">
              <EarningsCard daily={spendDaily} accent="sky" title="Spend · last 30 days" />
            </div>
          )}
          {(mode === "employee") && (
            <div className="lg:col-span-2 min-w-0">
              <EarningsCard daily={earningsDaily} accent="emerald" title="Earnings · last 30 days" />
            </div>
          )}
          <div className="min-w-0">
            <ActivityHeatmapCard heatmap={heatmap} />
          </div>
        </div>
      )}

      {/* Quick actions */}
      <QuickActionsRow actions={quickActions} />

      {/* Recent activity + Level progress — level card sticks to fill height */}
      <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <div className="min-w-0 lg:col-span-2">
          <RecentActivityCard items={recent} />
        </div>
        <div className="min-w-0 lg:sticky lg:top-4 lg:self-start">
          <LevelProgressCard level={level} />
        </div>
      </div>
    </div>
  );
}

/* ====================================================================
   HERO GREETING
   ==================================================================== */
function HeroGreeting({
  fullName, title: serverTitle, subtitle, tag, level, mode,
}: {
  fullName: string;
  title: string;
  subtitle: string;
  tag: string;
  level: Props["level"];
  mode: Mode;
}) {
  const [title, setTitle] = React.useState(serverTitle);
  React.useEffect(() => {
    const h = new Date().getHours();
    setTitle(h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");
  }, []);
  // Mode accent
  const modeAccent = mode === "buyer"
    ? "from-sky-500/10 via-primary/5 to-transparent"
    : mode === "employee"
      ? "from-emerald-500/10 via-primary/5 to-transparent"
      : "from-purple-500/10 via-primary/5 to-transparent";
  const modeIconName = mode === "buyer" ? "Briefcase" : mode === "employee" ? "Hammer" : "Layers";
  const ModeIcon = getIcon(modeIconName);
  const modeLabel = mode === "buyer" ? "Buyer Mode" : mode === "employee" ? "Employee Mode" : "Dual Mode";

  return (
    <div className={cn(
      "hero-card relative overflow-hidden rounded-2xl border bg-gradient-to-br p-5 md:p-7",
      modeAccent
    )}>
      {/* Decorative blobs */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl hero-blob hero-blob-1" />
      <div className="pointer-events-none absolute -left-12 -bottom-12 h-40 w-40 rounded-full bg-purple-500/8 blur-3xl hero-blob hero-blob-2" />
      <div className="pointer-events-none absolute right-1/3 top-1/2 h-2 w-2 rounded-full bg-primary/40 hero-particle" />

      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div className="flex-1 min-w-[200px]">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="hero-badge border-primary/30 bg-primary/10 text-primary">
              <ModeIcon className="mr-1 h-3 w-3" />{modeLabel}
            </Badge>
            <Badge variant="outline" className="hero-badge-2 border-primary/30 bg-primary/10 text-primary">
              <Trophy className="mr-1 h-3 w-3" />{level.tier}
            </Badge>
            <Badge variant="outline" className="hero-badge-3">
              {tag}
            </Badge>
          </div>
          <h1 className="hero-title mt-3 font-display text-2xl font-bold tracking-tight md:text-3xl">
            {title}, <span className="text-primary">{fullName}</span>
          </h1>
          <p className="hero-subtitle mt-1.5 max-w-xl text-sm text-muted-foreground">
            {subtitle}
          </p>
        </div>

        <div className="hero-level hidden md:flex flex-col items-end gap-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Level</p>
          <p className="font-display text-xl font-bold text-foreground">{level.name}</p>
          <XpRing progressPct={level.progressPct} />
          <p className="text-[10px] text-muted-foreground">{level.xpToNext} XP to <span className="font-semibold text-foreground">{level.nextTier}</span></p>
        </div>
      </div>
    </div>
  );
}

function XpRing({ progressPct }: { progressPct: number }) {
  const R = 22;
  const C = 2 * Math.PI * R;
  const dash = C;
  const filled = (progressPct / 100) * C;
  return (
    <div className="relative h-14 w-14">
      <svg viewBox="0 0 56 56" className="h-14 w-14 -rotate-90">
        <circle cx="28" cy="28" r={R} stroke="currentColor" strokeWidth="3" fill="none" className="text-muted/30" />
        <circle
          cx="28" cy="28" r={R}
          stroke="url(#xp-gradient)"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${dash}`}
          className="xp-ring-progress"
        />
        <defs>
          <linearGradient id="xp-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="50%" stopColor="#0ea5e9" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="font-display text-xs font-bold text-foreground tabular-nums">{Math.round(progressPct)}%</span>
      </div>
    </div>
  );
}

/* ====================================================================
   KPI GRID — premium sparkline tiles
   ==================================================================== */
function KpiGrid({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 [&>*]:min-w-0">
      {kpis.map((k, i) => (
        <KpiTile key={k.label} kpi={k} delay={i * 60} />
      ))}
    </div>
  );
}

function KpiTile({ kpi, delay }: { kpi: Kpi; delay: number }) {
  const Icon = getIcon(kpi.icon);
  const accentMap: Record<string, { grad: string; text: string; ring: string; glow: string }> = {
    primary: { grad: "from-primary/15 to-primary/5", text: "text-primary", ring: "ring-primary/20", glow: "shadow-primary/20" },
    emerald: { grad: "from-emerald-500/15 to-emerald-500/5", text: "text-emerald-600", ring: "ring-emerald-500/20", glow: "shadow-emerald-500/20" },
    amber: { grad: "from-amber-500/15 to-amber-500/5", text: "text-amber-600", ring: "ring-amber-500/20", glow: "shadow-amber-500/20" },
    sky: { grad: "from-sky-500/15 to-sky-500/5", text: "text-sky-600", ring: "ring-sky-500/20", glow: "shadow-sky-500/20" },
    purple: { grad: "from-purple-500/15 to-purple-500/5", text: "text-purple-600", ring: "ring-purple-500/20", glow: "shadow-purple-500/20" },
    rose: { grad: "from-rose-500/15 to-rose-500/5", text: "text-rose-600", ring: "ring-rose-500/20", glow: "shadow-rose-500/20" },
  };
  const a = accentMap[kpi.accent];
  const TrendIcon = kpi.trend === "up" ? TrendingUp : kpi.trend === "down" ? TrendingDown : Minus;
  const trendColor = kpi.trend === "up" ? "text-emerald-600" : kpi.trend === "down" ? "text-rose-600" : "text-muted-foreground";
  const Wrapper: any = kpi.href ? Link : "div";
  const wrapperProps: any = kpi.href ? { href: kpi.href } : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={cn(
        "kpi-tile group relative overflow-hidden rounded-xl border bg-gradient-to-br p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-current/10",
        a.grad, a.ring, a.glow
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{kpi.label}</p>
          <p className={cn("mt-1.5 font-display text-2xl font-bold tabular-nums leading-tight", a.text)}>{kpi.value}</p>
          {kpi.hint && (
            <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
              {kpi.delta !== undefined && kpi.trend && (
                <span className={cn("inline-flex items-center gap-0.5", trendColor)}>
                  <TrendIcon className="h-2.5 w-2.5" />
                  {kpi.delta >= 0 ? "+" : ""}{kpi.delta.toFixed(1)}%
                </span>
              )}
              <span className="truncate">{kpi.hint}</span>
            </p>
          )}
        </div>
        <div className={cn("grid h-9 w-9 place-items-center rounded-lg bg-background/40 ring-1", a.ring, "transition-transform group-hover:scale-110")}>
          <Icon className={cn("h-4 w-4", a.text)} />
        </div>
      </div>
      {kpi.series && kpi.series.length > 1 && (
        <div className="mt-2 -mb-1 -mx-1 kpi-spark-wrap">
          <MiniSpark series={kpi.series} color={accentColorHex(kpi.accent)} />
        </div>
      )}
      <div className="pointer-events-none absolute -bottom-6 -right-6 h-20 w-20 rounded-full bg-current opacity-[0.04] blur-2xl" />
    </Wrapper>
  );
}

function accentColorHex(accent: Kpi["accent"]): string {
  return {
    primary: "#0ea5e9",
    emerald: "#10b981",
    amber: "#f59e0b",
    sky: "#0ea5e9",
    purple: "#a855f7",
    rose: "#f43f5e",
  }[accent];
}

function MiniSpark({ series, color }: { series: number[]; color: string }) {
  if (series.length < 2) return null;
  const W = 240;
  const H = 28;
  const max = Math.max(1, ...series);
  const min = Math.min(0, ...series);
  const range = max - min || 1;
  const xFor = (i: number) => (i / (series.length - 1)) * W;
  const yFor = (v: number) => H - ((v - min) / range) * H;

  const path = series.map((v, i) => `${i === 0 ? "M" : "L"}${xFor(i)},${yFor(v)}`).join(" ");
  const areaPath = `${path} L${W},${H} L0,${H} Z`;
  const uid = `s-${color.replace("#", "")}`;
  const lastVal = series[series.length - 1];
  const firstVal = series[0];
  const trendUp = lastVal >= firstVal;
  const lineColor = trendUp ? color : "#f43f5e";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-7 w-full" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}-grad`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity="0.35" />
          <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${uid}-grad)`} className="spark-fill" />
      <path d={path} fill="none" stroke={lineColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="spark-line" />
      <circle
        cx={xFor(series.length - 1)}
        cy={yFor(lastVal)}
        r="2.5"
        fill={lineColor}
        className="spark-dot"
      />
      <style jsx>{`
        .spark-fill { animation: sparkFadeIn 0.5s ease-out both; }
        .spark-line { stroke-dasharray: ${W * 2}; stroke-dashoffset: ${W * 2}; animation: sparkDraw 1s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .spark-dot  { animation: sparkPulse 2s ease-in-out infinite 1s; transform-origin: center; }
        @keyframes sparkDraw  { to { stroke-dashoffset: 0; } }
        @keyframes sparkFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes sparkPulse { 0%, 100% { transform: scale(1); opacity: 0.9; } 50% { transform: scale(2.2); opacity: 0.5; } }
      `}</style>
    </svg>
  );
}

/* ====================================================================
   EARNINGS / SPEND CARD
   ==================================================================== */
function EarningsCard({ daily, accent, title }: { daily: DailyPaise[]; accent: "emerald" | "sky"; title?: string }) {
  const accentClass = accent === "emerald"
    ? { text: "text-emerald-600", grad: "from-emerald-500/15 to-emerald-500/5", ring: "ring-emerald-500/20", hex: "#10b981" }
    : { text: "text-sky-600", grad: "from-sky-500/15 to-sky-500/5", ring: "ring-sky-500/20", hex: "#0ea5e9" };

  const total = daily.reduce((s, d) => s + d.paise, 0);
  const rawMax = Math.max(1, ...daily.map((d) => d.paise));
  // Compute nice round max for clean y-axis ticks
  const rawStep = rawMax / 3;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const niceStepMag = norm <= 1.5 ? 1 : norm <= 3.5 ? 2 : norm <= 7.5 ? 5 : 10;
  const niceStep = niceStepMag * mag;
  const max = Math.ceil(rawMax / niceStep) * niceStep;

  const W = 540;
  const H = 160;
  const PAD_L = 36;
  const PAD_R = 12;
  const PAD_T = 16;
  const PAD_B = 24;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const n = daily.length;
  const xFor = (i: number) => PAD_L + (i / Math.max(1, n - 1)) * innerW;
  const yFor = (v: number) => PAD_T + innerH - (v / max) * innerH;

  // Area path
  const areaPath = daily.map((d, i) => `${i === 0 ? "M" : "L"}${xFor(i)},${yFor(d.paise)}`).join(" ") + ` L${W - PAD_R},${H - PAD_B} L${PAD_L},${H - PAD_B} Z`;
  const linePath = daily.map((d, i) => `${i === 0 ? "M" : "L"}${xFor(i)},${yFor(d.paise)}`).join(" ");

  // Hover state
  const [hover, setHover] = React.useState<{ i: number; x: number; y: number } | null>(null);
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = (e.clientX - rect.left) / rect.width;
    const xSvg = xPct * W;
    if (xSvg < PAD_L || xSvg > W - PAD_R) { setHover(null); return; }
    const i = Math.round(((xSvg - PAD_L) / innerW) * (n - 1));
    if (i < 0 || i >= n) { setHover(null); return; }
    setHover({ i, x: xSvg, y: yFor(daily[i].paise) });
  };

  // Tick values — nice round numbers
  const yTicks = 3;
  const tickValues = Array.from({ length: yTicks + 1 }, (_, i) => max - (max / yTicks) * i);

  // Best day
  let bestDay: DailyPaise | null = null;
  let bestPaise = 0;
  for (const d of daily) {
    if (d.paise > bestPaise) {
      bestPaise = d.paise;
      bestDay = d;
    }
  }

  return (
    <Card className={cn("relative overflow-hidden border-0 bg-gradient-to-br", accentClass.grad)}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className={cn("h-4 w-4", accentClass.text)} />
            {title ?? (accent === "emerald" ? "Earnings · last 30 days" : "Spend · last 30 days")}
          </CardTitle>
          <CardDescription>Hover the chart for daily breakdown. Updated live.</CardDescription>
        </div>
        <div className="text-right">
          <p className={cn("font-display text-2xl font-bold tabular-nums", accentClass.text)}>
            {formatPaise(total)}
          </p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">30d total</p>
        </div>
      </CardHeader>
      <CardContent>
        {total > 0 ? (
          <div className="relative">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="h-40 w-full"
              preserveAspectRatio="none"
              onMouseMove={onMove}
              onMouseLeave={() => setHover(null)}
            >
              <defs>
                <linearGradient id="earn-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accentClass.hex} stopOpacity="0.4" />
                  <stop offset="100%" stopColor={accentClass.hex} stopOpacity="0" />
                </linearGradient>
              </defs>
              {tickValues.map((t, i) => {
                const y = yFor(t);
                return (
                  <g key={i}>
                    <line x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} stroke="currentColor" strokeOpacity="0.06" />
                    <text x={PAD_L - 6} y={y + 3} textAnchor="end" className="fill-muted-foreground" style={{ fontSize: 9 }}>
                      ₹{Math.round(t / 100)}
                    </text>
                  </g>
                );
              })}
              <path d={areaPath} fill="url(#earn-grad)" className="earn-fill" />
              <path d={linePath} fill="none" stroke="#000" strokeOpacity="0.7" strokeWidth="1.5" className="earn-line" />
              {hover && (
                <g pointerEvents="none">
                  <line x1={hover.x} x2={hover.x} y1={PAD_T} y2={H - PAD_B} stroke="#000" strokeOpacity="0.12" className="earn-cursor" />
                  <circle cx={hover.x} cy={hover.y} r="4" fill="#fff" stroke="#000" strokeOpacity="0.7" strokeWidth="1.5" className="earn-dot" />
                  <circle cx={hover.x} cy={hover.y} r="2.5" fill="#000" fillOpacity="0.7" className="earn-dot-inner" />
                </g>
              )}
              {daily.map((d, i) =>
                (i === 0 || i === Math.floor(n / 2) || i === n - 1) ? (
                  <text
                    key={d.day}
                    x={xFor(i)}
                    y={H - 6}
                    textAnchor="middle"
                    className="fill-muted-foreground"
                    style={{ fontSize: 9 }}
                  >
                    {d.day.slice(5)}
                  </text>
                ) : null
              )}
            </svg>
            {hover && (
              <div
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-2.5 py-1.5 text-[11px] text-popover-foreground shadow-md earn-tooltip"
                style={{ left: `${(hover.x / W) * 100}%`, top: `${(hover.y / H) * 100}%` }}
              >
                <p className="font-mono text-[10px] text-muted-foreground">{daily[hover.i].day}</p>
                <p className="font-display text-sm font-bold">{formatPaise(daily[hover.i].paise)}</p>
              </div>
            )}
            {bestDay && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                <Sparkles className={cn("mr-1 inline h-3 w-3", accentClass.text)} />
                Best day: <strong>{formatPaise(bestPaise)}</strong> on {bestDay.day.slice(5)}
              </p>
            )}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No {accent === "emerald" ? "earnings" : "spend"} recorded in the last 30 days.
          </p>
        )}
      </CardContent>
      <style jsx>{`
        .earn-fill { transform-origin: center bottom; animation: earnGrow 0.9s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .earn-line { stroke-dasharray: 2000; stroke-dashoffset: 2000; animation: drawEarn 1.2s cubic-bezier(0.22, 1, 0.36, 1) 0.1s both; }
        .earn-dot  { transform-origin: center; animation: dotPulse 2s ease-in-out infinite; }
        .earn-cursor { animation: cursorFade 0.15s ease-out both; }
        .earn-tooltip { animation: tooltipIn 0.15s ease-out both; }
        @keyframes drawEarn  { to { stroke-dashoffset: 0; } }
        @keyframes earnGrow  { 0% { opacity: 0; transform: scaleY(0.6); } 100% { opacity: 1; transform: scaleY(1); } }
        @keyframes dotPulse  { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.5); } }
        @keyframes cursorFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes tooltipIn  { from { opacity: 0; transform: translate(-50%, calc(-100% + 6px)) scale(0.9); } to { opacity: 1; transform: translate(-50%, -100%) scale(1); } }
      `}</style>
    </Card>
  );
}

/* ====================================================================
   ACTIVITY HEATMAP — 90 days, when are you most active?
   ==================================================================== */
function ActivityHeatmapCard({ heatmap, valueKey = "value", title }: { heatmap: HeatCell[]; valueKey?: "value" | "buyerValue" | "employeeValue"; title?: string }) {
  // The heatmap array is the last 90 days, oldest first. We need to
  // pad the front so the first column aligns to a known day-of-week
  // (we use Monday = 0, Sunday = 6). The proper GitHub-style layout
  // is 7 rows × N columns, where each column is a week and each row
  // is a day-of-week.
  const total = heatmap.length > 0 ? heatmap.length : 0;
  const firstDate = total > 0 ? new Date(heatmap[0].date + "T00:00:00") : null;
  const dayOfWeekOffset = firstDate ? (firstDate.getDay() + 6) % 7 : 0;  // Monday = 0
  const padded: (HeatCell | null)[] = [
    ...Array(dayOfWeekOffset).fill(null),
    ...heatmap,
  ];
  const totalCells = padded.length;
  const numCols = Math.ceil(totalCells / 7);
  // Pad the end so the last column is also a full week
  while (padded.length < numCols * 7) padded.push(null);

  const max = Math.max(1, ...heatmap.map((h) => h[valueKey] ?? 0));
  const totalActivity = heatmap.reduce((s, h) => s + (h[valueKey] ?? 0), 0);
  const activeDays = heatmap.filter((h) => (h[valueKey] ?? 0) > 0).length;

  // Month labels: track the first column where each month appears
  const monthLabels: { col: number; label: string }[] = [];
  let lastMonth = -1;
  for (let col = 0; col < numCols; col++) {
    const idx = col * 7;
    const cell = padded[idx];
    if (cell) {
      const d = new Date(cell.date + "T00:00:00");
      const m = d.getMonth();
      if (m !== lastMonth) {
        monthLabels.push({ col, label: d.toLocaleString("en", { month: "short" }) });
        lastMonth = m;
      }
    }
  }

  // Hover state for the tooltip showing real data
  const [hover, setHover] = React.useState<{ cell: HeatCell; x: number; y: number } | null>(null);
  // Click state for day detail popup
  const [clickedDay, setClickedDay] = React.useState<HeatCell | null>(null);

  return (
    <Card className="relative h-full overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Calendar className="h-4 w-4 text-info" />
          {title ?? "Activity · last 90 days"}
        </CardTitle>
        <CardDescription>
          {totalActivity > 0
            ? `${activeDays} active day${activeDays === 1 ? "" : "s"} · ${totalActivity} total event${totalActivity === 1 ? "" : "s"}`
            : "Each square is a day. Brighter = more active."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className="relative flex justify-center gap-1.5"
          onMouseLeave={() => setHover(null)}
        >
          {/* Day-of-week labels (Mon, Wed, Fri) — vertically aligned with rows 0, 2, 4 */}
          <div className="flex w-3 shrink-0 flex-col gap-1 pt-3.5 text-[9px] text-muted-foreground">
            <span className="h-3 leading-3">M</span>
            <span className="h-3 leading-3" />
            <span className="h-3 leading-3">W</span>
            <span className="h-3 leading-3" />
            <span className="h-3 leading-3">F</span>
            <span className="h-3 leading-3" />
            <span className="h-3 leading-3" />
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-fit">
              {/* Month labels row (aligned with week columns) */}
              <div className="relative mb-1 h-3 text-[9px] text-muted-foreground">
                {monthLabels.map((m) => (
                  <span
                    key={`${m.col}-${m.label}`}
                    className="absolute top-0"
                    style={{ left: `${m.col * 14}px` }}
                  >
                    {m.label}
                  </span>
                ))}
              </div>
              {/* The 7-row × N-column grid */}
              <div className="flex gap-1">
                {Array.from({ length: numCols }).map((_, col) => (
                  <div key={col} className="flex flex-col gap-1">
                    {Array.from({ length: 7 }).map((_, row) => {
                      const cell = padded[col * 7 + row];
                      if (!cell) {
                        return <div key={row} className="h-3 w-3 rounded-sm bg-muted/10" />;
                      }
                      const cellVal = cell[valueKey] ?? 0;
                      const intensity = max > 0 ? cellVal / max : 0;
                      const dayDate = new Date(cell.date + "T00:00:00");
                          const dayName = dayDate.toLocaleString("en", { weekday: "short" });
                      return (
                        <div
                          key={row}
                          onMouseEnter={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setHover({
                              cell,
                              x: rect.left + rect.width / 2,
                              y: rect.top - 4,
                            });
                          }}
                          onClick={() => setClickedDay(cell)}
                          className="heatmap-cell h-3 w-3 cursor-pointer rounded-sm ring-1 ring-emerald-500/20 transition-transform hover:scale-150 hover:z-10 hover:ring-2"
                            style={{
                              background:
                                cellVal === 0
                                  ? "rgba(16, 185, 129, 0.04)"
                                  : `rgba(16, 185, 129, ${0.15 + intensity * 0.8})`,
                              animationDelay: `${col * 6}ms`,
                            }}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[9px] text-muted-foreground">
                <span>13w ago</span>
                <span className="flex items-center gap-1">
                  less
                  <span className="inline-block h-2 w-2 rounded-sm bg-emerald-500/10 ring-1 ring-emerald-500/20" />
                  <span className="inline-block h-2 w-2 rounded-sm bg-emerald-500/30 ring-1 ring-emerald-500/20" />
                  <span className="inline-block h-2 w-2 rounded-sm bg-emerald-500/60 ring-1 ring-emerald-500/20" />
                  <span className="inline-block h-2 w-2 rounded-sm bg-emerald-500/90 ring-1 ring-emerald-500/20" />
                  <span className="inline-block h-2 w-2 rounded-sm bg-emerald-500 ring-1 ring-emerald-500/20" />
                  more
                </span>
                <span>today</span>
              </div>
            </div>
          </div>
          {/* Tooltip with REAL data from the hovered cell */}
          {hover && (
            <div
              className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-3 py-2 text-[11px] text-popover-foreground shadow-lg"
              style={{ left: hover.x, top: hover.y }}
            >
              <p className="font-mono text-[10px] text-muted-foreground">
                {dayNameFromIso(hover.cell.date)}
              </p>
              <p className="mt-0.5 font-display text-sm font-bold">
                {(hover.cell[valueKey] ?? 0)} {hover.cell.hint ?? "event"}{(hover.cell[valueKey] ?? 0) === 1 ? "" : "s"}
              </p>
              <p className="text-[10px] text-muted-foreground">{hover.cell.date}</p>
            </div>
          )}
        </div>
        {clickedDay && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/20 p-4" onClick={() => setClickedDay(null)}>
            <div className="w-full max-w-sm rounded-lg border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-semibold">{dayNameFromIso(clickedDay.date)}</h3>
                <button onClick={() => setClickedDay(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between rounded-md border bg-muted/20 p-2.5 text-sm">
                  <span className="text-muted-foreground">Total events</span>
                  <span className="font-display text-lg font-bold">{clickedDay.value}</span>
                </div>
                <div className="flex items-center justify-between rounded-md border p-2.5 text-sm">
                  <span className="flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5 text-primary" /> Buyer events</span>
                  <span className="font-display text-lg font-bold">{clickedDay.buyerValue ?? 0}</span>
                </div>
                <p className="-mt-1 text-[10px] text-muted-foreground pl-7">Contracts started + escrows funded</p>
                <div className="flex items-center justify-between rounded-md border p-2.5 text-sm">
                  <span className="flex items-center gap-1.5"><Hammer className="h-3.5 w-3.5 text-emerald-600" /> Employee events</span>
                  <span className="font-display text-lg font-bold">{clickedDay.employeeValue ?? 0}</span>
                </div>
                <p className="-mt-1 text-[10px] text-muted-foreground pl-7">Contracts started + payments received</p>
              </div>
            </div>
          </div>
        )}
        <style jsx>{`
          .heatmap-cell { animation: cellFadeIn 0.4s ease-out both; }
          @keyframes cellFadeIn { from { opacity: 0; transform: scale(0.6); } to { opacity: 1; transform: scale(1); } }
        `}</style>
      </CardContent>
    </Card>
  );
}

// Helper to format a date string as "Monday, Jul 5" in the tooltip
function dayNameFromIso(iso: string): string {
  try {
    return new Date(iso + "T00:00:00").toLocaleString("en", {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/* ====================================================================
   QUICK ACTIONS
   ==================================================================== */
function QuickActionsRow({ actions }: { actions: QuickAction[] }) {
  const accentMap: Record<string, string> = {
    primary: "hover:border-primary/50 hover:bg-primary/5 hover:shadow-primary/10",
    emerald: "hover:border-emerald-500/50 hover:bg-emerald-500/5 hover:shadow-emerald-500/10",
    amber: "hover:border-amber-500/50 hover:bg-amber-500/5 hover:shadow-amber-500/10",
    sky: "hover:border-sky-500/50 hover:bg-sky-500/5 hover:shadow-sky-500/10",
    purple: "hover:border-purple-500/50 hover:bg-purple-500/5 hover:shadow-purple-500/10",
    rose: "hover:border-rose-500/50 hover:bg-rose-500/5 hover:shadow-rose-500/10",
  };
  const iconMap: Record<string, string> = {
    primary: "text-primary bg-primary/10",
    emerald: "text-emerald-600 bg-emerald-500/15",
    amber: "text-amber-600 bg-amber-500/15",
    sky: "text-sky-600 bg-sky-500/15",
    purple: "text-purple-600 bg-purple-500/15",
    rose: "text-rose-600 bg-rose-500/15",
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 [&>*]:min-w-0">
      {actions.map((a, i) => {
        const Icon = getIcon(a.icon);
        return (
          <Link
            key={a.label}
            href={a.href}
            className={cn(
              "qa-tile group relative overflow-hidden rounded-xl border bg-card p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
              accentMap[a.accent]
            )}
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="flex items-start gap-3">
              <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-transform group-hover:scale-110 group-hover:rotate-3", iconMap[a.accent])}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-semibold">{a.label}</p>
                  {a.badge && (
                    <Badge variant="outline" className="px-1.5 py-0 text-[9px]">{a.badge}</Badge>
                  )}
                </div>
                <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{a.description}</p>
              </div>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
          </Link>
        );
      })}
    </div>
  );
}

/* ====================================================================
   RECENT ACTIVITY
   ==================================================================== */
function RecentActivityCard({ items }: { items: RecentItem[] }) {
  const accentMap: Record<string, { text: string; bg: string }> = {
    primary: { text: "text-primary", bg: "bg-primary/10" },
    emerald: { text: "text-emerald-600", bg: "bg-emerald-500/10" },
    amber: { text: "text-amber-600", bg: "bg-amber-500/10" },
    rose: { text: "text-rose-600", bg: "bg-rose-500/10" },
    sky: { text: "text-sky-600", bg: "bg-sky-500/10" },
  };
  const [expanded, setExpanded] = React.useState(true);
  const COLLAPSED_COUNT = 3;
  const visible = expanded ? items : items.slice(0, COLLAPSED_COUNT);

  return (
    <Card className="relative h-full overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-primary" />
            Recent activity
          </CardTitle>
          <CardDescription className="truncate">Live updates on contracts, payments, and offers.</CardDescription>
        </div>
        <Badge variant="outline" className="pulse-dot shrink-0 gap-1 text-[9px]">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Live
        </Badge>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No recent activity yet.</p>
        ) : (
          <>
            <ol className="space-y-1.5">
              {visible.map((it, i) => {
                const Icon = getIcon(it.icon);
                const a = accentMap[it.iconAccent];
                const Wrapper: any = it.href ? Link : "div";
                const wrapperProps: any = it.href ? { href: it.href } : {};
                return (
                  <li key={it.id} style={{ animationDelay: `${i * 60}ms` }} className="ra-item min-w-0">
                    <Wrapper
                      {...wrapperProps}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border bg-background/40 p-2.5 transition-all hover:border-primary/30 hover:bg-muted/40",
                        it.href && "cursor-pointer"
                      )}
                    >
                      <div className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", a.bg, a.text)}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium leading-tight">{it.title}</p>
                        {it.subtitle && (
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{it.subtitle}</p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        {it.amountPaise !== undefined && it.amountPaise !== 0 && (
                          <p className={cn(
                            "font-display text-sm font-bold tabular-nums",
                            it.amountPaise > 0 ? "text-emerald-600" : "text-rose-600"
                          )}>
                            {it.amountPaise > 0 ? "+" : "−"}{formatPaise(Math.abs(it.amountPaise))}
                          </p>
                        )}
                        <p className="text-[10px] tabular-nums text-muted-foreground">{timeAgo(it.at)}</p>
                      </div>
                    </Wrapper>
                  </li>
                );
              })}
            </ol>
            {items.length > COLLAPSED_COUNT && (
              <button
                onClick={() => setExpanded((e) => !e)}
                className="mt-2 w-full rounded-md border border-dashed bg-muted/20 px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
              >
                {expanded
                  ? `Show less (${items.length - COLLAPSED_COUNT} hidden)`
                  : `Show all ${items.length} events`}
              </button>
            )}
          </>
        )}
      </CardContent>
      <style jsx>{`
        .ra-item { animation: raSlideIn 0.4s ease-out both; }
        .pulse-dot > * { animation: dotPulse 1.4s ease-in-out infinite; }
        @keyframes raSlideIn { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes dotPulse  { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </Card>
  );
}

/* ====================================================================
   LEVEL PROGRESS
   ==================================================================== */
function LevelProgressCard({ level }: { level: Props["level"] }) {
  // Achievement milestones
  const milestones = [
    { pct: 0,   label: "Starter",  icon: CircleDot },
    { pct: 25,  label: "Active",   icon: Activity },
    { pct: 50,  label: "Trusted",  icon: ShieldCheck },
    { pct: 75,  label: "Pro",      icon: Zap },
    { pct: 100, label: level.tier, icon: Trophy },
  ];
  const current = level.progressPct;
  const isMaxTier = current >= 100;
  const next = milestones.find((m) => m.pct > current) ?? milestones[milestones.length - 1];

  return (
    <Card className="relative h-full overflow-hidden border-0 bg-gradient-to-br from-teal-500/5 via-card to-emerald-500/5 shadow-sm">
      <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="h-4 w-4 text-teal-500" />
            Your level
          </CardTitle>
        <CardDescription>Earn XP by completing tasks, ratings, and more.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <div className={cn(
            "grid h-12 w-12 place-items-center rounded-xl",
            isMaxTier
              ? "bg-gradient-to-br from-teal-500/25 to-emerald-500/15 ring-1 ring-teal-500/30"
              : "bg-gradient-to-br from-teal-500/15 to-emerald-500/15"
          )}>
            <Trophy className={cn("h-5 w-5", isMaxTier ? "text-teal-500" : "text-teal-600")} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-bold leading-tight">{level.name}</p>
            <p className="text-[11px] text-muted-foreground">
              {isMaxTier
                ? `${level.xp} XP · Top tier reached!`
                : `${level.xp} XP · ${level.xpToNext} to ${level.nextTier}`}
            </p>
          </div>
          {isMaxTier && (
            <Badge className="bg-teal-500/15 text-teal-700 border-teal-500/30 text-[10px]">MAX</Badge>
          )}
        </div>

        <div>
          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted/40">
            <div
              className="xp-fill h-full rounded-full"
              style={{
                width: `${current}%`,
                background: isMaxTier
                  ? "linear-gradient(90deg, #14b8a6 0%, #10b981 50%, #34d399 100%)"
                  : "linear-gradient(90deg, #14b8a6 0%, #0ea5e9 50%, #a855f7 100%)",
              }}
            />
            <div
              className="xp-shine absolute inset-0 rounded-full opacity-60"
              style={{
                background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)",
                animation: "shine 2.5s ease-in-out infinite 1.5s",
              }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>{level.tier}</span>
            <span className="font-semibold text-foreground">{Math.round(current)}%</span>
            <span>{level.nextTier}</span>
          </div>
        </div>

        <div className="space-y-1.5">
          {milestones.map((m) => {
            const MIcon = m.icon;
            const reached = current >= m.pct;
            const isCurrent = !isMaxTier && m.label === next.label;
            return (
              <div
                key={m.label}
                className={cn(
                  "flex items-center gap-2 rounded-md p-1.5 transition-colors",
                  isCurrent ? "bg-primary/5" : "hover:bg-muted/30"
                )}
              >
                <div
                  className={cn(
                    "grid h-6 w-6 place-items-center rounded-full transition-all",
                    reached ? "bg-teal-500/15 text-teal-600" : "bg-muted/30 text-muted-foreground",
                    isCurrent && "ring-2 ring-teal-500/40"
                  )}
                >
                  <MIcon className="h-3 w-3" />
                </div>
                <span className={cn("flex-1 text-[11px]", reached ? "font-semibold" : "text-muted-foreground")}>
                  {m.label}
                </span>
                {reached && <CheckCircle2 className="h-3.5 w-3.5 text-teal-500" />}
                {isCurrent && <Flame className="h-3.5 w-3.5 text-teal-500 animate-pulse" />}
              </div>
            );
          })}
        </div>
      </CardContent>
      <style jsx>{`
        .xp-fill { transition: width 1.2s cubic-bezier(0.22, 1, 0.36, 1); animation: xpGrow 1.2s ease-out both; }
        @keyframes xpGrow { from { transform: scaleX(0); transform-origin: left; } to { transform: scaleX(1); transform-origin: left; } }
        @keyframes shine { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
      `}</style>
    </Card>
  );
}

/* ====================================================================
   Helpers
   ==================================================================== */
function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "now";
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`;
  if (ms < 86_400_000 * 7) return `${Math.round(ms / 86_400_000)}d`;
  if (ms < 86_400_000 * 30) return `${Math.round(ms / (86_400_000 * 7))}w`;
  return `${Math.round(ms / (86_400_000 * 30))}mo`;
}

function ShieldCheck({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
