"use client";

import * as React from "react";
import Link from "next/link";
import {
  Wallet, IndianRupee, ArrowUpRight, ArrowDownLeft, RefreshCw, Loader2,
  Download, Filter, X, CheckCircle2, AlertCircle,
  Clock, ShieldAlert, TrendingDown, TrendingUp, Search, ChevronRight,
  Building2, Smartphone, ListChecks, FileText, Gift, ArrowDownToLine, Sparkles,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn, formatPaise, timeAgo } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { PayoutMethodCard } from "@/components/payout/payout-method-card";
import { EarningsBreakdown } from "@/components/payments/earnings-breakdown";

type Payment = {
  id: string;
  contract_id: string;
  milestone_id: string | null;
  amount: number;
  platform_fee_amount: number;
  razorpay_payment_id: string | null;
  status: "created" | "authorized" | "captured" | "in_escrow" | "released" | "refunded" | "disputed" | "failed";
  escrow_released: boolean;
  created_at: string;
  contract: {
    id: string;
    status: string;
    agreed_price: number;
    started_at: string | null;
    completed_at: string | null;
    buyer_id: string;
    employee_id: string;
    category_id: string | null;
    task_post_id: string | null;
    task: { id: string; title: string; category_id: string | null } | null;
    buyer: { id: string; full_name: string | null; avatar_url: string | null } | null;
    employee: { id: string; full_name: string | null; avatar_url: string | null } | null;
  } | null;
};

type Tip = {
  id: string;
  contract_id: string;
  from_user_id: string;
  to_user_id: string;
  amount: number;
  paid_at: string | null;
};

type Wallet = {
  user_id: string;
  balance_paise: number;
  lifetime_loaded_paise: number;
  lifetime_spent_paise: number;
  lifetime_received_paise: number;
  is_frozen: boolean;
};

type PayoutData = {
  method: "upi" | "bank" | null;
  upi_id: string | null;
  upi_provider_name: string | null;
  upi_verified_at: string | null;
  account_holder: string | null;
  account_last4: string | null;
  ifsc: string | null;
  bank_verified_at: string | null;
};

type Tab = "transactions" | "payout" | "earnings" | "refunds";

const STATUS_META: Record<string, { label: string; tone: string; icon: any }> = {
  created:    { label: "Created",    tone: "bg-muted text-muted-foreground",                icon: Clock },
  authorized: { label: "Authorized", tone: "bg-sky-500/10 text-sky-700 border-sky-500/20",  icon: ShieldAlert },
  captured:   { label: "Captured",   tone: "bg-violet-500/10 text-violet-700",              icon: CheckCircle2 },
  in_escrow:  { label: "In escrow",  tone: "bg-amber-500/10 text-amber-700",                icon: ShieldAlert },
  released:   { label: "Released",   tone: "bg-emerald-500/10 text-emerald-700",            icon: CheckCircle2 },
  refunded:   { label: "Refunded",   tone: "bg-zinc-500/10 text-zinc-700",                  icon: RefreshCw },
  disputed:   { label: "Disputed",   tone: "bg-rose-500/10 text-rose-700",                  icon: AlertCircle },
  failed:     { label: "Failed",     tone: "bg-rose-500/10 text-rose-700",                  icon: AlertCircle },
};

type Period = "all" | "7d" | "30d" | "90d" | "year";

function periodFilter(period: Period, date: string | null | undefined): boolean {
  if (period === "all" || !date) return true;
  const days = period === "7d" ? 7 : period === "30d" ? 30 : period === "90d" ? 90 : 365;
  const cutoff = Date.now() - days * 86400000;
  return new Date(date).getTime() >= cutoff;
}

