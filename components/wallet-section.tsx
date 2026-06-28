"use client";

import * as React from "react";
import { Wallet, Plus, ArrowDownToLine, Loader2, X, AlertTriangle, CheckCircle2, Sparkles, Send, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn, formatPaise, timeAgo } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

declare global {
  interface Window { Razorpay?: any; }
}
const RZP_JS = "https://checkout.razorpay.com/v1/checkout.js";
function loadRzp(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = RZP_JS; s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}

type Wallet = {
  user_id: string;
  balance_paise: number;
  lifetime_loaded_paise: number;
  lifetime_spent_paise: number;
  lifetime_received_paise: number;
  is_frozen: boolean;
  freeze_reason: string | null;
  updated_at: string;
};

type Txn = {
  id: string;
  amount_paise: number;
  direction: "credit" | "debit";
  kind: string;
  description: string | null;
  balance_after_paise: number;
  created_at: string;
};

const KIND_META: Record<string, { icon: any; tone: string; label: string }> = {
  add_funds:        { icon: Plus,           tone: "text-emerald-600", label: "Added funds" },
  escrow_fund:      { icon: Send,           tone: "text-rose-600",    label: "Escrow funding" },
  escrow_release:   { icon: ArrowDownToLine, tone: "text-emerald-600", label: "Escrow release" },
  tip:              { icon: Sparkles,       tone: "text-amber-600",   label: "Tip received" },
  incentive:        { icon: Sparkles,       tone: "text-amber-600",   label: "Incentive" },
  withdraw_initiated: { icon: ArrowDownToLine, tone: "text-sky-600", label: "Withdrawal initiated" },
  withdraw_completed: { icon: CheckCircle2, tone: "text-emerald-600", label: "Withdrawal completed" },
  withdraw_failed:  { icon: AlertTriangle,  tone: "text-rose-600",    label: "Withdrawal failed" },
  refund:           { icon: RefreshCw,      tone: "text-sky-600",     label: "Refund" },
  adjustment:       { icon: AlertTriangle,  tone: "text-muted-foreground", label: "Adjustment" },
};

