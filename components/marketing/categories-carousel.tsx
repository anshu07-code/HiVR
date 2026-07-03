"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ArrowRight, Briefcase } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "./category-icon";
import { WallPattern, catTheme } from "./brick-wall-gallery";

type Cat = {
  id: string;
  slug: string;
  name: string;
  icon: string;
  description: string;
  tier: string;
  status: string;
  parent_category_id: string | null;
  wage_band_min_paise?: number;
  wage_band_max_paise?: number;
};

/* (WallPattern, catTheme imported from brick-wall-gallery.tsx) */

export function CategoriesCarousel({ activeParents, childrenByParent, openTaskCounts }: {
  activeParents: Cat[]; childrenByParent: Record<string, Cat[]>; openTaskCounts?: Record<string, number>;
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(true);
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);

  const update = React.useCallback(() => {
    const el = scrollRef.current; if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  React.useEffect(() => {
    const el = scrollRef.current; if (!el) return; update();
    el.addEventListener("scroll", update, { passive: true });
    return () => el.removeEventListener("scroll", update);
  }, [update]);

  function scrollBy(by: number) { scrollRef.current?.scrollBy({ left: by, behavior: "smooth" }); }
  const cardWidth = 280, scrollAmount = cardWidth * 2 + 16;
  if (activeParents.length === 0) return null;

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-0 -z-10 rounded-2xl overflow-hidden">
        <WallPattern />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,transparent_35%,rgba(0,0,0,0.06)_100%)] dark:bg-[radial-gradient(ellipse_at_50%_30%,transparent_30%,rgba(0,0,0,0.16)_100%)]" />
      </div>

      <button type="button" aria-label="Scroll left"
        className={cn("group absolute -left-3 top-1/3 z-10 hidden -translate-y-1/2 rounded-full border border-border bg-background/90 p-2.5 shadow-lg transition-all hover:border-primary/40 hover:bg-primary/5 hover:shadow-primary/10 md:block", !canScrollLeft && "pointer-events-none opacity-0")}
        onClick={() => scrollBy(-scrollAmount)}><ChevronLeft className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-primary" /></button>

      <div ref={scrollRef} className="hide-scrollbar -mx-1 flex gap-4 overflow-x-auto px-1 pb-2 pt-1" onMouseLeave={() => setHoveredId(null)}>
        {activeParents.map(cat => {
          const subs = childrenByParent[cat.id] ?? [];
          const taskCount = openTaskCounts?.[cat.id] ?? 0;
          const isHovered = hoveredId === cat.id;
          const t = catTheme(cat.slug);

          return (
            <div key={cat.id} className="relative shrink-0" style={{ width: cardWidth }}
              onMouseEnter={() => setHoveredId(cat.id)} onFocus={() => setHoveredId(cat.id)}>
              <Link href={`/categories/${cat.slug}`}
                className={cn("group/card relative block h-full overflow-hidden rounded-2xl border transition-all duration-300 bg-card",
                  isHovered ? "border-primary/40 -translate-y-0.5" : "border-border/60 hover:border-foreground/20 hover:-translate-y-0.5")}
                style={{ boxShadow:"0 1px 3px rgba(0,0,0,0.12),0 4px 12px rgba(0,0,0,0.10),0 12px 28px rgba(0,0,0,0.08)" }}>
                <div className="relative h-36 overflow-hidden bg-card">
                  <img src={`https://picsum.photos/seed/${cat.slug}/400/200`} alt={cat.name}
                    className="absolute inset-0 h-full w-full object-cover p-2" loading="lazy" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="grid h-12 w-12 place-items-center rounded-xl border border-white/20 bg-black/20 shadow-lg backdrop-blur-sm transition-all duration-300 group-hover/card:scale-110"
                      style={{ boxShadow:`0 0 16px ${t.icon}60, 0 0 40px ${t.icon}30` }}>
                      <span style={{ color: t.icon }}>
                        <CategoryIcon name={cat.icon} className="h-6 w-6 drop-shadow-md" />
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col p-4 pt-3">
                  <h3 className="font-display text-base font-semibold text-foreground">{cat.name}</h3>
                  <p className="mt-1 line-clamp-2 text-sm leading-snug text-muted-foreground">{cat.description}</p>
                  <div className="flex-1" />
                  <div className="mt-3 flex items-center justify-between">
                    <Badge variant="outline" className={cn("border-foreground/10 text-[10px] font-medium",
                      cat.tier==="role_engagement"?"bg-purple-500/10 text-purple-600 dark:text-purple-400":"bg-emerald-500/10 text-emerald-600 dark:text-emerald-400")}>
                      {cat.tier==="role_engagement"?"Role":"Micro"}</Badge>
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary opacity-0 transition-opacity group-hover/card:opacity-100">
                      Browse <ArrowRight className="h-3 w-3" /></span>
                  </div>
                </div>
              </Link>
              {subs.length>0 && isHovered && (
                <div className="absolute left-0 right-0 top-full z-20 mt-2 animate-fadeIn">
                  <div className="rounded-xl border border-border/50 bg-background/95 p-3 shadow-2xl shadow-black/20 backdrop-blur-md">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Subcategories</p>
                    <ul className="space-y-0.5">{subs.map(s=>
                      <li key={s.id}><Link href={`/categories/${s.slug}`}
                        className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm text-foreground/70 transition-colors hover:bg-muted/30 hover:text-foreground">
                        <span>{s.name}</span>
                        {openTaskCounts?.[s.id] && openTaskCounts[s.id] > 0
                          ? <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">{openTaskCounts[s.id]} open</span>
                          : <Briefcase className="h-3 w-3 shrink-0 text-muted-foreground/50" />}
                      </Link></li>)}
                    </ul>
                    <Link href={`/categories/${cat.slug}`}
                      className="mt-2 flex items-center justify-center gap-1 rounded-lg border border-border/50 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary">
                      View all <ArrowRight className="h-3 w-3" /></Link>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button type="button" aria-label="Scroll right"
        className={cn("group absolute -right-3 top-1/3 z-10 hidden -translate-y-1/2 rounded-full border border-border bg-background/90 p-2.5 shadow-lg transition-all hover:border-primary/40 hover:bg-primary/5 hover:shadow-primary/10 md:block", !canScrollRight && "pointer-events-none opacity-0")}
        onClick={() => scrollBy(scrollAmount)}><ChevronRight className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-primary" /></button>

      <style jsx>{`
        :global(.hide-scrollbar) { scrollbar-width: none; -ms-overflow-style: none; }
        :global(.hide-scrollbar::-webkit-scrollbar) { display: none; }
        @keyframes fadeIn { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }
        :global(.animate-fadeIn) { animation:fadeIn 0.2s ease-out; }
      `}</style>
    </div>
  );
}
