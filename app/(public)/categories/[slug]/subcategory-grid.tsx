"use client";

import * as React from "react";
import Link from "next/link";
import { Search, Briefcase, Users, PlusCircle, X, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CategoryIcon } from "@/components/marketing/category-icon";
import { getSubcategoryIcons } from "@/lib/subcategory-icons";
import { WaitlistButton } from "./waitlist-button";

type Subcat = {
  id: string;
  slug: string;
  name: string;
  icon: string;
  description: string;
  tier: string;
  status?: string;
};

type Props = {
  subcategories: Subcat[];
  categorySlug: string;
  categoryName: string;
  taskCountByCat: Record<string, number>;
  gigCountByCat: Record<string, number>;
  parentStatus?: string;
  parentCategoryId?: string;
  signedIn?: boolean;
};

const TIERS = [
  { key: "all", label: "All" },
  { key: "micro_task", label: "Tier A" },
  { key: "role_engagement", label: "Tier B" },
] as const;

export function SubcategoryGrid({ subcategories, categorySlug, categoryName, taskCountByCat, gigCountByCat, parentStatus, parentCategoryId, signedIn }: Props) {
  const [activeTier, setActiveTier] = React.useState<string>("all");
  const [search, setSearch] = React.useState("");

  const isComingSoon = parentStatus !== "active";

  const filtered = React.useMemo(() => {
    let result = activeTier === "all" ? subcategories : subcategories.filter((c) => c.tier === activeTier);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => c.name.toLowerCase().includes(q));
    }
    return result;
  }, [subcategories, activeTier, search]);

  return (
    <section>
      <div className="mb-8 text-center">
        <h2 className="font-display text-3xl font-semibold tracking-tight">Explore {categoryName}</h2>
        <p className="mt-2 text-muted-foreground max-w-xl mx-auto">
          {isComingSoon
            ? "This category is coming soon. Join the waitlist to get notified when it launches."
            : "Choose a subcategory to explore tasks, gigs, direct-hire opportunities and more."}
        </p>
      </div>

      <div className="mb-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <div className="inline-flex items-center gap-1 rounded-lg border bg-background p-0.5 shadow-sm">
          {TIERS.map((t) => {
            const count = t.key === "all" ? subcategories.length : subcategories.filter((c) => c.tier === t.key).length;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTier(t.key)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  activeTier === t.key
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label} ({count})
              </button>
            );
          })}
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search subcategories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-background pl-8 pr-8 text-xs outline-none transition-colors focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          No subcategories match your search.
        </p>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((ch) => {
            const taskCount = taskCountByCat[ch.id] ?? 0;
            const gigCount = gigCountByCat[ch.id] ?? 0;
            return (
              <div key={ch.id} className="group block">
                <Card className="overflow-hidden border-0 bg-card shadow-sm ring-1 ring-border transition-all duration-300 hover:shadow-xl hover:ring-primary/30 hover:-translate-y-1">
                  {isComingSoon ? (
                    <div className="relative h-40 overflow-hidden bg-gradient-to-br from-amber-500/20 to-amber-600/30">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-2 text-amber-700">
                          <Clock className="h-8 w-8" />
                          <span className="text-xs font-medium">Coming soon</span>
                        </div>
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/40 to-transparent h-24" />
                      <div className="absolute bottom-3 left-3 flex items-center gap-2">
                        <div className="grid h-8 w-8 place-items-center rounded-lg bg-white/20 backdrop-blur-md text-white ring-1 ring-white/20">
                          <CategoryIcon name={ch.icon} className="h-4 w-4" />
                        </div>
                        <h3 className="font-display font-semibold text-white drop-shadow-sm">{ch.name}</h3>
                      </div>
                    </div>
                  ) : (
                    <Link href={`/categories/${ch.slug}`}>
                      <div className="relative h-40 overflow-hidden bg-gradient-to-br from-primary/10 to-primary/30 dark:from-primary/5 dark:to-primary/20">
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="relative h-24 w-24">
                            {(() => {
                              const all = getSubcategoryIcons(ch.name);
                              const n = Math.min(all.length, 6);
                              const r = 40;
                              const cx = 48, cy = 42;
                              return all.slice(0, 6).map((Icon, i) => {
                                const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
                                return (
                                  <div
                                    key={i}
                                    className="absolute grid h-6 w-6 place-items-center rounded-full bg-foreground/15 text-foreground/80 shadow-sm backdrop-blur-sm ring-1 ring-foreground/10 dark:bg-white/20 dark:text-white/80 dark:ring-white/20"
                                    style={{ left: cx + Math.cos(angle) * r - 12, top: cy + Math.sin(angle) * r - 12 }}
                                  >
                                    <Icon className="h-3 w-3" />
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent h-24" />
                        <div className="absolute bottom-2 right-3 rounded-full bg-white/15 backdrop-blur-sm px-2 py-0.5 text-[10px] font-medium text-white/90 ring-1 ring-white/20">
                          {gigCount} gig{gigCount === 1 ? "" : "s"}
                        </div>
                        <div className="absolute bottom-3 left-3 flex items-center gap-2">
                          <div className="grid h-8 w-8 place-items-center rounded-lg bg-white/20 backdrop-blur-md text-white ring-1 ring-white/20">
                            <CategoryIcon name={ch.icon} className="h-4 w-4" />
                          </div>
                          <h3 className="font-display font-semibold text-white drop-shadow-sm">{ch.name}</h3>
                        </div>
                      </div>
                    </Link>
                  )}

                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                        <CategoryIcon name={ch.icon} className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        {ch.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                            {ch.description}
                          </p>
                        )}
                      </div>
                      {!isComingSoon && (
                        <Button asChild size="sm" variant="ghost" className="h-8 w-8 p-0 shrink-0 self-start" title="View services">
                          <Link href={`/categories/${ch.slug}`}>
                            <PlusCircle className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t border-border/40">
                      {isComingSoon ? (
                        <div className="w-full">
                          <WaitlistButton categoryId={parentCategoryId ?? ch.id} signedIn={!!signedIn} />
                        </div>
                      ) : (
                        <>
                          <span className="text-[10px] text-muted-foreground">
                            {taskCount} open task{taskCount === 1 ? "" : "s"}
                          </span>
                          <div className="flex items-center gap-2">
                            <Button asChild size="sm" variant="outline" className="h-8 text-[11px]">
                              <Link href={`/browse?category=${ch.slug}`}>
                                <Briefcase className="mr-1 h-3 w-3" />
                                Browse tasks
                              </Link>
                            </Button>
                            <Button asChild size="sm" variant="outline" className="h-8 w-8 p-0" title="Find freelancers">
                              <Link href={`/find-people?skill=${ch.slug}`}>
                                <Users className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function cn(...inputs: (string | undefined | null | false)[]) {
  return inputs.filter(Boolean).join(" ");
}
