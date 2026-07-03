"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Users } from "lucide-react";
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
  sort_order: number;
};

export function CategoryGrid({ categories }: { categories: Cat[] }) {
  const active = categories.filter(c => c.status === "active");
  const coming = categories.filter(c => c.status === "coming_soon");

  return (
    <div className="space-y-10">
      <div>
        <div className="mb-4 flex items-center gap-2">
          <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          <h3 className="font-display text-lg font-semibold">Live now</h3>
          <span className="text-sm text-muted-foreground">— full skill test, real wage bands, real contracts.</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((c, i) => <CategoryCard key={c.id} c={c} index={i} />)}
        </div>
      </div>

      {coming.length > 0 && (
        <div>
          <div className="mb-4 flex items-center gap-2">
            <span className="inline-flex h-2 w-2 rounded-full bg-amber-500" />
            <h3 className="font-display text-lg font-semibold">Launching this quarter</h3>
            <span className="text-sm text-muted-foreground">— join the waitlist to be first when we go live.</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {coming.map((c, i) => <CategoryCard key={c.id} c={c} index={i} compact />)}
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryCard({ c, index, compact = false }: { c: Cat; index: number; compact?: boolean }) {
  const href = `/categories/${c.slug}`;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.25, delay: index * 0.04, ease: "easeOut" }}
    >
      <Link href={href} className="group block">
        <Card className={cn("h-full transition-all duration-200 hover:shadow-md group-hover:border-primary/40", compact && "bg-muted/20")}>
          <CardContent className="flex h-full flex-col gap-3 p-5">
            <div className="flex items-start justify-between">
              <div className={cn(
                "grid h-10 w-10 place-items-center rounded-lg",
                c.status === "active"
                  ? "bg-primary/10 text-primary"
                  : "bg-amber-500/10 text-amber-700 dark:text-amber-300",
              )}>
                <CategoryIcon name={c.icon} className="h-5 w-5" />
              </div>
              {c.status === "active" ? <Badge variant="live">Live</Badge> : <Badge variant="soon">Soon</Badge>}
            </div>
            <div>
              <h4 className="font-display text-base font-semibold leading-snug">{c.name}</h4>
              <p className={cn("mt-1 text-sm text-muted-foreground", compact && "line-clamp-2")}>{c.description}</p>
            </div>
            <div className="mt-auto flex items-center justify-between pt-2">
              <Badge variant={c.tier === "role_engagement" ? "tierB" : "tierA"}>
                {c.tier === "role_engagement" ? "Tier B · Role" : "Tier A · Micro"}
              </Badge>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                {c.status === "active" ? "Browse" : "Join waitlist"} <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );
}
