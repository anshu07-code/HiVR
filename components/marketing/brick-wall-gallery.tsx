"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, ArrowRight, Briefcase, X, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "./category-icon";
import { useTheme } from "@/components/theme/provider";

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

/* ══════════════════════════════════════════════════════════════
   WALL PATTERN — CSS grid lines, shadows, hue/saturation
   ══════════════════════════════════════════════════════════════ */

export function WallPattern() {
  const { resolved } = useTheme();

  const isDark = resolved === "dark";
  const isEyeShield = resolved === "eye_shield";

  const hue = isEyeShield ? 38 : isDark ? 18 : 28;
  const sat = isEyeShield ? 18 : isDark ? 12 : 22;
  const light = isDark ? 18 : isEyeShield ? 75 : 82;

  const lineColor = (lh: number, ls: number, ll: number, a: number) =>
    `hsla(${lh}, ${ls}%, ${ll}%, ${a})`;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Nested horizontal and vertical lines at varying scales */}
      <svg className="absolute inset-0 w-full h-full">
        <defs>
          {/* Coarse grid — prominent */}
          <pattern id="g1" width="40" height="30" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="40" y2="0"
              stroke={lineColor(hue, sat + 20, isDark ? light + 55 : light - 55, isDark ? 0.35 : 0.18)}
              strokeWidth="1.2" />
            <line x1="0" y1="0" x2="0" y2="30"
              stroke={lineColor(hue, sat + 20, isDark ? light + 55 : light - 55, isDark ? 0.30 : 0.15)}
              strokeWidth="1" />
          </pattern>
          {/* Medium grid */}
          <pattern id="g2" width="20" height="15" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="20" y2="0"
              stroke={lineColor(hue, sat + 15, isDark ? light + 40 : light - 40, isDark ? 0.18 : 0.09)}
              strokeWidth="0.7" />
            <line x1="0" y1="0" x2="0" y2="15"
              stroke={lineColor(hue, sat + 15, isDark ? light + 40 : light - 40, isDark ? 0.15 : 0.08)}
              strokeWidth="0.6" />
          </pattern>
          {/* Fine grid */}
          <pattern id="g3" width="10" height="8" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="10" y2="0"
              stroke={lineColor(hue, sat + 10, isDark ? light + 25 : light - 25, isDark ? 0.09 : 0.045)}
              strokeWidth="0.4" />
            <line x1="0" y1="0" x2="0" y2="8"
              stroke={lineColor(hue, sat + 10, isDark ? light + 25 : light - 25, isDark ? 0.07 : 0.04)}
              strokeWidth="0.4" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#g1)" />
        <rect width="100%" height="100%" fill="url(#g2)" />
        <rect width="100%" height="100%" fill="url(#g3)" />
      </svg>

      {/* Shadow overlay — dark edges, light center */}
      <div className="absolute inset-0" style={{
        background: `radial-gradient(ellipse at 50% 40%, transparent 25%, hsl(${hue}, ${sat}%, ${isDark ? 0 : 95}%) 100%)`,
        mixBlendMode: isDark ? "overlay" : "multiply",
        opacity: isDark ? 0.6 : 0.4,
      }} />

      {/* Hue/saturation gradient overlay for depth */}
      <div className="absolute inset-0" style={{
        background: `linear-gradient(180deg, hsla(${hue + 20}, ${sat + 25}%, ${isDark ? light + 8 : light - 8}%, 0.04) 0%, transparent 35%, transparent 65%, hsla(${hue - 15}, ${sat + 10}%, ${isDark ? light - 5 : light - 12}%, 0.06) 100%)`,
      }} />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   VIBRANT DISTINCT COLORS per category
   ══════════════════════════════════════════════════════════════ */

