"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Gift, Wallet, ArrowDownToLine, CheckCircle2, Sparkles, ArrowUpRight, IndianRupee } from "lucide-react";
import { formatPaise, timeAgo } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const KIND_META: Record<string, { label: string; icon: any; tone: string }> = {
  escrow_release: { label: "Payment received", icon: CheckCircle2, tone: "text-emerald-600 bg-emerald-500/10" },
  add_funds: { label: "Funds added", icon: Wallet, tone: "text-sky-600 bg-sky-500/10" },
  signup_bonus: { label: "Signup bonus", icon: Gift, tone: "text-emerald-600 bg-emerald-500/10" },
  withdrawal: { label: "Withdrawal", icon: ArrowDownToLine, tone: "text-rose-600 bg-rose-500/10" },
  incentive: { label: "Incentive", icon: Sparkles, tone: "text-amber-600 bg-amber-500/10" },
  tip: { label: "Tip received", icon: Gift, tone: "text-amber-600 bg-amber-500/10" },
  default: { label: "Transaction", icon: IndianRupee, tone: "text-muted-foreground bg-muted" },
};

export function WalletTransactionsList({ userId, initial, compact }: { userId: string; initial: any[]; compact?: boolean }) {
  const [txns, setTxns] = React.useState(initial);

  React.useEffect(() => {
    const sb = createClient();
    const channel = sb
      .channel(`wallet-txns-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "wallet_transactions", filter: `user_id=eq.${userId}` },
        async () => {
          const { data } = await sb
            .from("wallet_transactions")
            .select("id, amount_paise, kind, description, created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(20);
          if (data) setTxns(data);
        },
      )
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [userId]);

  const display = compact ? txns.slice(0, 5) : txns;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4 text-primary" />
          {compact ? "Recent transactions" : "Wallet transactions"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {txns.length === 0 ? (
          <p className="text-sm text-muted-foreground">No transactions yet.</p>
        ) : (
          <div className="space-y-1">
            {display.map((t: any) => {
              const meta = KIND_META[t.kind] ?? KIND_META.default;
              const Icon = meta.icon;
              const isCredit = !["withdrawal"].includes(t.kind);
              return (
                <Link
                  key={t.id}
                  href="/dashboard/payments"
                  className="group flex items-center gap-3 rounded-md border bg-background p-2.5 transition-colors hover:border-primary/40 hover:bg-accent"
                >
                  <div className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full", meta.tone)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.description ?? meta.label}</p>
                    <p className="text-[10px] text-muted-foreground">{timeAgo(t.created_at)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={cn("font-mono text-sm font-semibold", isCredit ? "text-emerald-600" : "text-rose-600")}>
                      {isCredit ? "+" : "−"}{formatPaise(Math.abs(t.amount_paise ?? 0))}
                    </p>
                    <Badge variant="outline" className="text-[9px] capitalize">
                      {meta.label}
                    </Badge>
                  </div>
                  <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
                </Link>
              );
            })}
          </div>
        )}
        {compact && txns.length > 5 && (
          <Link
            href="/dashboard/payments"
            className="mt-3 block text-center text-xs font-medium text-primary hover:underline"
          >
            View all {txns.length} transactions →
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
