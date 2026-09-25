"use client";

import * as React from "react";
import Link from "next/link";
import { Briefcase, ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function ProfileGigsSection({ gigs }: { gigs: any[] }) {
  const [showAll, setShowAll] = React.useState(false);
  const [filterSkill, setFilterSkill] = React.useState("");

  const skillNames = React.useMemo(() => {
    const names = new Set<string>();
    gigs.forEach((g: any) => { if (g.category?.name) names.add(g.category.name); });
    return Array.from(names);
  }, [gigs]);

  const filtered = React.useMemo(() => {
    if (!filterSkill) return gigs;
    return gigs.filter((g: any) => g.category?.name === filterSkill);
  }, [gigs, filterSkill]);

  const displayed = showAll ? filtered : filtered.slice(0, 4);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Briefcase className="h-4 w-4" /> My Gigs
            <span className="text-xs font-normal text-muted-foreground">({filtered.length})</span>
          </CardTitle>
          {skillNames.length > 1 && (
            <div className="relative">
              <select
                value={filterSkill}
                onChange={(e) => setFilterSkill(e.target.value)}
                className="appearance-none rounded-md border border-input bg-background px-3 py-1 pr-7 text-[11px] font-medium text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
              >
                <option value="">All skills</option>
                {skillNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {displayed.map((g: any) => {
            const imgSrc = (g.images ?? []).length > 0 ? g.images[0] : null;
            return (
              <Link
                key={g.id}
                href={`/gigs/${g.slug}`}
                className="group block overflow-hidden rounded-lg border bg-card transition-shadow hover:shadow-md"
              >
                {imgSrc ? (
                  <div className="aspect-[16/9] w-full overflow-hidden bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imgSrc} alt={g.title} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                  </div>
                ) : (
                  <div className="flex aspect-[16/9] w-full items-center justify-center bg-muted/40">
                    <Briefcase className="h-8 w-8 text-muted-foreground/40" />
                  </div>
                )}
                <div className="p-3">
                  <p className="text-sm font-semibold truncate group-hover:text-primary transition-colors">{g.title}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground capitalize">{g.category?.name ?? "General"}</p>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="font-medium text-emerald-600">
                      ₹{(g.price ?? g.package_basic_price ?? 0) / 100}
                    </span>
                    <span className="text-muted-foreground">{g.delivery_days ?? "—"} days</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
        {filtered.length > 4 && (
          <div className="mt-4 text-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAll(!showAll)}
            >
              {showAll ? "Show less" : `View all (${filtered.length})`}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}