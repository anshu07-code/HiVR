"use client";

import * as React from "react";
import { Gift, X, ArrowRight, Wallet } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatINR } from "@/lib/utils";

export function PaymentNotificationBanner({ userId }: { userId: string }) {
  const [banner, setBanner] = React.useState<{ title: string; body: string; amount: number; link: string } | null>(null);

  React.useEffect(() => {
    const sb = createClient();
    const channel = sb
      .channel(`payment-banner-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload: any) => {
          const n = payload.new as any;
          if (n.user_id !== userId) return;
          if (n.type === "payment_released" || n.type === "payment_captured") {
            const match = n.body?.match(/₹([\d,.]+)/);
            const amount = match ? parseFloat(match[1].replace(/,/g, "")) * 100 : 0;
            setBanner({
              title: n.title ?? "Payment received",
              body: n.body ?? "A payment has been credited to your wallet.",
              amount,
              link: n.link ?? "/dashboard/payments",
            });
          }
        },
      )
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [userId]);

  if (!banner) return null;

  return (
    <div className="relative overflow-hidden rounded-lg border border-emerald-500/30 bg-gradient-to-r from-emerald-50 to-emerald-100/50 dark:from-emerald-950/30 dark:to-emerald-900/20">
      <div className="flex items-center gap-4 px-5 py-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-500/20 text-emerald-600">
          <Wallet className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
            {banner.title}
          </p>
          <p className="text-xs text-emerald-700 dark:text-emerald-300">
            {banner.body}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={banner.link}
            className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
          >
            View details <ArrowRight className="h-3 w-3" />
          </Link>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="rounded-full p-1 text-emerald-500 hover:bg-emerald-200 dark:hover:bg-emerald-800"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