export function WalletSection({ userFullName, userEmail, userPhone }: { userFullName: string; userEmail: string; userPhone: string }) {
  const sbRef = React.useRef<ReturnType<typeof createClient> | null>(null);
  const [wallet, setWallet] = React.useState<Wallet | null>(null);
  const [txs, setTxs] = React.useState<Txn[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [addOpen, setAddOpen] = React.useState(false);
  const [addAmount, setAddAmount] = React.useState("1000");
  const [adding, setAdding] = React.useState(false);
  const [addError, setAddError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const r = await fetch("/api/wallet");
    if (r.ok) {
      const d = await r.json();
      setWallet(d.wallet);
      setTxs(d.transactions ?? []);
    }
    setLoading(false);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  // Realtime updates
  React.useEffect(() => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const channel = sb
      .channel("wallet-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "wallet_transactions" }, () => load())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "user_wallets" }, () => load())
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [load]);

  async function addFunds() {
    const paise = Math.round(Number(addAmount) * 100);
    if (!Number.isFinite(paise) || paise < 10000) {
      setAddError("Minimum add amount is ₹100");
      return;
    }
    setAdding(true);
    setAddError(null);
    setSuccess(null);
    try {
      // Step 1: create Razorpay order
      const createRes = await fetch("/api/wallet/add-funds", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ step: "create", amountPaise: paise }),
      });
      const createData = await createRes.json();
      if (!createRes.ok || !createData.ok) {
        setAddError(createData?.error ?? "Could not create order");
        return;
      }
      // Step 2: load Razorpay and open checkout
      const ok = await loadRzp();
      if (!ok || !window.Razorpay) {
        setAddError("Razorpay failed to load");
        return;
      }
      const rzp = new window.Razorpay({
        key: createData.keyId,
        amount: createData.amount,
        currency: createData.currency,
        name: "HiVR Wallet",
        description: `Add ${formatPaise(paise)} to wallet`,
        order_id: createData.orderId,
        prefill: { name: userFullName, email: userEmail, contact: userPhone },
        theme: { color: "#0ea5e9" },
        handler: async (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          const verifyRes = await fetch("/api/wallet/add-funds", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({
              step: "verify",
              amountPaise: paise,
              orderId: resp.razorpay_order_id,
              paymentId: resp.razorpay_payment_id,
              signature: resp.razorpay_signature,
            }),
          });
          const verifyData = await verifyRes.json();
          if (verifyRes.ok && verifyData.ok) {
            setSuccess(`Added ${formatPaise(paise)} to your wallet`);
            setAddOpen(false);
            setAddAmount("1000");
            load();
          } else {
            setAddError(verifyData?.error ?? "Verification failed");
          }
        },
        modal: { ondismiss: () => setAdding(false) },
      });
      rzp.on("payment.failed", (r: any) => setAddError(r?.error?.description ?? "Payment failed"));
      rzp.open();
    } catch (e) {
      setAddError((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="grid place-items-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-primary" />HiVR Wallet
        </CardTitle>
        <CardDescription>
          Preload money for instant payments to freelancers. Funds sit in your HiVR wallet and are debited when you fund a workspace escrow.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {success && (
          <div className="flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />{success}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-gradient-to-br from-sky-50 to-indigo-50 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-700">Available balance</p>
            <p className="mt-1 font-display text-3xl font-bold text-sky-800">
              {wallet ? formatPaise(wallet.balance_paise) : "—"}
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total loaded</p>
            <p className="mt-1 font-display text-xl font-semibold text-emerald-600">
              {wallet ? formatPaise(wallet.lifetime_loaded_paise) : "—"}
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total spent</p>
            <p className="mt-1 font-display text-xl font-semibold text-rose-600">
              {wallet ? formatPaise(wallet.lifetime_spent_paise) : "—"}
            </p>
          </div>
        </div>

        {wallet?.is_frozen && (
          <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-xs text-rose-700">
            <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
            Wallet is frozen. Reason: {wallet.freeze_reason ?? "Contact support"}.
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setAddOpen((o) => !o)} disabled={wallet?.is_frozen}>
            <Plus className="h-3.5 w-3.5" /> Add money
          </Button>
          <Button variant="outline" disabled>
            <ArrowDownToLine className="h-3.5 w-3.5" /> Withdraw to bank
          </Button>
          <Button variant="ghost" size="sm" onClick={load}>
            <RefreshCw className="h-3 w-3" /> Refresh
          </Button>
        </div>

        {addOpen && (
          <div className="rounded-md border bg-muted/20 p-3">
            <p className="mb-2 text-xs font-semibold">Add money via Razorpay</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">₹</span>
              <Input
                type="number"
                value={addAmount}
                onChange={(e) => setAddAmount(e.target.value)}
                min={100}
                step={100}
                className="h-8 w-32 text-sm"
              />
              <span className="text-[10px] text-muted-foreground">min ₹100</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {[500, 1000, 2000, 5000, 10000].map((v) => (
                <Button key={v} size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setAddAmount(String(v))}>
                  ₹{v.toLocaleString()}
                </Button>
              ))}
            </div>
            {addError && <p className="mt-2 text-[11px] text-rose-600">{addError}</p>}
            <div className="mt-3 flex items-center gap-2">
              <Button size="sm" onClick={addFunds} disabled={adding}>
                {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Pay with Razorpay
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              Test card: <code className="rounded bg-muted px-1">4111 1111 1111 1111</code> · UPI: <code className="rounded bg-muted px-1">success@upi</code>
            </p>
          </div>
        )}

        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Recent transactions</p>
          {txs.length === 0 ? (
            <p className="rounded-md border border-dashed bg-muted/20 py-8 text-center text-xs text-muted-foreground">
              No transactions yet. Add money to your wallet to get started.
            </p>
          ) : (
            <div className="space-y-1">
              {txs.map((t) => {
                const meta = KIND_META[t.kind] ?? KIND_META.adjustment;
                const Icon = meta.icon;
                return (
                  <div key={t.id} className="flex items-center gap-2 rounded-md border bg-background p-2 text-xs">
                    <Icon className={cn("h-3.5 w-3.5 shrink-0", meta.tone)} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{meta.label}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {t.description ?? "—"} · {timeAgo(t.created_at)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={cn("font-mono text-[11px] font-semibold", t.direction === "credit" ? "text-emerald-600" : "text-rose-600")}>
                        {t.direction === "credit" ? "+" : "−"}{formatPaise(t.amount_paise)}
                      </p>
                      <p className="text-[9px] text-muted-foreground">bal {formatPaise(t.balance_after_paise)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