export function PaymentsHistory({
  userId, role, defaultTab = "transactions",
  initialPayments, initialRefunds, initialWallet, initialTips, initialWalletTxns, initialPayout, initialEarnings,
}: {
  userId: string;
  role: "buyer" | "employee" | "both";
  defaultTab?: Tab;
  initialPayments: Payment[];
  initialRefunds: Payment[];
  initialWallet: Wallet | null;
  initialTips: Tip[];
  initialWalletTxns?: any[];
  initialPayout: PayoutData;
  initialEarnings: any;
}) {
  const sbRef = React.useRef<ReturnType<typeof createClient> | null>(null);
  const [payments, setPayments] = React.useState<Payment[]>(initialPayments);
  const [refunds, setRefunds] = React.useState<Payment[]>(initialRefunds);
  const [wallet, setWallet] = React.useState<Wallet | null>(initialWallet);
  const [tips, setTips] = React.useState<Tip[]>(initialTips);
  const [walletTxns, setWalletTxns] = React.useState<any[]>(initialWalletTxns ?? []);
  const [tab, setTab] = React.useState<Tab>(defaultTab);
  const [period, setPeriod] = React.useState<Period>("all");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [search, setSearch] = React.useState("");
  const [refreshing, setRefreshing] = React.useState(false);

  // Initial load of wallet transactions
  React.useEffect(() => {
    loadWalletTxns();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadWalletTxns() {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const { data } = await sb
      .from("wallet_transactions")
      .select("id, amount_paise, kind, description, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    setWalletTxns(data ?? []);
  }

  // Realtime
  React.useEffect(() => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const ch = sb
      .channel(`payments-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "user_wallets", filter: `user_id=eq.${userId}` }, () => refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "wallet_transactions", filter: `user_id=eq.${userId}` }, (payload) => {
        const n = payload.new as any;
        setWalletTxns((prev) => [n, ...prev].slice(0, 100));
        refresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "tips" }, () => refresh())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "users", filter: `id=eq.${userId}` }, () => refresh())
      .subscribe();
    return () => { sb.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function refresh() {
    setRefreshing(true);
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const [p, w, t, u, wt] = await Promise.all([
      sb.from("payments").select(`id, contract_id, milestone_id, amount, razorpay_payment_id, status, escrow_released, created_at, contract:contracts!inner(id, status, agreed_price, started_at, completed_at, buyer_id, employee_id, category_id, task_post_id, task:task_posts(id, title, category_id), buyer:users!contracts_buyer_id_fkey(id, full_name, avatar_url), employee:users!contracts_employee_id_fkey(id, full_name, avatar_url))`).order("created_at", { ascending: false }).limit(500),
      sb.from("user_wallets").select("*").eq("user_id", userId).maybeSingle(),
      sb.from("tips").select("id, contract_id, from_user_id, to_user_id, amount, paid_at").or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`).order("paid_at", { ascending: false }).limit(100),
      sb.from("users").select("payout_method, upi_id, upi_provider_name, upi_verified_at, account_holder, account_last4, ifsc, bank_verified_at").eq("id", userId).maybeSingle(),
      sb.from("wallet_transactions").select("id, amount_paise, kind, description, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
    ]);
    const allP = ((p.data ?? []) as Payment[]);
    setPayments(allP);
    setRefunds(allP.filter((x) => x.status === "refunded" || x.status === "disputed"));
    setWallet((w.data ?? null) as Wallet | null);
    setTips((t.data ?? []) as Tip[]);
    setWalletTxns((wt.data ?? []) as any[]);
    setRefreshing(false);
  }

  // Derive "paid" (you as buyer) vs "received" (you as employee)
  const paid = React.useMemo(
    () => payments.filter((p) => p.contract?.buyer_id === userId),
    [payments, userId]
  );
  const received = React.useMemo(
    () => payments.filter((p) => p.contract?.employee_id === userId),
    [payments, userId]
  );
  // Tips: only employee receives tips; buyer only sends
  const tipsSent = React.useMemo(
    () => tips.filter((t) => t.from_user_id === userId && t.paid_at),
    [tips, userId]
  );
  const tipsReceived = React.useMemo(
    () => tips.filter((t) => t.to_user_id === userId && t.paid_at),
    [tips, userId]
  );

  // Refunds (money that came back to me)
  const myRefunds = React.useMemo(
    () => refunds.filter((r) => r.contract?.buyer_id === userId || r.contract?.employee_id === userId),
    [refunds, userId]
  );

  // Totals
  const totalPaid = paid.filter((p) => p.status !== "failed" && p.status !== "refunded")
    .reduce((s, p) => s + p.amount, 0);
  const totalReceived = received.filter((p) => p.status === "released" || p.status === "captured" || p.status === "in_escrow")
    .reduce((s, p) => s + p.amount, 0);
  const totalRefunds = myRefunds.reduce((s, r) => s + r.amount, 0);
  // Tips: only show for employee (sending tips is unusual for buyer)
  const showTips = role === "employee" || role === "both";
  const totalTipsSent = tipsSent.reduce((s, t) => s + t.amount, 0);
  const totalTipsReceived = tipsReceived.reduce((s, t) => s + t.amount, 0);

  const WALLET_KIND_META: Record<string, { label: string; icon: any; tone: string }> = {
    escrow_release: { label: "Payment received", icon: CheckCircle2, tone: "text-emerald-600 bg-emerald-500/10" },
    add_funds: { label: "Funds added", icon: Wallet, tone: "text-sky-600 bg-sky-500/10" },
    withdrawal: { label: "Withdrawal", icon: ArrowDownToLine, tone: "text-rose-600 bg-rose-500/10" },
    incentive: { label: "Incentive", icon: Sparkles, tone: "text-amber-600 bg-amber-500/10" },
    tip: { label: "Tip received", icon: Gift, tone: "text-amber-600 bg-amber-500/10" },
    default: { label: "Transaction", icon: IndianRupee, tone: "text-muted-foreground bg-muted" },
  };

  // Filtered list for the table
  const visibleRows = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows: Array<{
      key: string;
      kind: "paid" | "received" | "tip_sent" | "tip_received" | "refund" | "wallet";
      date: string;
      counterparty: string;
      taskTitle: string;
      amount: number;
      status: string;
      refId: string;
      walletKind?: string;
    }> = [];

    const includePaid = tab === "transactions";
    const includeReceived = tab === "transactions" && (role === "employee" || role === "both");
    const includeTips = tab === "transactions" && showTips;
    const includeRefunds = tab === "refunds" || tab === "transactions";

    if (includePaid) {
      for (const p of paid) {
        if (statusFilter !== "all" && p.status !== statusFilter) continue;
        if (!periodFilter(period, p.created_at)) continue;
        if (q && !((p.contract?.task?.title ?? "").toLowerCase().includes(q) ||
                   (p.contract?.employee?.full_name ?? "").toLowerCase().includes(q) ||
                   p.status.toLowerCase().includes(q))) continue;
        rows.push({
          key: `p-${p.id}`,
          kind: "paid",
          date: p.created_at,
          counterparty: p.contract?.employee?.full_name ?? "Counterparty",
          taskTitle: p.contract?.task?.title ?? "Payment",
          amount: p.amount,
          status: p.status,
          refId: p.contract_id,
        });
      }
    }
    if (includeReceived) {
      for (const p of received) {
        if (statusFilter !== "all" && p.status !== statusFilter) continue;
        if (!periodFilter(period, p.created_at)) continue;
        if (q && !((p.contract?.task?.title ?? "").toLowerCase().includes(q) ||
                   (p.contract?.buyer?.full_name ?? "").toLowerCase().includes(q) ||
                   p.status.toLowerCase().includes(q))) continue;
        rows.push({
          key: `r-${p.id}`,
          kind: "received",
          date: p.created_at,
          counterparty: p.contract?.buyer?.full_name ?? "Counterparty",
          taskTitle: p.contract?.task?.title ?? "Payment",
          amount: p.amount,
          status: p.status,
          refId: p.contract_id,
        });
      }
    }
    if (includeTips) {
      for (const t of tipsSent) {
        if (!periodFilter(period, t.paid_at)) continue;
        if (q && !((t.contract_id ?? "").toLowerCase().includes(q))) continue;
        rows.push({
          key: `ts-${t.id}`,
          kind: "tip_sent",
          date: t.paid_at!,
          counterparty: "Tip recipient",
          taskTitle: "Tip received",
          amount: t.amount,
          status: "released",
          refId: t.contract_id,
        });
      }
      for (const t of tipsReceived) {
        if (!periodFilter(period, t.paid_at)) continue;
        rows.push({
          key: `tr-${t.id}`,
          kind: "tip_received",
          date: t.paid_at!,
          counterparty: "Tip sender",
          taskTitle: "Tip received",
          amount: t.amount,
          status: "released",
          refId: t.contract_id,
        });
      }
    }
    if (includeRefunds) {
      for (const r of myRefunds) {
        if (statusFilter !== "all" && r.status !== statusFilter) continue;
        if (!periodFilter(period, r.created_at)) continue;
        if (q && !((r.contract?.task?.title ?? "").toLowerCase().includes(q) ||
                   r.status.toLowerCase().includes(q))) continue;
        rows.push({
          key: `rf-${r.id}`,
          kind: "refund",
          date: r.created_at,
          counterparty: r.contract?.buyer_id === userId ? r.contract?.employee?.full_name ?? "Counterparty" : r.contract?.buyer?.full_name ?? "Counterparty",
          taskTitle: r.contract?.task?.title ?? "Refund",
          amount: r.amount,
          status: r.status,
          refId: r.contract_id,
        });
      }
    }

    // Wallet transactions
    if (tab === "transactions") {
      for (const wt of walletTxns) {
        if (!periodFilter(period, wt.created_at)) continue;
        const isCredit = !["withdrawal"].includes(wt.kind);
        const meta = WALLET_KIND_META[wt.kind] ?? WALLET_KIND_META.default;
        if (q && !((wt.description ?? "").toLowerCase().includes(q) || meta.label.toLowerCase().includes(q))) continue;
        rows.push({
          key: `wt-${wt.id}`,
          kind: "wallet",
          date: wt.created_at,
          counterparty: isCredit ? "HiVR" : "Withdrawal",
          taskTitle: wt.description ?? meta.label,
          amount: Math.abs(wt.amount_paise ?? 0),
          status: isCredit ? "released" : "withdrawal",
          refId: "",
          walletKind: wt.kind,
        });
      }
    }

    return rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [tab, paid, received, tipsSent, tipsReceived, myRefunds, walletTxns, period, statusFilter, search, role, showTips, userId]);

  function exportCsv() {
    const TYPE_LABELS: Record<string, string> = {
      paid: "Payment sent",
      received: "Payment received",
      tip_sent: "Tip sent",
      tip_received: "Tip received",
      refund: "Refund",
      wallet: "Wallet transaction",
    };
    const headers = ["Date", "Description", "Counterparty", "Type", "Debit (₹)", "Credit (₹)", "Balance (₹)", "Status", "Reference ID"];
    const rows = visibleRows.map((r) => {
      const isOut = r.kind === "paid" || r.kind === "tip_sent";
      const isWallet = r.kind === "wallet";
      const isWalletDebit = isWallet && r.walletKind === "withdrawal";
      const debit = isOut || isWalletDebit ? (r.amount / 100).toFixed(2) : "";
      const credit = (!isOut && !isWalletDebit) || (isWallet && r.walletKind !== "withdrawal") ? (r.amount / 100).toFixed(2) : "";
      const dateStr = new Date(r.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
      const desc = r.taskTitle;
      const counterparty = r.counterparty;
      const typeLabel = r.walletKind ? (WALLET_KIND_META[r.walletKind]?.label ?? TYPE_LABELS[r.kind] ?? r.kind) : (TYPE_LABELS[r.kind] ?? r.kind);
      const statusLabel = r.status === "released" ? "Completed" : r.status === "withdrawal" ? "Processed" : r.status;
      return [dateStr, desc, counterparty, typeLabel, debit, credit, "", statusLabel, r.refId || r.key];
    });
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hivr-statement-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const tabs: Array<{ key: Tab; label: string; Icon: any; show: boolean }> = [
    { key: "transactions", label: "Transactions", Icon: ListChecks, show: true },
    { key: "payout",       label: "Payout method", Icon: Building2, show: role === "employee" || role === "both" },
    { key: "earnings",     label: "Earnings",      Icon: TrendingUp, show: role === "employee" || role === "both" },
    { key: "refunds",      label: "Refunds",      Icon: RefreshCw,   show: true },
  ];

  return (
    <div className="container max-w-6xl space-y-6 py-8">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2">
          <Link href="/dashboard"><ArrowUpRight className="h-3.5 w-3.5" />Dashboard</Link>
        </Button>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Payment details</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {role === "employee"
            ? "Where you'll be paid, your earnings, refunds, and transaction history — all in one place."
            : role === "both"
              ? "Where you pay, get paid, your earnings, payouts, and refunds — all in one place."
              : "What you've paid, your transactions, and any refunds — all in one place."}
        </p>
      </div>

      {/* Tabs */}
      <div className="inline-flex flex-wrap rounded-md border bg-muted/30 p-0.5 text-xs">
        {tabs.filter((t) => t.show).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded px-3 py-1.5 font-medium transition-colors flex items-center gap-1.5",
              tab === t.key ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <t.Icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "payout" && <PayoutMethodCard initial={initialPayout} />}

      {tab === "earnings" && (role === "employee" || role === "both") && (
        <EarningsBreakdown
          userId={userId}
          initialEarnings={initialEarnings}
          wallet={wallet}
        />
      )}

      {(tab === "transactions" || tab === "refunds") && (
        <>
          {/* Summary cards — role-aware */}
          {tab === "transactions" && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(role === "employee" || role === "both") && (
                <SummaryCard
                  icon={TrendingUp}
                  label="Total received"
                  value={formatPaise(totalReceived)}
                  hint={`${received.length} payment${received.length === 1 ? "" : "s"}`}
                  tone="emerald"
                />
              )}
              <SummaryCard
                icon={TrendingDown}
                label="Total paid"
                value={formatPaise(totalPaid)}
                hint={`${paid.length} payment${paid.length === 1 ? "" : "s"}`}
                tone="rose"
              />
              <SummaryCard
                icon={Wallet}
                label="Wallet balance"
                value={formatPaise(wallet?.balance_paise ?? 0)}
                hint={wallet?.is_frozen ? "Frozen" : "Available"}
                tone={wallet?.is_frozen ? "zinc" : "sky"}
              />
              {showTips && (
                <SummaryCard
                  icon={TrendingUp}
                  label="Tips received"
                  value={formatPaise(totalTipsReceived)}
                  hint={`${tipsReceived.length} tip${tipsReceived.length === 1 ? "" : "s"}`}
                  tone="amber"
                />
              )}
              {!showTips && (role === "buyer" || role === "both") && (
                <SummaryCard
                  icon={RefreshCw}
                  label="Refunds"
                  value={formatPaise(totalRefunds)}
                  hint={`${myRefunds.length} refund${myRefunds.length === 1 ? "" : "s"}`}
                  tone="zinc"
                />
              )}
            </div>
          )}

          {tab === "refunds" && (
            <>
              <div className="flex items-start gap-2 rounded-md border border-sky-500/30 bg-sky-500/5 p-3 text-xs text-sky-700">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <p>
                  All HiVR refunds are credited to your <strong>HiVR wallet</strong>, not to the original
                  payment method. You can use the wallet balance to fund new contracts or withdraw it
                  to your verified bank / UPI at any time.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <SummaryCard
                  icon={RefreshCw}
                  label="Total refunds"
                  value={formatPaise(totalRefunds)}
                  hint={`${myRefunds.length} refund${myRefunds.length === 1 ? "" : "s"}`}
                  tone="zinc"
                />
                <SummaryCard
                  icon={AlertCircle}
                  label="Disputed"
                  value={formatPaise(myRefunds.filter((r) => r.status === "disputed").reduce((s, r) => s + r.amount, 0))}
                  hint={`${myRefunds.filter((r) => r.status === "disputed").length} open`}
                  tone="rose"
                />
              </div>
            </>
          )}

          {/* Wallet summary (when view = wallet) */}
          {tab === "transactions" && wallet && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wallet className="h-4 w-4" />HiVR Wallet
                </CardTitle>
                <CardDescription>Preloaded balance for instant escrow funding.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-4">
                <Stat label="Available"   value={formatPaise(wallet.balance_paise)} />
                <Stat label="Loaded"      value={formatPaise(wallet.lifetime_loaded_paise)} />
                <Stat label="Spent"       value={formatPaise(wallet.lifetime_spent_paise)} />
                <Stat label="Received"    value={formatPaise(wallet.lifetime_received_paise)} />
              </CardContent>
            </Card>
          )}

          {/* Filters + table */}
          <Card>
            <CardHeader className="space-y-3 pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">
                  {tab === "transactions" ? "Transactions" : "Refunds"}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={refresh} disabled={refreshing}>
                    {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Refresh
                  </Button>
                  <Button size="sm" variant="outline" onClick={exportCsv} disabled={visibleRows.length === 0}>
                    <Download className="h-3.5 w-3.5" />Export CSV
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value as Period)}
                  className="h-7 rounded-md border bg-background px-2 text-[11px]"
                >
                  <option value="all">All time</option>
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="90d">Last 90 days</option>
                  <option value="year">Last 12 months</option>
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-7 rounded-md border bg-background px-2 text-[11px]"
                >
                  <option value="all">All statuses</option>
                  {Object.entries(STATUS_META).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
                <div className="relative ml-auto">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search task or person…"
                    className="h-7 w-56 pl-7 text-[11px]"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {visibleRows.length === 0 ? (
                <div className="rounded-md border border-dashed bg-muted/20 py-12 text-center">
                  <Filter className="mx-auto h-6 w-6 text-muted-foreground/50" />
                  <p className="mt-2 text-sm font-medium">No {tab === "refunds" ? "refunds" : "transactions"} match</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">Try clearing filters or pick a different period.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {visibleRows.slice(0, 100).map((r) => {
                    const isOut = r.kind === "paid" || r.kind === "tip_sent";
                    const isWallet = r.kind === "wallet";
                    const walletIsCredit = isWallet && r.walletKind !== "withdrawal";
                    const tone = isOut ? "text-rose-600" : isWallet && walletIsCredit ? "text-emerald-600" : "text-emerald-600";
                    const statusMeta = STATUS_META[r.status] ?? STATUS_META.created;
                    const StatusIcon = statusMeta.icon;

                    let label = "—";
                    if (r.kind === "paid") label = "Paid to";
                    else if (r.kind === "received") label = "Received from";
                    else if (r.kind === "tip_sent") label = "Tip to";
                    else if (r.kind === "tip_received") label = "Tip from";
                    else if (r.kind === "refund") label = "Refund";
                    else if (r.kind === "wallet") label = walletIsCredit ? "Credited" : "Debited";

                    const walletMeta = r.walletKind ? WALLET_KIND_META[r.walletKind] ?? WALLET_KIND_META.default : null;
                    const walletIcon = walletMeta?.icon;

                    return (
                      <Link
                        key={r.key}
                        href={r.refId ? `/dashboard/contracts/${r.refId}` : "/dashboard/payments"}
                        className="group flex items-center gap-3 rounded-md border bg-background p-2.5 transition-colors hover:border-primary/40 hover:bg-accent"
                      >
                        <div className={cn(
                          "grid h-8 w-8 shrink-0 place-items-center rounded-full",
                          isOut ? "bg-rose-500/10" : isWallet ? (walletMeta?.tone ?? "bg-emerald-500/10") : "bg-emerald-500/10"
                        )}>
                          {isWallet && walletIcon ? <walletIcon className={cn("h-4 w-4", tone)} /> :
                           isOut ? <ArrowUpRight className={cn("h-4 w-4", tone)} /> : <ArrowDownLeft className={cn("h-4 w-4", tone)} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{r.taskTitle}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {label}{r.counterparty !== "HiVR" && r.counterparty !== "Withdrawal" ? (
                              <> <span className="font-medium text-foreground/80">{r.counterparty}</span></>
                            ) : null}
                            {" · "}
                            {timeAgo(r.date)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={cn("font-mono text-sm font-semibold", tone)}>
                            {(isOut || (!walletIsCredit && isWallet)) ? "−" : "+"}{formatPaise(r.amount)}
                          </p>
                          <Badge variant="outline" className={cn("text-[9px]", statusMeta.tone)}>
                            <StatusIcon className="h-2.5 w-2.5" />{statusMeta.label}
                          </Badge>
                        </div>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
                      </Link>
                    );
                  })}
                </div>
              )}
              {visibleRows.length > 100 && (
                <p className="mt-2 text-center text-[10px] text-muted-foreground">
                  Showing first 100 of {visibleRows.length} transactions. Use filters or export to see more.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, hint, tone }: { icon: any; label: string; value: string; hint?: string; tone: "rose" | "emerald" | "sky" | "amber" | "zinc" }) {
  const toneClass: Record<string, string> = {
    rose: "text-rose-600 bg-rose-500/10",
    emerald: "text-emerald-600 bg-emerald-500/10",
    sky: "text-sky-600 bg-sky-500/10",
    amber: "text-amber-600 bg-amber-500/10",
    zinc: "text-muted-foreground bg-muted",
  };
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          <div className={cn("grid h-6 w-6 place-items-center rounded-full", toneClass[tone])}>
            <Icon className="h-3 w-3" />
          </div>
        </div>
        <p className="mt-1 font-display text-2xl font-bold tabular-nums">{value}</p>
        {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/20 p-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}
