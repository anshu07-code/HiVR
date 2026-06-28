"use client";

import * as React from "react";
import Link from "next/link";
import {
  Award, ArrowUpRight, Sparkles, Star, TrendingUp, Trophy, Crown,
  Zap, CheckCircle2, X, Loader2, Clock, Gift, ShoppingBag, BadgeCheck,
  BarChart3, History, Briefcase, Calendar,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, timeAgo } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

type LedgerRow = {
  id: string;
  change_amount: number;
  reason: string;
  related_contract_id: string | null;
  created_at: string;
};

const REWARD_CATALOG = [
  {
    id: "boost_24h",
    name: "Profile boost · 24h",
    description: "Appear at the top of Find People for 24 hours. Get 3× more profile views.",
    cost: 200,
    Icon: TrendingUp,
    tier: "popular",
    color: "text-sky-600 bg-sky-500/10",
  },
  {
    id: "boost_7d",
    name: "Profile boost · 7 days",
    description: "Top-of-feed placement for a full week.",
    cost: 1000,
    Icon: Sparkles,
    tier: "best value",
    color: "text-violet-600 bg-violet-500/10",
  },
  {
    id: "fee_discount_5",
    name: "5% platform-fee discount",
    description: "Apply to your next 3 contracts. HiVR fee drops from 20% to 15%.",
    cost: 500,
    Icon: BadgeCheck,
    tier: "save money",
    color: "text-emerald-600 bg-emerald-500/10",
  },
  {
    id: "fee_discount_15",
    name: "15% platform-fee discount",
    description: "Apply to your next 5 contracts. HiVR fee drops from 20% to 5%.",
    cost: 1500,
    Icon: BadgeCheck,
    tier: "save money",
    color: "text-emerald-600 bg-emerald-500/10",
  },
  {
    id: "instant_match",
    name: "Instant Hire priority",
    description: "Show up first in Smart Match for 30 days.",
    cost: 800,
    Icon: Zap,
    tier: "fast track",
    color: "text-amber-600 bg-amber-500/10",
  },
  {
    id: "tier_boost",
    name: "Top-Rated trust badge",
    description: "Skip the Track-Record tier. Show 'Top-Rated' on your public profile for 90 days.",
    cost: 3000,
    Icon: Crown,
    tier: "premium",
    color: "text-rose-600 bg-rose-500/10",
  },
  {
    id: "tier_b_skip",
    name: "Tier B interview skip",
    description: "Skip the Tier B practical test for one category you already have Track-Record in.",
    cost: 5000,
    Icon: Trophy,
    tier: "premium",
    color: "text-amber-600 bg-amber-500/10",
  },
  {
    id: "leaderboard",
    name: "Featured on leaderboard",
    description: "Top of 'Top Earners' leaderboard for 7 days.",
    cost: 600,
    Icon: BarChart3,
    tier: "popular",
    color: "text-sky-600 bg-sky-500/10",
  },
] as const;

const REASON_META: Record<string, { label: string; tone: string; Icon: any }> = {
  contract_completed: { label: "Contract completed", tone: "text-emerald-600", Icon: CheckCircle2 },
  five_star_review:   { label: "5★ review received", tone: "text-amber-600",   Icon: Star },
  repeat_hire:        { label: "Repeat hire bonus",   tone: "text-violet-600",  Icon: TrendingUp },
  tier_bonus:         { label: "Tier bonus",          tone: "text-sky-600",     Icon: Trophy },
  boost_redeemed:     { label: "Boost redeemed",      tone: "text-rose-600",    Icon: Zap },
  fee_discount:       { label: "Fee discount applied", tone: "text-emerald-600", Icon: BadgeCheck },
  admin_adjustment:   { label: "Admin adjustment",    tone: "text-muted-foreground", Icon: Sparkles },
  signup_bonus:       { label: "Signup bonus",        tone: "text-emerald-600", Icon: Gift },
  referral:           { label: "Referral bonus",      tone: "text-violet-600",  Icon: Award },
  tier_upgrade:       { label: "Tier upgrade",        tone: "text-amber-600",   Icon: Crown },
};

