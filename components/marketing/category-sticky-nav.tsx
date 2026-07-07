"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "./category-icon";
import { ChevronDown, ArrowRight } from "lucide-react";

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
  const itemRefs = React.useRef<Map<string, HTMLDivElement>>(new Map());
  const leaveTimer = React.useRef<ReturnType<typeof setTimeout>>();
  const [dropdownStyle, setDropdownStyle] = React.useState<React.CSSProperties>({ display: "none" });
  const navRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const hero = document.getElementById("categories-hero");
    if (!hero) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(hero);
    return () => {
      observer.disconnect();
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    };
  }, []);

  React.useEffect(() => {
    if (hovered) {
      const el = itemRefs.current.get(hovered);
      const nav = navRef.current;
      if (el && nav) {
        const navRect = nav.getBoundingClientRect();
        const rect = el.getBoundingClientRect();
        setDropdownStyle({
          left: navRect.left,
          top: navRect.top,
          width: navRect.width,
        });
      }
    } else {
      setDropdownStyle({ display: "none" });
    }
  }, [hovered]);

  const handleEnter = (id: string) => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    setHovered(id);
  };

  const handleLeave = () => {
    leaveTimer.current = setTimeout(() => setHovered(null), 150);
  };

  if (activeParents.length === 0) return null;

  const hoveredSubs = hovered ? (childrenByParent[hovered] ?? []) : [];

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
          <div ref={navRef} className="mx-auto flex max-w-7xl items-center gap-0 overflow-x-auto px-4 hide-scrollbar">
            {activeParents.map((cat) => {
              const subs = childrenByParent[cat.id] ?? [];
              return (
                <div
                  key={cat.id}
                  ref={(el) => { if (el) itemRefs.current.set(cat.id, el); else itemRefs.current.delete(cat.id); }}
                  className="relative shrink-0"
                  onMouseEnter={() => handleEnter(cat.id)}
                  onMouseLeave={handleLeave}
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
                </div>
              );
            })}
          </div>

          {/* Mega-menu dropdown — full-width like Fiverr */}
          {hovered && hoveredSubs.length > 0 && (
            <div
              className="fixed z-50 animate-fadeIn rounded-b-xl border-x border-b border-border/50 bg-background/95 shadow-2xl shadow-black/20 backdrop-blur-xl"
              style={dropdownStyle}
              onMouseEnter={() => handleEnter(hovered)}
              onMouseLeave={handleLeave}
            >
              <div className="grid grid-cols-3 gap-1 p-4 md:grid-cols-4 lg:grid-cols-5">
                {hoveredSubs.map((s) => (
                  <Link
                    key={s.id}
                    href={`/categories/${s.slug}`}
                    className="rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                  >
                    {s.name}
                  </Link>
                ))}
              </div>
              {(() => {
                const parent = activeParents.find(p => p.id === hovered);
                if (!parent) return null;
                return (
                  <div className="border-t border-border/30 px-4 py-2.5">
                    <Link
                      href={`/categories/${parent.slug}`}
                      className="text-[13px] font-medium text-primary transition-colors hover:text-primary/80"
                    >
                      View all {parent.name} <ArrowRight className="ml-0.5 inline h-3 w-3" />
                    </Link>
                  </div>
                );
              })()}
            </div>
          )}

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
