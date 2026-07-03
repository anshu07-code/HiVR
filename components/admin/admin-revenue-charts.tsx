"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TrendingUp, TrendingDown, Activity, PieChart, BarChart3, IndianRupee, Wallet, CreditCard,
  Briefcase, Receipt, ArrowUpRight, Zap, Clock, Calendar, Target, Sparkles, Activity as PulseIcon,
  ChevronRight, ArrowDownRight, Minus,
} from "lucide-react";
import { formatINR } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

type Day = {
  day: string;
  platformFeePaise: number;
  bankPaise: number;
  withdrawPaise: number;
  escrowPaise: number;
  totalPaise: number;
  revenuePaise: number;
};

type CategoryRow = { name: string; revenuePaise: number; count: number };

type ContractRow = {
  contractId: string;
  taskName: string;
  categoryName: string;
  feePaise: number;
  agreedPricePaise: number;
  completedAt: string;
};

type LiveTicker = { at: string; amount: number; kind: string };

type Props = {
  days: Day[];
  byCategory: CategoryRow[];
  totalRevenue30dPaise: number;
  prev30dRevenuePaise: number;
  totals: {
    total30dPaise: number;
    platformFee30dPaise: number;
    withdrawFee30dPaise: number;
    bankFee30dPaise: number;
    escrowFee30dPaise: number;
    lifetimeEscrowPaise: number;
    lifetimeCompletedContractCount: number;
    lifetimePlatformFeePaise: number;
    avgFeePerContractPaise: number;
  };
  completedContractsList: ContractRow[];
  liveTicker: LiveTicker[];
};

const SOURCE_COLORS = {
  platformFee: "#10b981",
  withdraw: "#f59e0b",
  bank: "#a855f7",
  escrow: "#0ea5e9",
} as const;

const CATEGORY_PALETTE = [
  "#0ea5e9", "#10b981", "#f59e0b", "#a855f7", "#ec4899", "#14b8a6", "#f97316", "#6366f1",
  "#ef4444", "#84cc16", "#06b6d4", "#eab308",
];

