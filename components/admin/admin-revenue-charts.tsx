"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, PieChart, BarChart3, IndianRupee, Wallet, CreditCard, Briefcase, Receipt, ArrowUpRight } from "lucide-react";
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

type Props = {
  days: Day[];
  byCategory: CategoryRow[];
  totalRevenue30dPaise: number;
  totals: {
    total30dPaise: number;
    platformFee30dPaise: number;
    withdrawFee30dPaise: number;
    bankFee30dPaise: number;
    escrowFee30dPaise: number;
    lifetimeEscrowPaise: number;
    lifetimeCompletedContractCount: number;
  };
  completedContractsList: ContractRow[];
};

const SOURCE_COLORS = {
  platformFee: "#10b981",
  withdraw: "#f59e0b",
  bank: "#a855f7",
  escrow: "#0ea5e9",
} as const;

const CATEGORY_PALETTE = [
  "#0ea5e9", "#10b981", "#f59e0b", "#a855f7", "#ec4899", "#14b8a6", "#f97316", "#6366f1",
];

export function AdminRevenueCharts({ days, byCategory, totals, totalRevenue30dPaise, completedContractsList }: Props) {
  const router = useRouter();
  const hasAnyRevenue = totalRevenue30dPaise > 0;

  React.useEffect(() => {
    const sb = createClient();
    const channel = sb.channel("admin-revenue-sync");

    channel.on("postgres_changes", { event: "*", schema: "public", table: "workspaces" }, () => router.refresh());
    channel.on("postgres_changes", { event: "*", schema: "public", table: "wallet_transactions" }, () => router.refresh());
    channel.on("postgres_changes", { event: "*", schema: "public", table: "verifications", filter: `doc_type=eq.bank` }, () => router.refresh());
    channel.subscribe();

    return () => { sb.removeChannel(channel); };
  }, [router]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiTile
          icon={IndianRupee}
          label="Total revenue · 30d"
          value={formatINR(Math.round(totalRevenue30dPaise / 100))}
          sub={hasAnyRevenue ? "platform fees + penalties + bank verif" : "no revenue yet"}
          accent="primary"
        />
        <KpiTile
          icon={Briefcase}
          label="Contract platform fees"
          value={formatINR(Math.round(totals.platformFee30dPaise / 100))}
          sub={totals.lifetimeCompletedContractCount > 0
            ? `from ${totals.lifetimeCompletedContractCount} completed contract${totals.lifetimeCompletedContractCount === 1 ? "" : "s"}`
            : "no completed contracts yet"}
          accent="emerald"
        />
        <KpiTile
          icon={Wallet}
          label="Withdrawal penalties"
          value={formatINR(Math.round(totals.withdrawFee30dPaise / 100))}
          sub="real penalty_paise from wallet_transactions"
          accent="amber"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHeader className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-success" />
                <CardTitle>Revenue · last 30 days</CardTitle>
              </div>
              <span className="text-xs text-muted-foreground">All sources</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px]">
              <LegendDot color={SOURCE_COLORS.platformFee} label="Contract fees" />
              <LegendDot color={SOURCE_COLORS.withdraw} label="Withdraw penalties" />
              <LegendDot color={SOURCE_COLORS.bank} label="Bank verif" />
            </div>
            <CardDescription>
              Only revenue sources: contract platform fees, withdrawal penalties, bank verification revenue. Escrow volume is shown separately below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {hasAnyRevenue ? (
              <StackedArea days={days} />
            ) : (
              <EmptyState message="No revenue recorded in the last 30 days. Once contracts complete and wallets are funded, daily revenue will appear here." />
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
              Lifetime platform fees from <span className="font-medium text-foreground">{totals.lifetimeCompletedContractCount}</span> completed contract{totals.lifetimeCompletedContractCount === 1 ? "" : "s"}.
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

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-info" />
            <CardTitle>Source totals · last 30 days</CardTitle>
          </div>
          <CardDescription>Per-source breakdown. All values come from real database rows.</CardDescription>
        </CardHeader>
        <CardContent>
          <SourceBars
            rows={[
              { label: "Contract platform fees", paise: totals.platformFee30dPaise, color: SOURCE_COLORS.platformFee, icon: Briefcase },
              { label: "Withdrawal penalties", paise: totals.withdrawFee30dPaise, color: SOURCE_COLORS.withdraw, icon: Wallet },
              { label: "Bank verification", paise: totals.bankFee30dPaise, color: SOURCE_COLORS.bank, icon: CreditCard },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-sky-500" />
            <CardTitle>Escrow volume</CardTitle>
          </div>
          <CardDescription>
            Gross amount moved through escrow (total contract value, not revenue).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border bg-sky-500/5 p-4 text-center">
            <p className="text-[11px] uppercase text-muted-foreground">Escrow volume · last 30d</p>
            <p className="mt-1 font-display text-2xl font-semibold text-sky-600">{formatINR(Math.round(totals.escrowFee30dPaise / 100))}</p>
          </div>
          <div className="rounded-lg border bg-sky-500/5 p-4 text-center">
            <p className="text-[11px] uppercase text-muted-foreground">Escrow volume · lifetime</p>
            <p className="mt-1 font-display text-2xl font-semibold text-sky-600">{formatINR(Math.round(totals.lifetimeEscrowPaise / 100))}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ArrowUpRight className="h-5 w-5 text-primary" />
            <CardTitle>Recent completed contracts</CardTitle>
          </div>
          <CardDescription>
            Last completed contracts with platform fees. Shows the task name, category, contract value, and the platform fee earned.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {completedContractsList.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="pb-2 pr-3 font-medium">Task</th>
                    <th className="pb-2 pr-3 font-medium">Category</th>
                    <th className="pb-2 pr-3 font-medium text-right">Contract value</th>
                    <th className="pb-2 font-medium text-right">Platform fee</th>
                  </tr>
                </thead>
                <tbody>
                  {completedContractsList.map((c) => (
                    <tr key={c.contractId} className="border-b last:border-0">
                      <td className="py-2 pr-3 max-w-[200px] truncate" title={c.taskName}>{c.taskName}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{c.categoryName}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{formatINR(Math.round(c.agreedPricePaise / 100))}</td>
                      <td className="py-2 text-right tabular-nums font-medium">{formatINR(Math.round(c.feePaise / 100))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState message="No completed contracts yet." />
          )}
        </CardContent>
      </Card>
    </div>
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

function KpiTile({
  icon: Icon, label, value, sub, accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  accent?: "primary" | "emerald" | "amber" | "sky" | "purple";
}) {
  const accentMap: Record<string, string> = {
    primary: "from-primary/15 to-primary/5 text-primary",
    emerald: "from-emerald-500/15 to-emerald-500/5 text-emerald-600",
    amber: "from-amber-500/15 to-amber-500/5 text-amber-600",
    sky: "from-sky-500/15 to-sky-500/5 text-sky-600",
    purple: "from-purple-500/15 to-purple-500/5 text-purple-600",
  };
  return (
    <Card className={cn("relative overflow-hidden bg-gradient-to-br", accentMap[accent ?? "primary"])}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase text-muted-foreground">{label}</span>
          <Icon className="h-4 w-4" />
        </div>
        <div className="mt-2 font-display text-2xl font-semibold tabular-nums">{value}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
        <div className="pointer-events-none absolute -bottom-4 -right-4 h-16 w-16 rounded-full bg-current opacity-[0.04] blur-2xl" />
      </CardContent>
    </Card>
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

/* =============================================================================
   StackedArea — animated SVG stacked area chart (last 30 days)
   Only actual revenue sources: platformFee, withdraw, bank.
   ============================================================================= */
function StackedArea({ days }: { days: Day[] }) {
  const W = 720;
  const H = 220;
  const PAD_L = 44;
  const PAD_R = 8;
  const PAD_T = 8;
  const PAD_B = 20;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const max = Math.max(1, ...days.map((d) => d.revenuePaise));
  const xFor = (i: number) => PAD_L + (i / Math.max(1, days.length - 1)) * innerW;
  const yFor = (v: number) => PAD_T + innerH - (v / max) * innerH;

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

  const yTicks = 4;
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => (max * (yTicks - i)) / yTicks);

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-56 w-full" preserveAspectRatio="none" aria-label="Revenue area chart">
        <defs>
          {(["bank", "withdraw", "platformFee"] as const).map((k) => (
            <linearGradient id={`grad-${k}`} key={k} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SOURCE_COLORS[k]} stopOpacity="0.45" />
              <stop offset="100%" stopColor={SOURCE_COLORS[k]} stopOpacity="0.05" />
            </linearGradient>
          ))}
        </defs>

        {ticks.map((t, i) => {
          const y = yFor(t);
          return (
            <g key={i}>
              <line x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} stroke="currentColor" strokeOpacity="0.08" />
              <text x={PAD_L - 6} y={y + 3} textAnchor="end" className="fill-muted-foreground" style={{ fontSize: 9 }}>
                ₹{Math.round(t / 100)}
              </text>
            </g>
          );
        })}

        {layerData.map((layer, li) => {
          const path = areaPath(days.length, xFor, (i) => yFor(layer.vals[i]), (i) => yFor(lowerFor(i, li)));
          return (
            <path
              key={layer.key}
              d={path}
              fill={`url(#grad-${layer.key})`}
              stroke={SOURCE_COLORS[layer.key]}
              strokeWidth={1.5}
              className="chart-area-reveal"
              style={{ animationDelay: `${li * 120}ms` }}
            />
          );
        })}

        {days.map((d, i) =>
          i === 0 || i === Math.floor(days.length / 2) || i === days.length - 1 ? (
            <text
              key={d.day}
              x={xFor(i)}
              y={H - 4}
              textAnchor="middle"
              className="fill-muted-foreground"
              style={{ fontSize: 9 }}
            >
              {d.day.slice(5)}
            </text>
          ) : null
        )}
      </svg>
      <style jsx>{`
        .chart-area-reveal {
          transform-origin: center bottom;
          animation: chartGrow 0.9s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes chartGrow {
          0%   { opacity: 0; transform: translateY(8px) scaleY(0.4); }
          100% { opacity: 1; transform: translateY(0)   scaleY(1);   }
        }
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

function CategoryDonut({ data }: { data: CategoryRow[] }) {
  const total = data.reduce((s, r) => s + r.revenuePaise, 0);
  if (total === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No revenue yet.</p>;
  }
  const R = 70;
  const r = 48;
  const cx = 90;
  const cy = 90;
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
        <svg viewBox="0 0 180 180" className="h-40 w-40" aria-label="Revenue by category">
          {slices.map((s) => (
            <path
              key={s.name}
              d={s.path}
              fill={s.color}
              className="donut-slice"
            />
          ))}
          <text x={cx} y={cy - 4} textAnchor="middle" className="fill-foreground" style={{ fontSize: 11, fontWeight: 600 }}>
            {formatINR(Math.round(total / 100))}
          </text>
          <text x={cx} y={cy + 12} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 9 }}>
            lifetime fees
          </text>
        </svg>
      </div>
      <ul className="w-full space-y-1 text-xs">
        {slices.map((s) => (
          <li
            key={s.name}
            className="flex w-full min-w-0 items-center justify-between gap-2"
            title={`${s.name} · ${formatINR(Math.round(s.paise / 100))} · ${s.count} contract${s.count === 1 ? "" : "s"}`}
          >
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
              <span className="truncate">{s.name}</span>
            </span>
            <span className="shrink-0 whitespace-nowrap tabular-nums text-muted-foreground">
              {formatINR(Math.round(s.paise / 100))}
            </span>
          </li>
        ))}
      </ul>
      <style jsx>{`
        .donut-slice {
          transform-origin: 90px 90px;
          animation: donutGrow 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes donutGrow {
          0%   { transform: scale(0.6); opacity: 0; }
          100% { transform: scale(1);   opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function SourceBars({ rows }: { rows: { label: string; paise: number; color: string; icon: React.ComponentType<{ className?: string }> }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.paise));
  return (
    <div className="space-y-3">
      {rows.map((r, i) => {
        const pctVal = (r.paise / max) * 100;
        return (
          <div key={r.label} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground">
                <r.icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{r.label}</span>
              </span>
              <span className="shrink-0 whitespace-nowrap tabular-nums font-medium">{formatINR(Math.round(r.paise / 100))}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted/50">
              <div
                className="bar-fill h-full rounded-full"
                style={{
                  width: `${pctVal}%`,
                  background: r.color,
                  animationDelay: `${i * 120}ms`,
                }}
              />
            </div>
          </div>
        );
      })}
      <style jsx>{`
        .bar-fill {
          transform-origin: left center;
          animation: barGrow 0.8s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes barGrow {
          0%   { transform: scaleX(0); }
          100% { transform: scaleX(1); }
        }
      `}</style>
    </div>
  );
}