const CAT_COLORS: Record<string, { bg: string; icon: string }> = {
  "spreadsheet-data":        { bg:"linear-gradient(135deg,#3A6B55,#4A7A63 45%,#6B9A83 75%)", icon:"#FBBF24" },
  "tech-micro-tasks":        { bg:"linear-gradient(135deg,#3A556B,#4A637A 45%,#6B839A 75%)", icon:"#FB923C" },
  mentoring:                 { bg:"linear-gradient(135deg,#7A6B4A,#8A7A5A 45%,#AA9A7A 75%)", icon:"#60A5FA" },
  "full-stack":              { bg:"linear-gradient(135deg,#5A3A7A,#6A4A8A 45%,#8A6AAA 75%)", icon:"#4ADE80" },
  "ai-ml":                   { bg:"linear-gradient(135deg,#7A3A5A,#8A4A6A 45%,#AA6A8A 75%)", icon:"#C084FC" },
  nlp:                       { bg:"linear-gradient(135deg,#2A6A7A,#3A7A8A 45%,#5A9AAA 75%)", icon:"#F472B6" },
  design:                    { bg:"linear-gradient(135deg,#7A3A7A,#8A4A8A 45%,#AA6AAA 75%)", icon:"#4ADE80" },
  devops:                    { bg:"linear-gradient(135deg,#3A4A7A,#4A5A8A 45%,#6A7AAA 75%)", icon:"#FBBF24" },
  mobile:                    { bg:"linear-gradient(135deg,#3A7A5A,#4A8A6A 45%,#6AAA8A 75%)", icon:"#FB923C" },
  security:                  { bg:"linear-gradient(135deg,#7A3A3A,#8A4A4A 45%,#AA6A6A 75%)", icon:"#34D399" },
  pm:                        { bg:"linear-gradient(135deg,#7A7A3A,#8A8A4A 45%,#AAAA6A 75%)", icon:"#60A5FA" },
  "content-copywriting":     { bg:"linear-gradient(135deg,#7A5A3A,#8A6A4A 45%,#AA8A6A 75%)", icon:"#C084FC" },
  "finance-accounts":        { bg:"linear-gradient(135deg,#2A6A4A,#3A7A5A 45%,#5A9A7A 75%)", icon:"#F472B6" },
  "data-labeling":           { bg:"linear-gradient(135deg,#4A6A6A,#5A7A7A 45%,#7A9A9A 75%)", icon:"#4ADE80" },
  "virtual-assistant":       { bg:"linear-gradient(135deg,#5A3A6A,#6A4A7A 45%,#8A6A9A 75%)", icon:"#FBBF24" },
  translation:               { bg:"linear-gradient(135deg,#3A7A6A,#4A8A7A 45%,#6AAA9A 75%)", icon:"#FB923C" },
  consulting:                { bg:"linear-gradient(135deg,#3A5A6A,#4A6A7A 45%,#6A8A9A 75%)", icon:"#C084FC" },
};

export function catTheme(s: string) { return CAT_COLORS[s] ?? CAT_COLORS["consulting"]; }

/* ══════════════════════════════════════════════════════════════
   DETAIL MODAL
   ══════════════════════════════════════════════════════════════ */

