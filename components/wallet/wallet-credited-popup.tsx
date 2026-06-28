"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { CircleDollarSign, X } from "lucide-react";
import { formatINR } from "@/lib/utils";

export function WalletCreditedPopup({ userId }: { userId: string }) {
  const [show, setShow] = React.useState(false);
  const [amount, setAmount] = React.useState(0);
  const timerRef = React.useRef<ReturnType<typeof setTimeout>>();

  React.useEffect(() => {
    const sb = createClient();
    const channel = sb
      .channel("wallet-credit-popup")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "wallet_transactions",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const tx = payload.new as any;
          if (tx.kind === "escrow_release" || tx.kind === "add_funds") {
            const amt = Math.abs(Number(tx.amount_paise ?? 0));
            if (amt > 0) {
              setAmount(amt);
              setShow(true);
              if (timerRef.current) clearTimeout(timerRef.current);
              timerRef.current = setTimeout(() => setShow(false), 8000);
            }
          }
        },
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [userId]);

  if (!show) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] animate-in slide-in-from-right-10 fade-in">
      <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 pr-12 shadow-lg dark:border-emerald-800 dark:bg-emerald-950">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-emerald-500/20 text-emerald-600">
          <CircleDollarSign className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">Amount credited!</p>
          <p className="text-xs text-emerald-700 dark:text-emerald-300">
            {formatINR(amount)} added to your wallet
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShow(false)}
          className="absolute right-3 top-3 rounded-full p-0.5 text-emerald-500 hover:bg-emerald-200 dark:hover:bg-emerald-800"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
