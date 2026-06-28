"use client";

import * as React from "react";
import Link from "next/link";
import {
  Wallet, TrendingUp, TrendingDown, Clock, AlertTriangle, ArrowDownToLine,
  IndianRupee, Loader2, CheckCircle2, ArrowUpRight, RefreshCw, Sparkles,
  Calendar, Award, History, ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatPaise, timeAgo, timeUntil } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { TxnPinDialog } from "@/components/payments/txn-pin-dialog";

type Wallet = {
  balance_paise: number;
  lifetime_loaded_paise: number;
  lifetime_spent_paise: number;
  lifetime_received_paise: number;
  is_frozen: boolean;
} | null;

type WithdrawalPenalty = {
  balance_paise: number;
  withdrawals_this_month: number;
  last_withdrawal_at: string | null;
} | null;

type EarningRow = {
  id: string;
  kind: "contract_release" | "tip" | "incentive" | "refund" | "adjustment" | "withdraw";
  amount_paise: number;
  direction: "credit" | "debit";
  description: string;
  contract_id: string | null;
  created_at: string;
};

export function EarningsBreakdown({
  userId, initialEarnings, wallet,
}: {
  userId: string;
  initialEarnings: any;
  wallet: Wallet;
}) {
  const sbRef = React.useRef<ReturnType<typeof createClient> | null>(null);
  const [earnings, setEarnings] = React.useState<any>(initialEarnings);
  const [penalties, setPenalties] = React.useState<WithdrawalPenalty>(null);
  const [history, setHistory] = React.useState<EarningRow[]>([]);
  const [period, setPeriod] = React.useState<"30d" | "90d" | "year" | "all">("30d");
  const [loading, setLoading] = React.useState(false);
  const [withdrawAmount, setWithdrawAmount] = React.useState("");
  const [withdrawing, setWithdrawing] = React.useState(false);
  const [withdrawMsg, setWithdrawMsg] = React.useState<string | null>(null);
  const [showPinDialog, setShowPinDialog] = React.useState(false);
  const [pendingWithdraw, setPendingWithdraw] = React.useState<number | null>(null);
  const [lifetimeEarnings, setLifetimeEarnings] = React.useState(0);
  const [monthEarnings, setMonthEarnings] = React.useState(0);
  const [pendingEscrow, setPendingEscrow] = React.useState(0);

  const load = React.useCallback(async () => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    setLoading(true);

    // Real earnings from wallet_transactions (escrow_release only)
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const [{ data: allReleases }, { data: monthReleases }] = await Promise.all([
      sb.from("wallet_transactions")
        .select("amount_paise")
        .eq("user_id", userId)
        .eq("kind", "escrow_release"),
      sb.from("wallet_transactions")
        .select("amount_paise")
        .eq("user_id", userId)
        .eq("kind", "escrow_release")
        .gte("created_at", monthStart),
    ]);

    const lifetime = (allReleases ?? []).reduce((s: number, r: any) => s + Number(r.amount_paise ?? 0), 0);
    const monthAmt = (monthReleases ?? []).reduce((s: number, r: any) => s + Number(r.amount_paise ?? 0), 0);
    setLifetimeEarnings(lifetime);
    setMonthEarnings(monthAmt);

    // Pending in escrow = active contracts' agreed_price where user is employee
    const { data: activeContracts } = await sb
      .from("contracts")
      .select("agreed_price")
      .eq("employee_id", userId)
      .eq("status", "active");
    const pending = (activeContracts ?? []).reduce((s: number, c: any) => s + Number(c.agreed_price ?? 0), 0);
    setPendingEscrow(pending);

    // Earnings from employee_profiles for withdrawal/penalty fields
    const { data: ep } = await sb
      .from("employee_profiles")
      .select("lifetime_earnings, current_month_earnings, available_for_withdrawal, pending_in_escrow, total_withdrawn, total_platform_fees, payouts_lifetime_count, payouts_pending_count, withdrawal_penalty_paise, withdrawals_this_month, last_withdrawal_at, current_month_label")
      .eq("user_id", userId)
      .maybeSingle();

    // History = wallet_transactions (escrow_release) + tips
    const cutoff = period === "all" ? "1900-01-01" : new Date(Date.now() - (period === "30d" ? 30 : period === "90d" ? 90 : 365) * 86400000).toISOString();
    const [{ data: released }, { data: tipRows }] = await Promise.all([
      sb.from("wallet_transactions")
        .select("id, amount_paise, kind, description, created_at")
        .eq("user_id", userId)
        .eq("kind", "escrow_release")
        .gte("created_at", cutoff)
        .order("created_at", { ascending: false })
        .limit(50),
      sb.from("tips")
        .select("id, contract_id, amount, paid_at")
        .eq("to_user_id", userId)
        .not("paid_at", "is", null)
        .gte("paid_at", cutoff)
        .order("paid_at", { ascending: false })
        .limit(50),
    ]);

    const merged: EarningRow[] = [];
    for (const p of (released ?? []) as any[]) {
      merged.push({
        id: p.id,
        kind: "contract_release",
        amount_paise: p.amount_paise,
        direction: "credit",
        description: p.description ?? "Contract payout",
        contract_id: null,
        created_at: p.created_at,
      });
    }
    for (const t of (tipRows ?? []) as any[]) {
      merged.push({
        id: t.id,
        kind: "tip",
        amount_paise: t.amount,
        direction: "credit",
        description: "Tip received",
        contract_id: t.contract_id,
        created_at: t.paid_at,
      });
    }
    merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    setEarnings(ep);
    const e: any = ep;
    setPenalties(e ? { balance_paise: e.withdrawal_penalty_paise ?? 0, withdrawals_this_month: e.withdrawals_this_month ?? 0, last_withdrawal_at: e.last_withdrawal_at } : null);
    setHistory(merged);
    setLoading(false);
  }, [userId, period]);

  React.useEffect(() => { load(); }, [load]);

  // Realtime
  React.useEffect(() => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const ch = sb
      .channel(`earnings-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "wallet_transactions", filter: `user_id=eq.${userId}` }, () => load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tips", filter: `to_user_id=eq.${userId}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "contracts", filter: `employee_id=eq.${userId}` }, () => load())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "employee_profiles", filter: `user_id=eq.${userId}` }, () => load())
      .subscribe();
    return () => { sb.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, load]);

  const inEscrow = pendingEscrow;
  const lifetime = lifetimeEarnings;
  const monthDisplay = monthEarnings;
  const withdrawn = earnings?.total_withdrawn ?? 0;
  const platformFees = earnings?.total_platform_fees ?? 0;
  const walletBalance = wallet?.balance_paise ?? 0;
  const penaltyBalance = penalties?.balance_paise ?? 0;
  const withdrawalsThisMonth = penalties?.withdrawals_this_month ?? 0;

  // 3-withdrawal rule: 1st free, 2nd 5%, 3rd 10%, 4th+ 20% (HiVR rule)
  // After 3 in a month → 7-day pause
  const nextWithdrawalPenalty = withdrawalsThisMonth === 0 ? 0 : withdrawalsThisMonth === 1 ? 5 : withdrawalsThisMonth === 2 ? 10 : 20;
  const willPause = withdrawalsThisMonth >= 3;

  async function doWithdraw(amountPaise: number) {
    setWithdrawing(true);
    setWithdrawMsg(null);
    try {
      const r = await fetch("/api/wallet/withdraw", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountPaise, method: "upi" }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        setWithdrawMsg(d?.error ?? "Withdrawal failed");
        return;
      }
      setWithdrawAmount("");
      setWithdrawMsg(`Withdrawal of ${formatPaise(amountPaise)} initiated. It'll reach your UPI in minutes.`);
      load();
    } catch (e) {
      setWithdrawMsg((e as Error).message);
    } finally {
      setWithdrawing(false);
    }
  }

  async function handleWithdrawClick() {
    const amountPaise = Math.round(Number(withdrawAmount) * 100);
    if (!Number.isFinite(amountPaise) || amountPaise < 10000) {
      setWithdrawMsg("Minimum withdrawal is ₹100");
      return;
    }
    if (amountPaise > walletBalance) {
      setWithdrawMsg("Insufficient wallet balance");
      return;
    }
    // Check if PIN is set — if so, show PIN dialog first
    const pinCheck = await fetch("/api/wallet/txn-pin");
    const pinData = await pinCheck.json();
    if (pinData.ok && pinData.hasPin) {
      setPendingWithdraw(amountPaise);
      setShowPinDialog(true);
    } else {
      doWithdraw(amountPaise);
    }
  }

  async function verifyPinAndWithdraw(pin: string): Promise<boolean> {
    const r = await fetch("/api/wallet/txn-pin", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "verify", pin }),
    });
    const d = await r.json();
    if (!r.ok || !d.ok || !d.verified) return false;
    setShowPinDialog(false);
    if (pendingWithdraw !== null) {
      doWithdraw(pendingWithdraw);
      setPendingWithdraw(null);
    }
    return true;
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Top KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={TrendingUp}
          label="Lifetime earnings"
          value={formatPaise(lifetime)}
          hint={`after ${formatPaise(platformFees)} fees`}
          tone="emerald"
        />
        <Stat
          icon={Calendar}
          label="This month"
          value={formatPaise(monthDisplay)}
          hint="current month"
          tone="sky"
        />
        <Stat
          icon={Clock}
          label="Pending in escrow"
          value={formatPaise(inEscrow)}
          hint="active contracts total"
          tone="amber"
        />
        <Stat
          icon={Wallet}
          label="Wallet balance"
          value={formatPaise(walletBalance)}
          hint={wallet?.is_frozen ? "Frozen" : "available to withdraw"}
          tone={wallet?.is_frozen ? "zinc" : "violet"}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat
          icon={ArrowDownToLine}
          label="Total withdrawn"
          value={formatPaise(withdrawn)}
          hint="lifetime to bank/UPI"
          tone="zinc"
          small
        />
        <Stat
          icon={AlertTriangle}
          label="Withdrawal penalty"
          value={formatPaise(penaltyBalance)}
          hint={withdrawalsThisMonth > 0 ? `${withdrawalsThisMonth} this month` : "no penalty yet"}
          tone={penaltyBalance > 0 ? "rose" : "zinc"}
          small
        />
        <Stat
          icon={Award}
          label="Next-payout fee"
          value={nextWithdrawalPenalty === 0 ? "Free" : `${nextWithdrawalPenalty}%`}
          hint={withdrawalsThisMonth >= 3 ? "⚠ Next will pause you 7d" : `${3 - withdrawalsThisMonth} more free this month`}
          tone={nextWithdrawalPenalty > 10 ? "rose" : nextWithdrawalPenalty > 0 ? "amber" : "emerald"}
          small
        />
      </div>

      {/* Withdrawal flow */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ArrowDownToLine className="h-4 w-4 text-primary" />Withdraw to bank
          </CardTitle>
          <CardDescription>
            Transfer wallet balance to your verified UPI or bank account. First 3 withdrawals per month are free (1st), 5% (2nd), 10% (3rd). After 3 you&apos;re paused 7 days.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {withdrawMsg && (
            <div className={cn(
              "rounded-lg border px-4 py-3 text-sm",
              withdrawMsg.startsWith("Withdrawal")
                ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700"
                : "border-rose-500/30 bg-rose-500/5 text-rose-700"
            )}>{withdrawMsg}</div>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Amount to withdraw</label>
              <div className="flex items-center gap-1">
                <span className="text-base text-muted-foreground">₹</span>
                <input
                  type="number"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="Enter amount"
                  min={100}
                  step={100}
                  className="h-10 w-40 rounded-lg border bg-background px-3 text-base focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
            <Button onClick={handleWithdrawClick} disabled={withdrawing || walletBalance < 10000 || !wallet} size="lg" className="h-10">
              {withdrawing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
              Withdraw
            </Button>
            <div className="text-sm text-muted-foreground">
              Available: <span className="font-mono font-semibold text-foreground">{formatPaise(walletBalance)}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
            <span>💳 <span className="font-medium text-foreground">UPI</span> — funds arrive in minutes</span>
            <span className="text-muted-foreground/50">|</span>
            <Link href="/dashboard/payments?tab=payout" className="text-primary hover:underline">Change payout method →</Link>
          </div>
        </CardContent>
      </Card>

      {/* Period filter + history */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4" />Earnings history
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg border bg-muted/30 p-0.5 text-xs">
                {(["30d", "90d", "year", "all"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPeriod(p)}
                    className={cn(
                      "rounded-md px-3 py-1.5 transition-colors",
                      period === p ? "bg-background shadow-sm font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {p === "30d" ? "30d" : p === "90d" ? "90d" : p === "year" ? "12m" : "All"}
                  </button>
                ))}
              </div>
              <Button size="sm" variant="outline" onClick={load} disabled={loading}>
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && history.length === 0 ? (
            <div className="grid place-items-center py-16 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : history.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed bg-muted/20 py-16 text-center">
              <Sparkles className="mx-auto h-8 w-8 text-muted-foreground/40" />
              <p className="mt-3 text-base font-medium">No earnings in this period</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Earnings appear here when a buyer marks your contract delivery as done.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((r) => (
                <Link
                  key={`${r.kind}-${r.id}`}
                  href={r.contract_id ? `/dashboard/contracts/${r.contract_id}` : "/dashboard/contracts"}
                  className="group flex items-center gap-4 rounded-xl border bg-background p-4 transition-all hover:border-primary/40 hover:shadow-sm hover:bg-accent/50"
                >
                  <div className={cn(
                    "grid h-10 w-10 shrink-0 place-items-center rounded-full",
                    r.kind === "tip" ? "bg-amber-500/10" : "bg-emerald-500/10"
                  )}>
                    {r.kind === "tip" ? <Sparkles className="h-5 w-5 text-amber-600" /> : <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.kind === "tip" ? "Tip received" : "Contract payout"} · {timeAgo(r.created_at)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-base font-bold text-emerald-600">
                      +{formatPaise(r.amount_paise)}
                    </p>
                    <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-700">
                      Released
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {showPinDialog && (
        <TxnPinDialog
          title="Authorise withdrawal"
          description={`Enter your PIN to withdraw ${pendingWithdraw !== null ? formatPaise(pendingWithdraw) : ""} to your bank.`}
          onConfirm={verifyPinAndWithdraw}
          onCancel={() => { setShowPinDialog(false); setPendingWithdraw(null); }}
        />
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value, hint, tone, small }: { icon: any; label: string; value: string; hint?: string; tone: "emerald" | "sky" | "amber" | "rose" | "violet" | "zinc"; small?: boolean }) {
  const toneClass: Record<string, string> = {
    rose: "text-rose-600 bg-rose-500/10",
    emerald: "text-emerald-600 bg-emerald-500/10",
    sky: "text-sky-600 bg-sky-500/10",
    amber: "text-amber-600 bg-amber-500/10",
    violet: "text-violet-600 bg-violet-500/10",
    zinc: "text-muted-foreground bg-muted",
  };
  return (
    <Card className="transition-shadow hover:shadow-sm">
      <CardContent className={cn("p-4", small && "p-3")}>
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          <div className={cn("grid h-6 w-6 place-items-center rounded-full", toneClass[tone])}>
            <Icon className="h-3 w-3" />
          </div>
        </div>
        <p className={cn("mt-1.5 font-display font-bold tabular-nums", small ? "text-lg" : "text-2xl")}>{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