export function AdminRevenueCharts(props: Props) {
  const router = useRouter();
  const { days, byCategory, totalRevenue30dPaise, prev30dRevenuePaise, totals, completedContractsList, liveTicker } = props;
  const hasAnyRevenue = totalRevenue30dPaise > 0 || totals.lifetimePlatformFeePaise > 0;

  // Realtime refresh: refresh on any change to underlying tables.
  React.useEffect(() => {
    const sb = createClient();
    const channel = sb.channel("admin-revenue-sync");

    channel.on("postgres_changes", { event: "*", schema: "public", table: "workspaces" }, () => router.refresh());
    channel.on("postgres_changes", { event: "*", schema: "public", table: "wallet_transactions" }, () => router.refresh());
    channel.on("postgres_changes", { event: "*", schema: "public", table: "user_wallets" }, () => router.refresh());
    channel.on("postgres_changes", { event: "*", schema: "public", table: "platform_revenue_ledger" }, () => router.refresh());
    channel.on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => router.refresh());
    channel.on("postgres_changes", { event: "*", schema: "public", table: "verifications", filter: `doc_type=eq.bank` }, () => router.refresh());
    channel.on("postgres_changes", { event: "*", schema: "public", table: "verifications" }, () => router.refresh());
    channel.subscribe();

    return () => { sb.removeChannel(channel); };
  }, [router]);

  // Derived insights
  const prev30d = prev30dRevenuePaise;
  const deltaPct = prev30d > 0 ? ((totalRevenue30dPaise - prev30d) / prev30d) * 100 : (totalRevenue30dPaise > 0 ? 100 : 0);
  const trendDir = totalRevenue30dPaise > prev30d ? "up" : totalRevenue30dPaise < prev30d ? "down" : "flat";

  // Find best day in the 30-day window
  let bestDay: Day | null = null;
  let bestDayAmount = 0;
  for (const d of days) {
    if (d.revenuePaise > bestDayAmount) {
      bestDay = d;
      bestDayAmount = d.revenuePaise;
    }
  }
  const avgDaily = totalRevenue30dPaise / Math.max(1, days.length);

  // Weekly breakdown (last 4 weeks for heatmap)
  const weekBuckets: { dayOfWeek: number; hourBucket: number; paise: number }[] = [];
  // We'll skip hour granularity and just show day-of-week × week-of-month
  // for simplicity, but it remains a real heatmap.

  return (
    <div className="space-y-4">
      {/* Hero KPI strip with sparklines + delta arrows */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SparklineKpi
          icon={IndianRupee}
          label="Total revenue · 30d"
          value={formatINR(Math.round(totalRevenue30dPaise / 100))}
          sub={hasAnyRevenue ? `${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}% vs prev 30d` : "no revenue yet"}
          accent="primary"
          trend={trendDir}
          series={days.map((d) => d.revenuePaise)}
        />
        <SparklineKpi
          icon={Briefcase}
          label="Platform fees"
          value={formatINR(Math.round(totals.platformFee30dPaise / 100))}
          sub={`lifetime ${formatINR(Math.round(totals.lifetimePlatformFeePaise / 100))} · ${totals.lifetimeCompletedContractCount} contracts`}
          accent="emerald"
          trend={trendDir}
          series={days.map((d) => d.platformFeePaise)}
        />
        <SparklineKpi
          icon={Wallet}
          label="Withdrawal penalties"
          value={formatINR(Math.round(totals.withdrawFee30dPaise / 100))}
          sub="3/mo free, then 5/10/20% fees"
          accent="amber"
          trend="flat"
          series={days.map((d) => d.withdrawPaise)}
        />
        <SparklineKpi
          icon={Receipt}
          label="Escrow volume"
          value={formatINR(Math.round(totals.escrowFee30dPaise / 100))}
          sub={`lifetime ${formatINR(Math.round(totals.lifetimeEscrowPaise / 100))}`}
          accent="sky"
          trend="up"
          series={days.map((d) => d.escrowPaise)}
        />
      </div>

      {/* Main chart row: stacked area + side panel */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 overflow-hidden border-primary/10 bg-gradient-to-br from-card to-primary/[0.02]">
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-success" />
                  <CardTitle>Revenue · last 30 days</CardTitle>
                </div>
                <CardDescription className="mt-1">
                  Stacked by source. Hover the chart for daily breakdown.
                </CardDescription>
              </div>
              <InsightPill
                icon={bestDay ? Sparkles : Activity}
                text={bestDay
                  ? `Best day: ${formatINR(Math.round(bestDayAmount / 100))} on ${bestDay.day.slice(5)}`
                  : "No revenue yet"}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px]">
              <LegendDot color={SOURCE_COLORS.platformFee} label="Contract fees" />
              <LegendDot color={SOURCE_COLORS.withdraw} label="Withdraw penalties" />
              <LegendDot color={SOURCE_COLORS.bank} label="Bank verif" />
              <span className="ml-auto inline-flex items-center gap-1 text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-primary/60" />
                Forecast →
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {hasAnyRevenue ? (
              <StackedAreaWithForecast days={days} />
            ) : (
              <EmptyState message="No revenue recorded in the last 30 days. Once contracts complete, daily revenue will appear here." />
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="space-y-2">
            <div className="flex items-center gap-2">
              <PieChart className="h-5 w-5 text-primary" />
              <CardTitle>Revenue by category</CardTitle>
            </div>
            <CardDescription>
              Lifetime platform fees across <span className="font-semibold text-foreground">{totals.lifetimeCompletedContractCount}</span> completed contract{totals.lifetimeCompletedContractCount === 1 ? "" : "s"}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {byCategory.length > 0 ? (
              <CategoryDonut data={byCategory} />
            ) : (
              <EmptyState message="No completed contracts yet. Revenue will appear here once a contract reaches 'completed' status." />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Mid row: 30-day heatmap (day-of-week) + live ticker */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-info" />
              <CardTitle>When revenue happens</CardTitle>
            </div>
            <CardDescription>
              Heatmap of revenue by day-of-week over the last 30 days. Darker = more revenue. Hover for exact amount.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DayOfWeekHeatmap days={days} />
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-500" />
              <CardTitle>Live activity</CardTitle>
            </div>
            <CardDescription>Most recent 12 revenue events. Auto-refreshes on changes.</CardDescription>
          </CardHeader>
          <CardContent>
            <LiveTickerView items={liveTicker} />
          </CardContent>
        </Card>
      </div>

      {/* Source totals + funnel */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-info" />
              <CardTitle>Source totals · last 30 days</CardTitle>
            </div>
            <CardDescription>Per-source breakdown. Hover bars for exact amounts.</CardDescription>
          </CardHeader>
          <CardContent>
            <SourceBars
              rows={[
                { label: "Contract platform fees", paise: totals.platformFee30dPaise, color: SOURCE_COLORS.platformFee, icon: Briefcase },
                { label: "Withdrawal penalties", paise: totals.withdrawFee30dPaise, color: SOURCE_COLORS.withdraw, icon: Wallet },
                { label: "Bank verification", paise: totals.bankFee30dPaise, color: SOURCE_COLORS.bank, icon: CreditCard },
              ]}
            />
            {totals.platformFee30dPaise + totals.withdrawFee30dPaise + totals.bankFee30dPaise > 0 && (
              <p className="mt-4 rounded-md border bg-emerald-500/5 p-2.5 text-[11px] text-emerald-700">
                <Target className="mr-1 inline h-3 w-3" />
                Avg revenue per completed contract: <strong>{formatINR(Math.round(totals.avgFeePerContractPaise / 100))}</strong>
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-purple-500" />
              <CardTitle>Revenue funnel</CardTitle>
            </div>
            <CardDescription>From contract value to platform revenue.</CardDescription>
          </CardHeader>
          <CardContent>
            <RevenueFunnel
              escrowLifetimePaise={totals.lifetimeEscrowPaise}
              platformFeeLifetimePaise={totals.lifetimePlatformFeePaise}
              contractCount={totals.lifetimeCompletedContractCount}
            />
          </CardContent>
        </Card>
      </div>

      {/* Escrow volume + recent contracts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-sky-500" />
              <CardTitle>Escrow volume</CardTitle>
            </div>
            <CardDescription>Gross amount moved through escrow (not revenue).</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <VolumeTile
              label="Escrow volume · 30d"
              paise={totals.escrowFee30dPaise}
              accent="sky"
            />
            <VolumeTile
              label="Escrow volume · lifetime"
              paise={totals.lifetimeEscrowPaise}
              accent="emerald"
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ArrowUpRight className="h-5 w-5 text-primary" />
              <CardTitle>Recent completed contracts</CardTitle>
            </div>
            <CardDescription>Task, category, contract value, and platform fee earned.</CardDescription>
          </CardHeader>
          <CardContent>
            {completedContractsList.length > 0 ? (
              <CompletedContractsTable rows={completedContractsList} />
            ) : (
              <EmptyState message="No completed contracts yet." />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* =============================================================================
   SPARKLINE KPI — animated mini-chart in each tile
   ============================================================================= */
function SparklineKpi({
  icon: Icon, label, value, sub, accent, trend, series,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  accent?: "primary" | "emerald" | "amber" | "sky" | "purple";
  trend: "up" | "down" | "flat";
  series: number[];
}) {
  const accentMap: Record<string, string> = {
    primary: "from-primary/15 to-primary/5 text-primary",
    emerald: "from-emerald-500/15 to-emerald-500/5 text-emerald-600",
    amber: "from-amber-500/15 to-amber-500/5 text-amber-600",
    sky: "from-sky-500/15 to-sky-500/5 text-sky-600",
    purple: "from-purple-500/15 to-purple-500/5 text-purple-600",
  };
  const trendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const TrendIcon = trendIcon;
  const trendColor = trend === "up" ? "text-emerald-600" : trend === "down" ? "text-rose-600" : "text-muted-foreground";

  return (
    <Card className={cn("relative overflow-hidden bg-gradient-to-br transition-transform hover:scale-[1.01]", accentMap[accent ?? "primary"])}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="mt-1.5 font-display text-2xl font-bold tabular-nums leading-tight">{value}</p>
            {sub && (
              <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                <TrendIcon className={cn("h-3 w-3", trendColor)} />
                <span>{sub}</span>
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <Icon className="h-4 w-4 opacity-60" />
          </div>
        </div>
        <div className="mt-2 -mb-1 -mx-1">
          <MiniSpark series={series} color={accent === "amber" ? "#f59e0b" : accent === "sky" ? "#0ea5e9" : accent === "purple" ? "#a855f7" : "#10b981"} />
        </div>
        <div className="pointer-events-none absolute -bottom-4 -right-4 h-16 w-16 rounded-full bg-current opacity-[0.04] blur-2xl" />
      </CardContent>
    </Card>
  );
}

function MiniSpark({ series, color }: { series: number[]; color: string }) {
  if (series.length < 2) return null;
  const W = 220;
  const H = 32;
  const max = Math.max(1, ...series);
  const min = Math.min(0, ...series);
  const range = max - min || 1;
  const xFor = (i: number) => (i / (series.length - 1)) * W;
  const yFor = (v: number) => H - ((v - min) / range) * H;

  const path = series.map((v, i) => `${i === 0 ? "M" : "L"}${xFor(i)},${yFor(v)}`).join(" ");
  const areaPath = `${path} L${W},${H} L0,${H} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-8 w-full" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`spark-grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#spark-grad-${color.replace("#", "")})`} className="spark-fill" />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" className="spark-line" />
      {/* Last-point dot */}
      <circle
        cx={xFor(series.length - 1)}
        cy={yFor(series[series.length - 1])}
        r="2.5"
        fill={color}
        className="spark-dot"
      />
      <style jsx>{`
        .spark-fill { animation: sparkFadeIn 0.6s ease-out both; }
        .spark-line { stroke-dasharray: ${W * 2}; stroke-dashoffset: ${W * 2}; animation: sparkDraw 1.1s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .spark-dot  { animation: sparkPulse 2.2s ease-in-out infinite 1.2s; transform-origin: center; }
        @keyframes sparkDraw  { to { stroke-dashoffset: 0; } }
        @keyframes sparkFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes sparkPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.6); } }
      `}</style>
    </svg>
  );
}

function InsightPill({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-700">
      <Icon className="h-3 w-3" />
      <span>{text}</span>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center rounded-md border border-dashed bg-muted/20 p-6 text-center">
      <BarChart3 className="mb-2 h-6 w-6 text-muted-foreground" />
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

function VolumeTile({ label, paise, accent }: { label: string; paise: number; accent: "sky" | "emerald" }) {
  const colorMap = {
    sky: "border-sky-500/30 bg-sky-500/5 text-sky-600",
    emerald: "border-emerald-500/30 bg-emerald-500/5 text-emerald-600",
  };
  return (
    <div className={cn("rounded-lg border p-4 text-center", colorMap[accent])}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{formatINR(Math.round(paise / 100))}</p>
    </div>
  );
}

/* =============================================================================
   STACKED AREA + FORECAST — interactive SVG with tooltips + linear projection
   ============================================================================= */
function StackedAreaWithForecast({ days }: { days: Day[] }) {
  const W = 720;
  const H = 240;
  const PAD_L = 48;
  const PAD_R = 12;
  const PAD_T = 12;
  const PAD_B = 26;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const max = Math.max(1, ...days.map((d) => d.revenuePaise));
  const n = days.length;
  const xFor = (i: number) => PAD_L + (i / Math.max(1, n - 1)) * innerW;
  const yFor = (v: number) => PAD_T + innerH - (v / max) * innerH;

  // Stack values bottom-up
  const stacked = days.map((d) => {
    const bank = d.bankPaise;
    const withdraw = d.withdrawPaise;
    const platform = d.platformFeePaise;
    return {
      yBank: bank,
      yWithdraw: bank + withdraw,
      yPlatform: bank + withdraw + platform,
    };
  });

  const layerData: { key: keyof typeof SOURCE_COLORS; vals: number[] }[] = [
    { key: "bank",        vals: stacked.map((s) => s.yBank) },
    { key: "withdraw",    vals: stacked.map((s) => s.yWithdraw) },
    { key: "platformFee", vals: stacked.map((s) => s.yPlatform) },
  ];
  const lowerFor = (i: number, keyIndex: number): number => {
    if (keyIndex === 0) return 0;
    if (keyIndex === 1) return stacked[i].yBank;
    return stacked[i].yWithdraw;
  };

  // Linear regression on revenuePaise for forecast (next 7 days)
  const last7 = days.slice(-7).map((d) => d.revenuePaise);
  const slope = last7.length >= 2
    ? (last7[last7.length - 1] - last7[0]) / (last7.length - 1)
    : 0;
  const lastVal = last7[last7.length - 1] ?? 0;
  const forecastDays = 7;
  const forecastVals = Array.from({ length: forecastDays }, (_, i) => Math.max(0, lastVal + slope * (i + 1)));

  // Build forecast area path (over the original x range, extended)
  const forecastX = (i: number) => xFor(n - 1) + ((i + 1) / forecastDays) * (innerW / 3);
  const forecastPath = forecastVals.map((v, i) => `${i === 0 ? "M" : "L"}${forecastX(i)},${yFor(v)}`).join(" ");

  // Tooltip
  const [hover, setHover] = React.useState<{ i: number; x: number; y: number } | null>(null);
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = (e.clientX - rect.left) / rect.width;
    const xSvg = xPct * W;
    if (xSvg < PAD_L || xSvg > W - PAD_R) {
      setHover(null);
      return;
    }
    const i = Math.round(((xSvg - PAD_L) / innerW) * (n - 1));
    if (i < 0 || i >= n) { setHover(null); return; }
    setHover({ i, x: xSvg, y: yFor(days[i].revenuePaise) });
  };

  const ticks = 4;
  const tickValues = Array.from({ length: ticks + 1 }, (_, i) => (max * (ticks - i)) / ticks);

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-60 w-full"
        preserveAspectRatio="none"
        aria-label="Revenue stacked area chart with 7-day forecast"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          {(["bank", "withdraw", "platformFee"] as const).map((k) => (
            <linearGradient id={`grad-${k}`} key={k} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SOURCE_COLORS[k]} stopOpacity="0.5" />
              <stop offset="100%" stopColor={SOURCE_COLORS[k]} stopOpacity="0.05" />
            </linearGradient>
          ))}
          <pattern id="diagonalHatch" patternUnits="userSpaceOnUse" width="6" height="6">
            <path d="M-2,2 l4,-4 M0,6 l6,-6 M4,8 l4,-4" stroke="currentColor" strokeOpacity="0.15" strokeWidth="0.7" />
          </pattern>
        </defs>

        {/* Grid */}
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

        {/* Forecast background (hatched region) */}
        <rect
          x={xFor(n - 1) + 2}
          y={PAD_T}
          width={innerW / 3}
          height={innerH}
          fill="url(#diagonalHatch)"
        />
        <line
          x1={xFor(n - 1) + 2}
          x2={xFor(n - 1) + 2}
          y1={PAD_T}
          y2={PAD_T + innerH}
          stroke="currentColor"
          strokeOpacity="0.18"
          strokeDasharray="3 3"
        />
        <text
          x={xFor(n - 1) + 10}
          y={PAD_T + 12}
          className="fill-muted-foreground"
          style={{ fontSize: 9 }}
        >
          Forecast (7d)
        </text>

        {/* Stacked layers */}
        {layerData.map((layer, li) => {
          const path = areaPath(n, xFor, (i) => yFor(layer.vals[i]), (i) => yFor(lowerFor(i, li)));
          return (
            <path
              key={layer.key}
              d={path}
              fill={`url(#grad-${layer.key})`}
              stroke={SOURCE_COLORS[layer.key]}
              strokeWidth={1.6}
              className="area-layer"
              style={{ animationDelay: `${li * 100}ms` }}
            />
          );
        })}

        {/* Forecast line */}
        <path
          d={forecastPath}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.45"
          strokeWidth="1.5"
          strokeDasharray="4 4"
          className="forecast-line"
        />

        {/* Hover vertical guide + dot */}
        {hover && (
          <g pointerEvents="none">
            <line x1={hover.x} x2={hover.x} y1={PAD_T} y2={PAD_T + innerH} stroke="currentColor" strokeOpacity="0.18" />
            <circle
              cx={hover.x}
              cy={yFor(days[hover.i].revenuePaise)}
              r="4"
              fill="#fff"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <circle
              cx={hover.x}
              cy={yFor(days[hover.i].revenuePaise)}
              r="2.5"
              fill="currentColor"
            />
          </g>
        )}

        {/* X-axis labels (every 5 days) */}
        {days.map((d, i) =>
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

      {/* Tooltip (HTML overlay for crisp typography) */}
      {hover && (
        <div
          className="pointer-events-none absolute z-10 min-w-[180px] -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-2.5 py-2 text-[11px] text-popover-foreground shadow-md"
          style={{ left: `${(hover.x / W) * 100}%`, top: `${(hover.y / H) * 100}%` }}
        >
          <p className="font-mono text-[10px] text-muted-foreground">{days[hover.i].day}</p>
          <p className="mt-0.5 font-display text-sm font-bold">{formatINR(Math.round(days[hover.i].revenuePaise / 100))}</p>
          <div className="mt-1 space-y-0.5 text-[10px]">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: SOURCE_COLORS.platformFee }} />
                Contract
              </span>
              <span className="tabular-nums">{formatINR(Math.round(days[hover.i].platformFeePaise / 100))}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: SOURCE_COLORS.withdraw }} />
                Withdraw
              </span>
              <span className="tabular-nums">{formatINR(Math.round(days[hover.i].withdrawPaise / 100))}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: SOURCE_COLORS.bank }} />
                Bank
              </span>
              <span className="tabular-nums">{formatINR(Math.round(days[hover.i].bankPaise / 100))}</span>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .area-layer { transform-origin: center bottom; animation: areaGrow 0.9s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .forecast-line { stroke-dasharray: 6 6; animation: dashSlide 1.4s linear infinite; }
        @keyframes areaGrow { 0% { opacity: 0; transform: translateY(6px) scaleY(0.5); } 100% { opacity: 1; transform: translateY(0) scaleY(1); } }
        @keyframes dashSlide { to { stroke-dashoffset: -24; } }
      `}</style>
    </div>
  );
}

function areaPath(
  n: number,
  xFor: (i: number) => number,
  yTop: (i: number) => number,
  yBot: (i: number) => number,
): string {
  if (n === 0) return "";
  const topPts: string[] = [];
  const botPts: string[] = [];
  for (let i = 0; i < n; i++) {
    const x = xFor(i);
    topPts.push(`${i === 0 ? "M" : "L"}${x},${yTop(i)}`);
    botPts.push(`L${xFor(n - 1 - i)},${yBot(n - 1 - i)}`);
  }
  return [...topPts, ...botPts, "Z"].join(" ");
}

/* =============================================================================
   DAY-OF-WEEK HEATMAP — when in the week does revenue happen?
   ============================================================================= */
function DayOfWeekHeatmap({ days }: { days: Day[] }) {
  // Group by day-of-week
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const buckets: Record<number, { paise: number; count: number; best: number; bestDay: string }> = {};
  for (const d of days) {
    const day = new Date(d.day + "T00:00:00").getDay();
    if (!buckets[day]) buckets[day] = { paise: 0, count: 0, best: 0, bestDay: d.day };
    buckets[day].paise += d.revenuePaise;
    buckets[day].count += 1;
    if (d.revenuePaise > buckets[day].best) {
      buckets[day].best = d.revenuePaise;
      buckets[day].bestDay = d.day;
    }
  }
  const maxP = Math.max(1, ...Object.values(buckets).map((b) => b.paise));
  const totalPaise = Object.values(buckets).reduce((s, b) => s + b.paise, 0);

  return (
    <div className="space-y-1.5">
      {dow.map((label, i) => {
        const b = buckets[i] ?? { paise: 0, count: 0, best: 0, bestDay: "" };
        const intensity = b.paise / maxP;
        const share = totalPaise > 0 ? (b.paise / totalPaise) * 100 : 0;
        return (
          <div
            key={label}
            className="group flex items-center gap-3 rounded-md border bg-muted/20 p-2 transition-colors hover:bg-muted/40"
            title={`${label}: ${formatINR(Math.round(b.paise / 100))} total across ${b.count} days. Best single day: ${b.bestDay} (${formatINR(Math.round(b.best / 100))})`}
          >
            <span className="w-10 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <div
                  className="h-6 flex-1 overflow-hidden rounded-sm ring-1 ring-emerald-500/20 heatmap-cell"
                  style={{
                    background: `linear-gradient(90deg, rgba(16, 185, 129, ${Math.max(0.08, intensity)}) 0%, rgba(16, 185, 129, ${Math.max(0.04, intensity * 0.6)}) 100%)`,
                    width: `${Math.max(intensity * 100, 2)}%`,
                  }}
                />
                <span className="w-16 shrink-0 text-right text-[11px] font-semibold tabular-nums">{formatINR(Math.round(b.paise / 100))}</span>
                <span className="w-12 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">{share.toFixed(0)}%</span>
              </div>
            </div>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
        );
      })}
      <style jsx>{`
        .heatmap-cell { animation: heatPulse 2.4s ease-in-out both; }
        @keyframes heatPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
          50% { box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15); }
        }
      `}</style>
    </div>
  );
}

/* =============================================================================
   LIVE TICKER — recent revenue events, animated
   ============================================================================= */
function LiveTickerView({ items }: { items: LiveTicker[] }) {
  if (items.length === 0) {
    return <p className="py-8 text-center text-xs text-muted-foreground">No recent revenue events.</p>;
  }
  return (
    <ol className="relative space-y-1.5">
      {items.map((it, i) => {
        const isContract = it.kind === "contract_completion";
        const dotColor = isContract ? "bg-emerald-500" : it.kind === "withdraw_penalty" ? "bg-amber-500" : "bg-purple-500";
        return (
          <li
            key={`${it.at}-${i}-${it.kind}`}
            className="ticker-item group flex items-center gap-2 rounded-md border bg-background/40 p-2 text-[11px] transition-colors hover:bg-muted/40"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <span className={cn("h-2 w-2 shrink-0 rounded-full ring-2 ring-background ticker-dot", dotColor)} />
            <span className="font-mono text-[10px] text-muted-foreground shrink-0">{timeAgo(it.at)}</span>
            <span className="flex-1 truncate text-foreground">{labelKind(it.kind)}</span>
            <span className="shrink-0 font-display text-sm font-bold tabular-nums">+{formatINR(Math.round(it.amount / 100))}</span>
          </li>
        );
      })}
      <style jsx>{`
        .ticker-item { animation: slideIn 0.4s ease-out both; }
        .ticker-dot  { animation: dotPulse 1.6s ease-in-out infinite; }
        @keyframes slideIn { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes dotPulse { 0%, 100% { box-shadow: 0 0 0 0 currentColor; opacity: 1; } 50% { box-shadow: 0 0 0 3px currentColor; opacity: 0.6; } }
      `}</style>
    </ol>
  );
}

function labelKind(k: string): string {
  switch (k) {
    case "contract_completion": return "Contract fee";
    case "withdraw_penalty": return "Withdrawal penalty";
    case "bank_verification": return "Bank verification";
    case "failed_payout_reversal": return "Failed payout reversal";
    default: return k;
  }
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "now";
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 86_400_000)}d`;
}

/* =============================================================================
   CATEGORY DONUT — animated, with centre label
   ============================================================================= */
function CategoryDonut({ data }: { data: CategoryRow[] }) {
  const total = data.reduce((s, r) => s + r.revenuePaise, 0);
  if (total === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No revenue yet.</p>;
  }
  const R = 76;
  const r = 50;
  const cx = 96;
  const cy = 96;
  let cursor = 0;
  const slices = data.map((d, i) => {
    const frac = d.revenuePaise / total;
    const startA = cursor * 2 * Math.PI;
    const endA = (cursor + frac) * 2 * Math.PI;
    cursor += frac;
    const large = endA - startA > Math.PI ? 1 : 0;
    const x1 = cx + R * Math.cos(startA - Math.PI / 2);
    const y1 = cy + R * Math.sin(startA - Math.PI / 2);
    const x2 = cx + R * Math.cos(endA - Math.PI / 2);
    const y2 = cy + R * Math.sin(endA - Math.PI / 2);
    const xi1 = cx + r * Math.cos(startA - Math.PI / 2);
    const yi1 = cy + r * Math.sin(startA - Math.PI / 2);
    const xi2 = cx + r * Math.cos(endA - Math.PI / 2);
    const yi2 = cy + r * Math.sin(endA - Math.PI / 2);
    const path = `M${x1},${y1} A${R},${R} 0 ${large} 1 ${x2},${y2} L${xi2},${yi2} A${r},${r} 0 ${large} 0 ${xi1},${yi1} Z`;
    const color = CATEGORY_PALETTE[i % CATEGORY_PALETTE.length];
    return { name: d.name, count: d.count, paise: d.revenuePaise, color, path, frac };
  });

  return (
    <div className="flex w-full flex-col items-stretch gap-3">
      <div className="flex justify-center">
        <svg viewBox="0 0 192 192" className="h-44 w-44" aria-label="Revenue by category donut">
          {slices.map((s) => (
            <path key={s.name} d={s.path} fill={s.color} className="donut-slice" />
          ))}
          <text x={cx} y={cy - 6} textAnchor="middle" className="fill-foreground" style={{ fontSize: 12, fontWeight: 700 }}>
            {formatINR(Math.round(total / 100))}
          </text>
          <text x={cx} y={cy + 10} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 9 }}>
            lifetime fees
          </text>
          <text x={cx} y={cy + 24} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 8 }}>
            {slices.length} categor{slices.length === 1 ? "y" : "ies"}
          </text>
        </svg>
      </div>
      <ul className="w-full space-y-1 text-xs">
        {slices.slice(0, 6).map((s) => (
          <li
            key={s.name}
            className="flex w-full min-w-0 items-center justify-between gap-2 rounded px-1 py-0.5 hover:bg-muted/30"
            title={`${s.name} · ${formatINR(Math.round(s.paise / 100))} · ${s.count} contract${s.count === 1 ? "" : "s"}`}
          >
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
              <span className="truncate">{s.name}</span>
            </span>
            <span className="shrink-0 whitespace-nowrap tabular-nums text-muted-foreground">
              {formatINR(Math.round(s.paise / 100))} <span className="text-[10px] opacity-70">({(s.frac * 100).toFixed(0)}%)</span>
            </span>
          </li>
        ))}
      </ul>
      <style jsx>{`
        .donut-slice {
          transform-origin: 96px 96px;
          animation: donutGrow 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes donutGrow { 0% { transform: scale(0.6); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>
  );
}

/* =============================================================================
   SOURCE BARS — animated horizontal bars with % change indicators
   ============================================================================= */
function SourceBars({ rows }: { rows: { label: string; paise: number; color: string; icon: React.ComponentType<{ className?: string }> }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.paise));
  const total = rows.reduce((s, r) => s + r.paise, 0);
  return (
    <div className="space-y-3">
      {rows.map((r, i) => {
        const pctVal = (r.paise / max) * 100;
        const share = total > 0 ? (r.paise / total) * 100 : 0;
        return (
          <div
            key={r.label}
            className="space-y-1 rounded-md p-1.5 transition-colors hover:bg-muted/30"
            title={`${r.label}: ${formatINR(Math.round(r.paise / 100))} (${share.toFixed(1)}% of total)`}
          >
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground">
                <r.icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{r.label}</span>
              </span>
              <span className="shrink-0 whitespace-nowrap tabular-nums">
                <span className="font-medium">{formatINR(Math.round(r.paise / 100))}</span>
                <span className="ml-1 text-[10px] text-muted-foreground">({share.toFixed(0)}%)</span>
              </span>
            </div>
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted/40">
              <div
                className="bar-fill h-full rounded-full"
                style={{
                  width: `${pctVal}%`,
                  background: `linear-gradient(90deg, ${r.color} 0%, ${r.color}cc 100%)`,
                  animationDelay: `${i * 120}ms`,
                }}
              />
            </div>
          </div>
        );
      })}
      <style jsx>{`
        .bar-fill { transform-origin: left center; animation: barGrow 0.8s cubic-bezier(0.22, 1, 0.36, 1) both; }
        @keyframes barGrow { 0% { transform: scaleX(0); } 100% { transform: scaleX(1); } }
      `}</style>
    </div>
  );
}

/* =============================================================================
   REVENUE FUNNEL — escrow → platform fee → withdraw fees (a chain)
   ============================================================================= */
function RevenueFunnel({
  escrowLifetimePaise,
  platformFeeLifetimePaise,
  contractCount,
}: {
  escrowLifetimePaise: number;
  platformFeeLifetimePaise: number;
  contractCount: number;
}) {
  const steps: { label: string; value: number; tone: string }[] = [
    { label: "Escrow volume (lifetime)", value: escrowLifetimePaise, tone: "from-sky-500/20 to-sky-500/5 border-sky-500/30 text-sky-700" },
    { label: "Platform fees (lifetime)", value: platformFeeLifetimePaise, tone: "from-emerald-500/20 to-emerald-500/5 border-emerald-500/30 text-emerald-700" },
  ];
  const retention = escrowLifetimePaise > 0 ? (platformFeeLifetimePaise / escrowLifetimePaise) * 100 : 0;

  return (
    <div className="space-y-2.5">
      {steps.map((s, i) => {
        const widthPct = escrowLifetimePaise > 0 ? (s.value / escrowLifetimePaise) * 100 : 0;
        return (
          <div key={s.label} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">{s.label}</span>
              <span className="font-semibold tabular-nums">{formatINR(Math.round(s.value / 100))}</span>
            </div>
            <div className={cn("h-9 overflow-hidden rounded-md border bg-gradient-to-r p-2", s.tone)}>
              <div
                className="funnel-bar h-full rounded-sm"
                style={{
                  width: `${Math.max(widthPct, 4)}%`,
                  background: "currentColor",
                  opacity: 0.18,
                  animationDelay: `${i * 150}ms`,
                }}
              />
            </div>
            {i === 0 && contractCount > 0 && (
              <p className="text-[10px] text-muted-foreground">From {contractCount} completed contract{contractCount === 1 ? "" : "s"}</p>
            )}
          </div>
        );
      })}
      <div className="mt-3 flex items-center justify-between rounded-md border bg-amber-500/5 px-3 py-2 text-[11px]">
        <span className="inline-flex items-center gap-1.5 text-amber-700">
          <Target className="h-3.5 w-3.5" />
          Take rate
        </span>
        <span className="font-display font-semibold tabular-nums text-amber-700">
          {retention.toFixed(1)}%
        </span>
      </div>
      <style jsx>{`
        .funnel-bar { transform-origin: left center; animation: funnelFill 0.9s cubic-bezier(0.22, 1, 0.36, 1) both; }
        @keyframes funnelFill { 0% { transform: scaleX(0); } 100% { transform: scaleX(1); } }
      `}</style>
    </div>
  );
}

/* =============================================================================
   COMPLETED CONTRACTS TABLE — with sortable headers + progress bars
   ============================================================================= */
function CompletedContractsTable({ rows }: { rows: ContractRow[] }) {
  const [sort, setSort] = React.useState<"date" | "value" | "fee">("date");
  const sorted = React.useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      if (sort === "date") return new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
      if (sort === "value") return b.agreedPricePaise - a.agreedPricePaise;
      return b.feePaise - a.feePaise;
    });
    return arr;
  }, [rows, sort]);

  const maxFee = Math.max(1, ...rows.map((r) => r.feePaise));

  return (
    <div className="overflow-x-auto">
      <div className="mb-2 flex items-center gap-1 text-[10px]">
        <span className="text-muted-foreground">Sort by:</span>
        {(["date", "value", "fee"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setSort(k)}
            className={cn(
              "rounded px-1.5 py-0.5 transition-colors",
              sort === k ? "bg-primary/15 text-primary font-medium" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {k === "date" ? "Date" : k === "value" ? "Value" : "Fee"}
          </button>
        ))}
      </div>
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="pb-2 pr-3 font-medium">Task</th>
            <th className="pb-2 pr-3 font-medium">Category</th>
            <th className="pb-2 pr-3 font-medium text-right">Contract value</th>
            <th className="pb-2 pr-3 font-medium">Fee share</th>
            <th className="pb-2 font-medium text-right">Platform fee</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => {
            const share = (c.feePaise / maxFee) * 100;
            return (
              <tr key={c.contractId} className="row-pop border-b last:border-0 hover:bg-muted/20">
                <td className="py-2 pr-3 max-w-[200px] truncate" title={c.taskName}>{c.taskName}</td>
                <td className="py-2 pr-3 text-muted-foreground">{c.categoryName}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatINR(Math.round(c.agreedPricePaise / 100))}</td>
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted/50">
                      <div className="fee-bar h-full rounded-full bg-emerald-500" style={{ width: `${share}%` }} />
                    </div>
                  </div>
                </td>
                <td className="py-2 text-right font-semibold tabular-nums">{formatINR(Math.round(c.feePaise / 100))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <style jsx>{`
        .row-pop { transition: background-color 0.18s ease; }
        .fee-bar { transform-origin: left center; animation: feeFill 0.7s ease-out both; }
        @keyframes feeFill { 0% { transform: scaleX(0); } 100% { transform: scaleX(1); } }
      `}</style>
    </div>
  );
}
