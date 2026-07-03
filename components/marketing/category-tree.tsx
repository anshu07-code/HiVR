"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CategoryTier, CategoryStatus } from "@/lib/supabase/types";
import { CategoryIcon } from "./category-icon";

type Cat = {
  id: string;
  slug: string;
  name: string;
  icon: string;
  description: string;
  tier: CategoryTier;
  status: CategoryStatus;
  parent_category_id: string | null;
};

export function CategoryTree({
  parents,
  childrenByParent,
  openTaskCounts,
}: {
  parents: Cat[];
  childrenByParent: Record<string, Cat[]>;
  /** Map of category_id → number of currently-open tasks. Used to surface
   *  "3 open" badges on each parent + child so buyers can see at a glance
   *  where the live work is. */
  openTaskCounts?: Record<string, number>;
}) {
  return (
    <div className="space-y-6">
      {parents.map((p, i) => {
        const subs = childrenByParent[p.id] ?? [];
        return (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.25, delay: i * 0.03, ease: "easeOut" }}
          >
            <Card className={cn(p.status !== "active" && "bg-muted/20")}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "grid h-10 w-10 place-items-center rounded-lg",
                    p.status === "active" ? "bg-primary/10 text-primary" : "bg-amber-500/10 text-amber-700 dark:text-amber-300",
                  )}>
                    <CategoryIcon name={p.icon} className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-semibold leading-snug">{p.name}</h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">{p.description}</p>
                    {(p as any).wage_band_min_paise && (p as any).wage_band_max_paise && (
                      <p className="mt-1 text-xs font-medium text-foreground">
                        Typical: ₹{Math.round((p as any).wage_band_min_paise / 100).toLocaleString("en-IN")} – ₹{Math.round((p as any).wage_band_max_paise / 100).toLocaleString("en-IN")}
                        <span className="ml-1 text-muted-foreground">/ {p.tier === "role_engagement" ? "day" : "hr"}</span>
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  {p.status === "active" ? <Badge variant="live">Live</Badge> : <Badge variant="soon">Soon</Badge>}
                  <Badge variant={p.tier === "role_engagement" ? "tierB" : "tierA"}>
                    {p.tier === "role_engagement" ? "Tier B" : "Tier A"}
                  </Badge>
                  {p.status === "active" && (openTaskCounts?.[p.id] ?? 0) > 0 && (
                    <Badge variant="outline" className="font-mono text-[10px] bg-primary/5 text-primary border-primary/30">
                      {openTaskCounts![p.id]} open
                    </Badge>
                  )}
                </div>
                </div>

                {subs.length > 0 && (
                  <div className="mt-4 border-t pt-4">
                    <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                      {subs.length} subcategor{subs.length === 1 ? "y" : "ies"}
                    </p>
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {subs.map(s => {
                        const exclusion = extractExclusion(s.description);
                        return (
                          <li key={s.id}>
                            <div className="rounded-md border p-3 text-sm">
                              <div className="font-medium">{s.name}</div>
                              <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{stripExclusion(s.description)}</p>
                              {exclusion && (
                                <details className="mt-2">
                                  <summary className="cursor-pointer text-[10px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground">
                                    <Info className="mr-1 inline h-3 w-3" />What's excluded
                                  </summary>
                                  <p className="mt-1 text-xs text-muted-foreground">{exclusion}</p>
                                </details>
                              )}
                              {s.status === "active" ? (
                                <div className="mt-2 flex items-center justify-between">
                                  <Link
                                    href={`/categories/${s.slug}`}
                                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                                  >
                                    See tasks <ArrowRight className="h-3 w-3" />
                                  </Link>
                                  {(openTaskCounts?.[s.id] ?? 0) > 0 && (
                                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                                      {openTaskCounts![s.id]} open
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <Link
                                  href={`/categories/${s.slug}?waitlist=1`}
                                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300 hover:underline"
                                >
                                  Join waitlist <ArrowRight className="h-3 w-3" />
                                </Link>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}

function extractExclusion(desc: string | null | undefined): string {
  if (!desc) return "";
  const m = desc.match(/(EXCLUDED[^.]*\.|EXPLICITLY EXCLUDED[^.]*\.)/i);
  return m ? m[0] : "";
}

function stripExclusion(desc: string | null | undefined): string {
  if (!desc) return "";
  return desc.replace(/(EXCLUDED[^.]*\.|EXPLICITLY EXCLUDED[^.]*\.)/i, "").trim();
}
