"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Loader2, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatPaise } from "@/lib/utils";

type RateRange = {
  min_paise: number | null;
  max_paise: number | null;
  sample_count: number;
  source: string;
};

export function MarketRateWarning({
  categoryId, tier, budgetMinPaise, budgetMaxPaise,
}: {
  categoryId: string;
  tier: "micro_task" | "role_engagement";
  budgetMinPaise: number;
  budgetMaxPaise: number;
}) {
  const [range, setRange] = React.useState<RateRange | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!categoryId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const sb = createClient();
    (sb.rpc as any)("get_market_rate_range", { p_category_id: categoryId, p_tier: tier, p_size_bucket: "standard" })
      .then(({ data, error: err }: any) => {
        if (cancelled) return;
        if (err) { setError(err.message ?? "Failed to fetch rate"); setRange(null); return; }
        const rows = Array.isArray(data) ? data : data ? [data] : [];
        if (rows.length === 0) { setRange(null); return; }
        const r = rows[0];
        setRange({
          min_paise: r.min_paise != null ? Number(r.min_paise) : null,
          max_paise: r.max_paise != null ? Number(r.max_paise) : null,
          sample_count: Number(r.sample_count ?? 0),
          source: r.source ?? "wage_band",
        });
      })
      .catch((e: any) => { if (!cancelled) setError(e?.message ?? "Failed to fetch rate"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [categoryId, tier]);

  if (loading) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />Checking market rate…
      </p>
    );
  }
  if (error) {
    return <p className="text-xs text-muted-foreground">Could not load market rate.</p>;
  }
  if (!range || range.min_paise == null || range.max_paise == null) {
    return null;
  }
  const min = range.min_paise;
  const max = range.max_paise;
  const halfMin = min * 0.5;

  if (budgetMaxPaise < halfMin) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div>
          <p className="font-semibold text-destructive">Way below market rate — most employees won’t apply</p>
          <p className="mt-0.5 text-muted-foreground">
            Your max of {formatPaise(budgetMaxPaise)} is less than half of the typical minimum ({formatPaise(min)})
            for {tier === "role_engagement" ? "role engagements" : "micro-tasks"} in this category.
            Employees in this category typically charge {formatPaise(min)}–{formatPaise(max)}.
          </p>
        </div>
      </div>
    );
  }
  if (budgetMaxPaise < min) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div>
          <p className="font-semibold text-amber-700">Low chance of acceptance</p>
          <p className="mt-0.5 text-muted-foreground">
            Your max of {formatPaise(budgetMaxPaise)} is below the typical minimum of {formatPaise(min)}
            for this category. Employees in this category typically charge {formatPaise(min)}–{formatPaise(max)}.
          </p>
        </div>
      </div>
    );
  }
  if (budgetMinPaise > max) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <div>
          <p className="font-semibold text-emerald-700">Above market — strong fit for premium employees</p>
          <p className="mt-0.5 text-muted-foreground">
            Your budget of {formatPaise(budgetMinPaise)}–{formatPaise(budgetMaxPaise)} is above the typical
            range of {formatPaise(min)}–{formatPaise(max)} for this category.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      <div>
        <p className="font-semibold text-emerald-700 inline-flex items-center gap-1">
          <TrendingUp className="h-3 w-3" />
          Your budget looks reasonable for this category
        </p>
        <p className="mt-0.5 text-muted-foreground">
          Market range: {formatPaise(min)}–{formatPaise(max)}
          {range.sample_count > 0 && <> · based on {range.sample_count} recent contract{range.sample_count === 1 ? "" : "s"}</>}
          {range.source === "wage_band" && <> · category default</>}.
        </p>
      </div>
    </div>
  );
}
