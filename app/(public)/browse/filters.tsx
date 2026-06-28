"use client";

import * as React from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CategoryIcon } from "@/components/marketing/category-icon";
import { cn } from "@/lib/utils";

type Cat = { id: string; slug: string; name: string; icon: string; tier: string; status: string; parent_category_id: string | null };

/**
 * Left-panel category list. Shows a "N open" badge next to each category
 * that has live tasks so buyers can see at a glance where the work is.
 */
export function BrowseFilters({
  categories,
  initial,
  openTaskCounts = {},
}: {
  categories: Cat[];
  initial: { category?: string; q?: string };
  /** Map of category_id → number of currently-open tasks in that category. */
  openTaskCounts?: Record<string, number>;
}) {
  // Group children by parent for subcategory rendering.
  // Counts are already pre-rolled in the server component (children summed into parent).
  const childrenByParent: Record<string, Cat[]> = {};
  for (const c of categories) {
    if (c.parent_category_id) {
      (childrenByParent[c.parent_category_id] ??= []).push(c);
    }
  }
  // Total = sum of only parent categories (children already included in parent's count).
  const totalCount = categories
    .filter(c => !c.parent_category_id && c.status === "active")
    .reduce((s, c) => s + (openTaskCounts[c.id] ?? 0), 0);

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      {/* Fixed header */}
      <div className="flex shrink-0 items-center justify-between border-b bg-card px-4 py-3">
        <h2 className="text-sm font-semibold">Categories</h2>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
          {totalCount}
        </span>
      </div>

      {/* Scrollable category list */}
      <div className="scrollbar-thin flex-1 overflow-y-auto p-2">
        {/* "All categories" link */}
        <Link
          href={initial.q ? `/browse?q=${encodeURIComponent(initial.q)}` : "/browse"}
          className={cn(
            "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent",
            !initial.category && "bg-accent font-medium text-foreground",
          )}
        >
          <span className="grid h-5 w-5 place-items-center rounded text-[10px] font-bold text-muted-foreground">All</span>
          <span className="truncate flex-1">All categories</span>
          {totalCount > 0 && (
            <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
              {totalCount}
            </span>
          )}
        </Link>

        {/* Per-category list with live counts */}
        {categories
          .filter(c => c.parent_category_id === null && c.status === "active")
          .map(p => {
            const subs = childrenByParent[p.id] ?? [];
            const pCount = openTaskCounts[p.id] ?? 0;
            return (
              <React.Fragment key={p.id}>
                <Link
                  href={buildCategoryHref(p.slug, initial)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent",
                    initial.category === p.slug && "bg-accent font-medium text-foreground",
                  )}
                >
                  <CategoryIcon name={p.icon} className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate flex-1">{p.name}</span>
                  {pCount > 0 && (
                    <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                      {pCount}
                    </span>
                  )}
                </Link>
                {/* Subcategories (indented) */}
                {subs.map(s => {
                  const sCount = openTaskCounts[s.id] ?? 0;
                  return (
                    <Link
                      key={s.id}
                      href={buildCategoryHref(s.slug, initial)}
                      className={cn(
                        "ml-3 flex items-center gap-2 rounded-md border-l-2 border-transparent px-2 py-1 pl-3 text-[13px] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent hover:text-foreground",
                        initial.category === s.slug && "border-primary bg-accent font-medium text-foreground",
                      )}
                    >
                      <span className="truncate flex-1">{s.name}</span>
                      {sCount > 0 && (
                        <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          {sCount}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </React.Fragment>
            );
          })}

        {/* Coming-soon parents (greyed out, no counts) */}
        {categories
          .filter(c => c.parent_category_id === null && c.status === "coming_soon")
          .map(p => (
            <Link
              key={p.id}
              href={`/categories/${p.slug}`}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent"
            >
              <CategoryIcon name={p.icon} className="h-4 w-4 opacity-50" />
              <span className="truncate flex-1">{p.name}</span>
              <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                soon
              </span>
            </Link>
          ))}
      </div>
    </Card>
  );
}

function buildCategoryHref(slug: string, initial: { q?: string }): string {
  const params = new URLSearchParams();
  params.set("category", slug);
  if (initial.q) params.set("q", initial.q);
  return `/browse?${params.toString()}`;
}
