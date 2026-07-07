"use client";

import Link from "next/link";
import { Clock, Sparkles, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "./category-icon";

type Cat = {
  id: string;
  slug: string;
  name: string;
  icon: string;
  description: string;
  tier: string;
};

export function ComingSoonZone({
  comingParents,
}: {
  comingParents: Cat[];
}) {
  if (comingParents.length === 0) return null;

  const gradients: Record<string, string> = {
    design: "from-pink-500/10 via-fuchsia-500/5 to-transparent",
    "video-editing": "from-orange-500/10 via-amber-500/5 to-transparent",
    "finance-accounts": "from-emerald-500/10 via-teal-500/5 to-transparent",
    "virtual-assistant": "from-violet-500/10 via-purple-500/5 to-transparent",
    "content-copywriting": "from-amber-500/10 via-yellow-500/5 to-transparent",
    translation: "from-cyan-500/10 via-blue-500/5 to-transparent",
  };

  return (
    <section className="relative border-t border-border/50 py-20">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-background via-background to-muted/30" />

      <div className="mx-auto max-w-7xl px-4">
        {/* Section header */}
        <div className="mb-12 text-center">
          <Badge
            variant="outline"
            className="border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400"
          >
            <Sparkles className="mr-1 h-3 w-3" />
            Coming soon
          </Badge>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            More categories on the horizon
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-muted-foreground">
            We launch one new category every month based on real demand. Join the
            waitlist to be the first to know when yours goes live.
          </p>
        </div>

        {/* Cards grid */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {comingParents.map((cat) => {
            const grad =
              gradients[cat.slug] ??
              "from-primary/10 via-primary/5 to-transparent";
            return (
              <Link
                key={cat.id}
                href={`/categories/${cat.slug}?waitlist=1`}
                className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg"
              >
                <div
                  className={cn(
                    "pointer-events-none absolute inset-0 -z-10 opacity-60 transition-opacity group-hover:opacity-100",
                    "bg-gradient-to-br",
                    grad
                  )}
                />
                <div className="flex items-start justify-between gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border/50 bg-muted/50">
                    <CategoryIcon
                      name={cat.icon}
                      className="h-5 w-5 text-foreground/70"
                    />
                  </div>
                  <Badge
                    variant="outline"
                    className="shrink-0 border-amber-500/20 bg-amber-500/10 text-[9px] text-amber-700 dark:text-amber-400"
                  >
                    <Clock className="mr-1 h-2.5 w-2.5" />
                    Soon
                  </Badge>
                </div>

                <h3 className="mt-4 font-display text-lg font-semibold text-foreground">
                  {cat.name}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {cat.description}
                </p>

                <div className="mt-4 flex items-center gap-1.5 text-xs font-medium text-primary">
                  <span>Join waitlist</span>
                  <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            );
          })}
        </div>

      </div>
    </section>
  );
}
