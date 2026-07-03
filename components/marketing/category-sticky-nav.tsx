"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "./category-icon";
import { ChevronDown, ArrowRight, Briefcase } from "lucide-react";

type Cat = {
  id: string;
  slug: string;
  name: string;
  icon: string;
  tier: string;
};

export function CategoryStickyNav({
  activeParents,
  childrenByParent,
}: {
  activeParents: Cat[];
  childrenByParent: Record<string, { id: string; slug: string; name: string }[]>;
}) {
  const [visible, setVisible] = React.useState(false);
  const [hovered, setHovered] = React.useState<string | null>(null);

  React.useEffect(() => {
    const hero = document.getElementById("categories-hero");
    if (!hero) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  if (activeParents.length === 0) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -20, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="sticky top-14 z-40 border-b border-border/50 bg-background/95 shadow-sm backdrop-blur-xl supports-[backdrop-filter]:bg-background/80"
        >
          <div className="mx-auto flex max-w-7xl items-center gap-0 overflow-x-auto px-4 hide-scrollbar">
            {activeParents.map((cat) => {
              const subs = childrenByParent[cat.id] ?? [];
              return (
                <div
                  key={cat.id}
                  className="relative shrink-0"
                  onMouseEnter={() => setHovered(cat.id)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <Link
                    href={`/categories/${cat.slug}`}
                    className={cn(
                      "flex items-center gap-1.5 border-b-2 border-transparent px-3 py-3 text-[13px] font-medium text-muted-foreground transition-all hover:border-primary/40 hover:text-foreground whitespace-nowrap",
                      hovered === cat.id && "border-primary/40 text-foreground"
                    )}
                  >
                    <CategoryIcon name={cat.icon} className="h-4 w-4" />
                    {cat.name}
                    {subs.length > 0 && (
                      <ChevronDown className={cn("h-3 w-3 text-muted-foreground/50 transition-transform", hovered === cat.id && "rotate-180")} />
                    )}
                  </Link>

                  {/* Subcategory dropdown */}
                  {hovered === cat.id && subs.length > 0 && (
                    <div
                      className="absolute left-0 top-full z-50 min-w-[220px] animate-fadeIn rounded-xl border border-border/50 bg-background/95 p-2 shadow-2xl shadow-black/20 backdrop-blur-xl"
                      onMouseEnter={() => setHovered(cat.id)}
                      onMouseLeave={() => setHovered(null)}
                    >
                      <p className="px-2.5 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                        Subcategories
                      </p>
                      {subs.map((s) => (
                        <Link
                          key={s.id}
                          href={`/categories/${s.slug}`}
                          className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-sm text-foreground/70 transition-colors hover:bg-muted/50 hover:text-foreground"
                        >
                          <span>{s.name}</span>
                          <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground/40" />
                        </Link>
                      ))}
                      <div className="mt-1 border-t border-border/30 pt-1">
                        <Link
                          href={`/categories/${cat.slug}`}
                          className="flex items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/5"
                        >
                          View all <ArrowRight className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <style jsx>{`
            :global(.hide-scrollbar) {
              scrollbar-width: none;
              -ms-overflow-style: none;
            }
            :global(.hide-scrollbar::-webkit-scrollbar) {
              display: none;
            }
            @keyframes fadeIn { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }
            :global(.animate-fadeIn) { animation:fadeIn 0.15s ease-out; }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