function DetailModal({ cat, subs, taskCount, openTaskCounts, onClose }: {
  cat: Cat; subs: Cat[]; taskCount: number;
  openTaskCounts?: Record<string, number>; onClose: () => void;
}) {
  const t = catTheme(cat.slug);
  return (
    <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} transition={{ duration:0.2 }}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-4 pt-[15vh] md:items-center md:pt-4" onClick={onClose}>
      <motion.div initial={{ opacity:0, scale:0.9, y:30 }} animate={{ opacity:1, scale:1, y:0 }}
        exit={{ opacity:0, scale:0.95, y:20 }} transition={{ type:"spring", damping:25, stiffness:300 }}
        className="relative my-auto w-full max-w-2xl max-h-[75vh] overflow-y-auto rounded-2xl border border-border/50 bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose}
          className="absolute right-4 top-4 z-10 grid h-8 w-8 place-items-center rounded-full bg-black/20 text-white/70 transition-colors hover:bg-black/40 hover:text-white">
          <X className="h-4 w-4" />
        </button>
        <div className="relative flex h-48 items-end overflow-hidden md:h-56" style={{ background:t.bg }}>
          <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_50px_rgba(0,0,0,0.5)]" />
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-card to-transparent" />
          <div className="relative z-10 mb-4 ml-6">
            <div className="grid h-20 w-20 place-items-center rounded-2xl border border-white/20 bg-black/30 shadow-xl backdrop-blur-sm"
              style={{ boxShadow:`0 0 30px ${t.icon}80, 0 0 80px ${t.icon}40` }}>
              <span style={{ color: t.icon }}><CategoryIcon name={cat.icon} className="h-10 w-10 drop-shadow-lg" /></span>
            </div>
          </div>
        </div>
        <div className="space-y-5 p-6 pt-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-foreground">{cat.name}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="outline" className={cn("border-primary/20 text-[10px] font-medium",
                cat.tier==="role_engagement"?"bg-purple-500/10 text-purple-600 dark:text-purple-400":"bg-emerald-500/10 text-emerald-600 dark:text-emerald-400")}>
                {cat.tier==="role_engagement"?"Tier B · Role":"Tier A · Micro"}</Badge>
              {(cat as any).wage_band_min_paise && <Badge variant="outline" className="border-border/40 text-[10px] text-muted-foreground">
                ₹{Math.round((cat as any).wage_band_min_paise/100).toLocaleString("en-IN")}–₹{Math.round((cat as any).wage_band_max_paise/100).toLocaleString("en-IN")} / {cat.tier==="role_engagement"?"day":"hr"}</Badge>}
              {taskCount>0 && <Badge variant="outline" className="border-primary/20 bg-primary/10 text-[10px] text-primary">{taskCount} open tasks</Badge>}
            </div>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">{cat.description}</p>
          {subs.length>0 && <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">Subcategories</p>
            <div className="grid gap-2 sm:grid-cols-2">{subs.map(s=>
              <Link key={s.id} href={`/categories/${s.slug}`}
                className="flex items-center justify-between gap-2 rounded-xl border border-border/50 bg-background/50 px-3.5 py-2.5 text-sm text-foreground/80 transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary">
                <span className="font-medium">{s.name}</span>
                {openTaskCounts?.[s.id] && openTaskCounts[s.id] > 0
                  ? <Badge variant="outline" className="shrink-0 border-primary/20 bg-primary/10 text-[10px] text-primary">{openTaskCounts[s.id]} open</Badge>
                  : <Briefcase className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              </Link>)}
            </div>
          </div>}
          <div className="rounded-xl bg-gradient-to-r from-primary/5 via-primary/10 to-transparent p-5">
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="text-sm font-semibold text-foreground">Looking for skilled professionals?</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Browse verified {cat.name} professionals with transparent pricing.</p></div>
              <Button asChild size="lg"
                className="shrink-0 gap-2 rounded-xl bg-primary font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 hover:shadow-primary/30">
                <Link href={`/employees?category=${cat.slug}`}><Users className="h-4 w-4" />Find your employee</Link>
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MAIN — Responsive paged grid (2 cols mobile, 3 cols desktop)
   ══════════════════════════════════════════════════════════════ */

const rotations = [-0.8, 1.2, -0.5, 0.9, -1.4, 0.4, -0.3, 1.1, -0.7, 0.6, -1.1, 0.3];

export function BrickWallGallery({ activeParents, childrenByParent, openTaskCounts }: {
  activeParents: Cat[]; childrenByParent: Record<string, Cat[]>; openTaskCounts?: Record<string, number>;
}) {
  const [page, setPage] = React.useState(0);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [perPage, setPerPage] = React.useState(6);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => { setMounted(true); }, []);

  React.useEffect(() => {
    if (!mounted) return;
    function update() { setPerPage(window.innerWidth < 768 ? 2 : 6); }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [mounted]);

  /* Reset to page 0 when perPage changes */
  React.useEffect(() => { setPage(0); }, [perPage]);

  const totalPages = Math.max(1, Math.ceil(activeParents.length / perPage));
  const start = page * perPage;
  const visible = activeParents.slice(start, start + perPage);
  const hasPrev = page > 0;
  const hasNext = start + perPage < activeParents.length;

  if (activeParents.length === 0) return null;

  return (
    <>
      <style>{`
        .brick-card {
          transform: rotate(var(--r, 0deg));
          transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.35s ease;
        }
        .brick-card:hover {
          transform: rotate(0deg) scale(1.05) !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15),0 8px 24px rgba(0,0,0,0.12),0 20px 48px rgba(0,0,0,0.10) !important;
        }
      `}</style>
      <div className="relative overflow-hidden rounded-2xl md:rounded-3xl">
        <WallPattern />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,transparent_35%,rgba(0,0,0,0.08)_100%)] dark:bg-[radial-gradient(ellipse_at_50%_30%,transparent_30%,rgba(0,0,0,0.20)_100%)]" />

      <div className="relative px-4 py-10 md:px-10 md:py-18">
        <div className="mb-8 text-center md:mb-10">
          <Badge variant="outline" className="border-primary/20 bg-background/60 text-foreground/70 backdrop-blur-sm">
            <span className="mr-1.5 inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
            {activeParents.length} live categories
          </Badge>
          <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-foreground md:text-5xl lg:text-6xl">Wall of Categories</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm font-medium text-muted-foreground/80 md:text-lg md:font-semibold">Click any frame to explore</p>
        </div>

        {/* Paged grid — 2 cols mobile, 3 cols desktop */}
        <div className="relative mx-auto max-w-5xl">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5">
            {visible.map((cat, i) => {
              const subs = childrenByParent[cat.id] ?? [];
              const taskCount = openTaskCounts?.[cat.id] ?? 0;
              const rotate = rotations[i % rotations.length];
              const t = catTheme(cat.slug);

              return (
                <div key={cat.id}>
                  <Link href={cat.status === "active" ? `/categories/${cat.slug}` : `/categories/${cat.slug}?waitlist=1`}
                    className={cn("group/frame block rounded-xl border border-border/50 bg-card md:rounded-2xl md:border-2 dark:border-zinc-700/50 hover:z-10 brick-card")}
                    style={{ '--r': `${rotate}deg` } as React.CSSProperties}>
                    <div className="relative h-32 overflow-hidden rounded-t-xl md:h-52 bg-card">
                      <div className="absolute inset-0 dark:opacity-100 opacity-[0.45] transition-opacity" style={{ background:t.bg }} />
                      <div className="absolute inset-0 opacity-[0.06] dark:opacity-[0.04]"
                        style={{ backgroundImage:"radial-gradient(circle at 30% 25%, rgba(255,255,255,0.18) 0%, transparent 50%)" }} />
                      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_4px_20px_rgba(0,0,0,0.2)]" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="grid h-12 w-12 place-items-center rounded-xl border border-white/20 bg-black/20 shadow-lg backdrop-blur-sm transition-all duration-300 group-hover/frame:scale-110 md:h-16 md:w-16 md:rounded-2xl"
                          style={{ boxShadow:`0 0 20px ${t.icon}60, 0 0 50px ${t.icon}30` }}>
                          <span style={{ color: t.icon }}><CategoryIcon name={cat.icon} className="h-6 w-6 drop-shadow-md md:h-8 md:w-8" /></span>
                        </div>
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-black/25 to-transparent" />
                    </div>
                    <div className="flex items-center justify-between gap-2 p-3 md:p-4">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-display text-sm font-semibold text-foreground md:text-base">{cat.name}</h3>
                        <p className="mt-0.5 text-[10px] text-muted-foreground md:text-xs">{cat.tier==="role_engagement"?"Role engagement":"Micro-tasks"}{taskCount>0&&` · ${taskCount} open`}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/70 transition-transform group-hover/frame:translate-x-0.5 md:h-5 md:w-5" />
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>

          {/* Arrows */}
          {hasPrev && (
            <button type="button" aria-label="Previous page"
              className="group absolute -left-2 top-1/2 z-10 -translate-y-1/2 rounded-full border border-border bg-background/90 p-1.5 shadow-lg transition-all hover:border-primary/40 hover:bg-primary/5 hover:shadow-primary/10 md:-left-4 md:p-2.5"
              onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary md:h-5 md:w-5" />
            </button>
          )}
          {hasNext && (
            <button type="button" aria-label="Next page"
              className="group absolute -right-2 top-1/2 z-10 -translate-y-1/2 rounded-full border border-border bg-background/90 p-1.5 shadow-lg transition-all hover:border-primary/40 hover:bg-primary/5 hover:shadow-primary/10 md:-right-4 md:p-2.5"
              onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary md:h-5 md:w-5" />
            </button>
          )}
        </div>

        {/* Page dots */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2 md:mt-8">
            {Array.from({ length: totalPages }).map((_, i) => (
              <button key={i} type="button" aria-label={`Page ${i+1}`}
                className={cn("h-1.5 rounded-full transition-all md:h-2", i === page ? "w-4 bg-primary md:w-6" : "w-1.5 bg-muted-foreground/25 md:w-2")}
                onClick={() => setPage(i)} />
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {expandedId && (() => {
          const cat = activeParents.find(c => c.id === expandedId);
          if (!cat) return null;
          return <DetailModal key={cat.id} cat={cat} subs={childrenByParent[cat.id]??[]}
            taskCount={openTaskCounts?.[cat.id]??0} openTaskCounts={openTaskCounts} onClose={()=>setExpandedId(null)} />;
        })()}
      </AnimatePresence>
    </div>
    </>
  );
}