export function PointsRewardsView({
  initialBalance, initialLifetime, initialLedger,
}: {
  initialBalance: number;
  initialLifetime: number;
  initialLedger: LedgerRow[];
}) {
  const sbRef = React.useRef<ReturnType<typeof createClient> | null>(null);
  const [balance, setBalance] = React.useState(initialBalance);
  const [lifetime, setLifetime] = React.useState(initialLifetime);
  const [ledger, setLedger] = React.useState<LedgerRow[]>(initialLedger);
  const [redeemingId, setRedeemingId] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<"redeem" | "earn" | "history">("redeem");

  // Realtime
  React.useEffect(() => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const ch = sb
      .channel("points-rewards-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "points_ledger" }, () => refresh())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "loyalty_points" }, () => refresh())
      .subscribe();
    return () => { sb.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    const [{ data: lp }, { data: l }] = await Promise.all([
      sb.from("loyalty_points").select("*").eq("employee_id", user.id).maybeSingle(),
      sb.from("points_ledger").select("id, change_amount, reason, related_contract_id, created_at").eq("employee_id", user.id).order("created_at", { ascending: false }).limit(40),
    ]);
    setBalance((lp as any)?.points_balance ?? 0);
    setLifetime((lp as any)?.lifetime_points_earned ?? 0);
    setLedger((l ?? []) as LedgerRow[]);
  }

  async function redeem(rewardId: string, cost: number) {
    if (balance < cost) {
      setError(`You need ${cost - balance} more points to redeem this.`);
      return;
    }
    setRedeemingId(rewardId);
    setError(null);
    setFeedback(null);
    try {
      const r = await fetch("/api/points/redeem", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ rewardId, cost }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        setError(d?.error ?? "Failed");
        return;
      }
      setFeedback(d.message ?? "Reward redeemed successfully!");
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRedeemingId(null);
    }
  }

  const canAfford = (cost: number) => balance >= cost;
  const monthlyEarnEstimate = Math.round(lifetime * 0.05);

  return (
    <div className="container max-w-5xl space-y-6 py-8">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Points & rewards</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Earn points for great work, spend them on profile boosts and platform-fee discounts.
        </p>
      </div>

      {/* Hero card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-rose-500 text-white shadow-lg">
              <Award className="h-8 w-8" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Your balance</p>
              <p className="mt-0.5 font-display text-4xl font-bold tabular-nums">
                {balance.toLocaleString()} <span className="text-base font-medium text-muted-foreground">pts</span>
              </p>
              <p className="text-[11px] text-muted-foreground">
                Lifetime earned: <strong>{lifetime.toLocaleString()}</strong> pts · Avg. ~{monthlyEarnEstimate}/month
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-md border bg-muted/30 p-2.5">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">Top Earner</p>
                <Crown className="mx-auto mt-1 h-4 w-4 text-amber-500" />
              </div>
              <div className="rounded-md border bg-muted/30 p-2.5">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">Non-cash</p>
                <BadgeCheck className="mx-auto mt-1 h-4 w-4 text-emerald-500" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tab nav */}
      <div className="inline-flex rounded-md border bg-muted/30 p-0.5 text-xs">
        {(["redeem", "earn", "history"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded px-3 py-1.5 font-medium capitalize transition-colors flex items-center gap-1.5",
              tab === t ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t === "redeem" && <ShoppingBag className="h-3.5 w-3.5" />}
            {t === "earn" && <TrendingUp className="h-3.5 w-3.5" />}
            {t === "history" && <History className="h-3.5 w-3.5" />}
            {t}
          </button>
        ))}
      </div>

      {feedback && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />{feedback}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-700">
          <X className="h-4 w-4" />{error}
        </div>
      )}

      {/* Redeem tab */}
      {tab === "redeem" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {REWARD_CATALOG.map((r) => {
            const Icon = r.Icon;
            const affordable = canAfford(r.cost);
            return (
              <Card key={r.id} className={cn(!affordable && "opacity-60")}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className={cn("grid h-9 w-9 place-items-center rounded-md", r.color)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <Badge variant="outline" className="text-[9px] capitalize">{r.tier}</Badge>
                  </div>
                  <CardTitle className="text-sm">{r.name}</CardTitle>
                  <CardDescription className="text-[11px] leading-snug min-h-[2.5em]">
                    {r.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-mono text-lg font-bold tabular-nums">{r.cost.toLocaleString()}</p>
                    <p className="text-[9px] text-muted-foreground">points</p>
                  </div>
                  <Button size="sm" onClick={() => redeem(r.id, r.cost)} disabled={!affordable || redeemingId === r.id}>
                    {redeemingId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : affordable ? "Redeem" : `Need ${r.cost - balance} more`}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Earn tab */}
      {tab === "earn" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">How to earn points</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <EarnRow Icon={CheckCircle2} label="Complete a contract" amount="+50 pts" tone="text-emerald-600" />
              <EarnRow Icon={Star} label="Receive a 5★ review" amount="+20 pts" tone="text-amber-600" />
              <EarnRow Icon={TrendingUp} label="Get a repeat hire" amount="+100 pts" tone="text-violet-600" />
              <EarnRow Icon={Crown} label="Reach Track-Record tier" amount="+500 pts" tone="text-amber-600" />
              <EarnRow Icon={Trophy} label="Reach Top-Rated tier" amount="+2000 pts" tone="text-rose-600" />
              <EarnRow Icon={Gift} label="Refer a friend" amount="+300 pts" tone="text-emerald-600" />
              <EarnRow Icon={Sparkles} label="Signup bonus" amount="+50 pts" tone="text-sky-600" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Important rules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <p>
                <strong className="text-foreground">Non-cash-convertible.</strong> By design, points can&apos;t be withdrawn as money —
                this keeps HiVR a marketplace, not a Prepaid Payment Instrument (which would require RBI licensing in India).
              </p>
              <p>
                <strong className="text-foreground">Use it or lose it.</strong> Points don&apos;t expire but un-redeemed balances over 5,000
                won&apos;t earn new ones until you spend below the cap.
              </p>
              <p>
                <strong className="text-foreground">Stacking.</strong> Multiple rewards can be active at once (e.g. a profile
                boost + a fee discount). Boosts don&apos;t stack with themselves.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* History tab */}
      {tab === "history" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4" />Points history
            </CardTitle>
            <CardDescription>Your most recent 40 transactions.</CardDescription>
          </CardHeader>
          <CardContent>
            {ledger.length === 0 ? (
              <p className="rounded-md border border-dashed bg-muted/20 py-12 text-center text-[11px] text-muted-foreground">
                No points activity yet. Complete a contract to start earning.
              </p>
            ) : (
              <div className="space-y-1">
                {ledger.map((l) => {
                  const meta = REASON_META[l.reason] ?? { label: l.reason.replace(/_/g, " "), tone: "text-muted-foreground", Icon: Sparkles };
                  const Icon = meta.Icon;
                  return (
                    <div key={l.id} className="flex items-center gap-3 rounded-md border bg-background p-2.5 text-xs">
                      <div className={cn("grid h-8 w-8 place-items-center rounded-full bg-muted/40", meta.tone)}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{meta.label}</p>
                        <p className="text-[10px] text-muted-foreground">{timeAgo(l.created_at)}</p>
                      </div>
                      <div className={cn(
                        "font-mono text-sm font-semibold tabular-nums",
                        l.change_amount >= 0 ? "text-emerald-600" : "text-rose-600"
                      )}>
                        {l.change_amount >= 0 ? "+" : ""}{l.change_amount.toLocaleString()}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <p className="rounded-md border bg-muted/20 p-3 text-[11px] text-muted-foreground">
        <strong className="text-foreground">Why no points-to-cash withdrawal?</strong> A points-to-cash wallet would edge
        into India&apos;s Prepaid Payment Instrument regulation (RBI), which requires a fintech-licensed entity. To stay a marketplace,
        not a payment institution, points are redeemable only on-platform.
      </p>
    </div>
  );
}

function EarnRow({ Icon, label, amount, tone }: { Icon: any; label: string; amount: string; tone: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/10 p-2">
      <Icon className={cn("h-3.5 w-3.5", tone)} />
      <span className="flex-1">{label}</span>
      <span className={cn("font-mono text-[11px] font-semibold", tone)}>{amount}</span>
    </div>
  );
}
