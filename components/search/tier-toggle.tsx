"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Zap, Briefcase, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

type Tier = "all" | "micro_task" | "role_engagement";

export type TierToggleProps = {
  value?: Tier;
  onChange?: (tier: Tier) => void;
  className?: string;
  asUrlParams?: boolean;
  paramName?: string;
  size?: "sm" | "md";
  showAll?: boolean;
};

export function TierToggle({
  value,
  onChange,
  className,
  asUrlParams = false,
  paramName = "tier",
  size = "md",
  showAll = true,
}: TierToggleProps) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const current: Tier = value ?? (asUrlParams ? (sp.get(paramName) as Tier) || "all" : "all");

  const pick = (t: Tier) => {
    if (!asUrlParams) {
      onChange?.(t);
      return;
    }
    const next = new URLSearchParams(sp.toString());
    if (t === "all") next.delete(paramName);
    else next.set(paramName, t);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const wrap = size === "sm" ? "h-8 p-0.5" : "h-10 p-1";
  const btn = size === "sm" ? "h-7 px-2.5 text-[11px]" : "h-8 px-3 text-sm";

  return (
    <div className={cn("inline-flex items-center gap-1 rounded-lg border bg-muted p-0.5", className)} role="tablist" aria-label="Tier filter">
      {showAll && (
        <button
          type="button"
          role="tab"
          aria-selected={current === "all"}
          onClick={() => pick("all")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md font-medium transition-all",
            btn,
            current === "all"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Layers className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
          All
        </button>
      )}
      <button
        type="button"
        role="tab"
        aria-selected={current === "micro_task"}
        onClick={() => pick("micro_task")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md font-medium transition-all",
          btn,
          current === "micro_task"
            ? "bg-sky-500/15 text-sky-700 shadow-sm dark:text-sky-300"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Zap className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
        Tier A
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={current === "role_engagement"}
        onClick={() => pick("role_engagement")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md font-medium transition-all",
          btn,
          current === "role_engagement"
            ? "bg-violet-500/15 text-violet-700 shadow-sm dark:text-violet-300"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Briefcase className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
        Tier B
      </button>
    </div>
  );
}
