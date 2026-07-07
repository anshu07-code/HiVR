"use client";

import * as React from "react";

const CAT_IMAGES: Record<string, string> = {
  "programming-tech":           "/Tech.jpeg",
  "data-analytics":             "/Data_analytics.jpeg",
  "graphic-design-creative":    "/Graphic design.jpeg",
  "writing-translation":        "/Writing.jpeg",
  "business-support-admin":     "/Business_services.jpeg",
  "music-audio":                "/Music .jpeg",
  "ai-services":                "/AI_img.jpeg",
  "digital-marketing":          "/Digital_marketing.jpeg",
  "finance-accounting":         "/finance_and_accounting.jpeg",
  "photography":                "/Photography.jpeg",
  "qa-testing":                 "/QA.jpeg",
  "sales-customer-support":     "/sales.jpeg",
  "video-animation":            "/video_editing.jpeg",
  "sap-erp":                    "/SAP_and_ERP.jpeg",
  "architecture-engineering":   "/Architecture_and_engineering.jpeg",
  "legal-services":             "/Legal.jpeg",
  "education-coaching":         "/Education_and_coaching.jpeg",
  "product-design-manufacturing": "/Product_Designing_and_manufacturing.jpeg",
  "business-consulting":          "/Business_Consulting.png",
};

type Cat = {
  id: string;
  slug: string;
  name: string;
  icon: string;
  description: string;
  tier: string;
  status: string;
  parent_category_id: string | null;
};

export function CylinderGallery({ categories, badge, title, description, statusLabel, viewAllHref }: {
  categories: Cat[];
  badge?: string;
  title?: string;
  description?: string;
  statusLabel?: string;
  viewAllHref?: string;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [isHovering, setIsHovering] = React.useState(false);
  const angleRef = React.useRef(0);
  const rafRef = React.useRef(0);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container || categories.length === 0) return;

    const cards = container.querySelectorAll<HTMLElement>(".cylinder-card");
    const total = cards.length;
    const radius = total <= 14 ? 480 : 620;
    const slice = (2 * Math.PI) / total;

    function render(angle: number) {
      cards.forEach((card, i) => {
        const theta = angle + i * slice;
        const x = Math.sin(theta) * radius - 138;
        const z = Math.cos(theta) * radius - radius;
        const scale = ((z + radius * 2) / (radius * 3)) * 0.35 + 0.65;
        const opacity = ((z + radius * 2) / (radius * 3)) * 0.25 + 0.75;
        card.style.transform = `translateX(${x}px) translateZ(${z}px) scale(${scale})`;
        card.style.opacity = String(opacity);
        card.style.zIndex = String(Math.round((z + radius * 2) * 10));
      });
    }

    let paused = false;
    function animate() {
      if (!paused) {
        angleRef.current += 0.008;
        render(angleRef.current);
      }
      rafRef.current = requestAnimationFrame(animate);
    }

    function onCardEnter(e: Event) {
      const target = e.target as HTMLElement;
      if (target.closest(".cylinder-card")) {
        setIsHovering(true); paused = true;
      }
    }
    function onCardLeave(e: Event) {
      const target = e.target as HTMLElement;
      if (target.closest(".cylinder-card")) {
        setIsHovering(false); paused = false;
      }
    }

    container.addEventListener("mouseover", onCardEnter);
    container.addEventListener("mouseout", onCardLeave);

    animate();

    return () => {
      cancelAnimationFrame(rafRef.current);
      container.removeEventListener("mouseover", onCardEnter);
      container.removeEventListener("mouseout", onCardLeave);
    };
  }, [categories.length]);

  if (categories.length === 0) return null;

  return (
    <div className="relative">
      <div className="mb-8 text-center">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/8 px-3 py-1 text-[10px] font-medium uppercase tracking-widest text-primary/70">
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-primary/50" />
          {badge ?? "Coming soon"}
        </div>
        <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">{title ?? "Launching next"}</h2>
        <p className="mx-auto mt-2 max-w-xl text-muted-foreground">
          {description ?? "These categories are in development. Hover to preview, click to join the waitlist."}
        </p>
      </div>

      <div ref={containerRef} className="relative mx-auto flex items-start justify-center overflow-hidden"
        style={{ perspective: "1400px", height: categories.length <= 14 ? "380px" : "460px" }}>
        <div className="relative preserve-3d" style={{ transformStyle: "preserve-3d" }}>
          {categories.map((cat) => (
            <div key={cat.id}
              className={`cylinder-card absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-2xl border border-white/10 bg-card shadow-xl transition-shadow duration-300 hover:shadow-2xl hover:shadow-primary/20 ${categories.length <= 14 ? "h-[20rem] w-[16rem]" : "h-[22rem] w-[18rem]"}`}
              style={{ backfaceVisibility: "hidden" }}>
              <a href={`/categories/${cat.slug}`}>
                <div className={`relative overflow-hidden rounded-t-2xl ${categories.length <= 14 ? "h-40" : "h-48"}`}>
                  <img src={CAT_IMAGES[cat.slug] ?? `https://picsum.photos/seed/${cat.slug}/900/600`} alt={cat.name}
                    className="h-full w-full object-cover" loading="lazy" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                </div>
                <div className="flex flex-col items-center justify-center p-5 text-center">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">{statusLabel ?? "Coming"}</span>
                  <h3 className="mt-1.5 font-display text-lg font-semibold text-foreground leading-tight">{cat.name}</h3>
                </div>
              </a>
            </div>
          ))}
        </div>
      </div>

      {isHovering && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
          <span className="rounded-full bg-background/80 px-3 py-1 text-[10px] font-medium text-muted-foreground backdrop-blur-sm">
            Paused
          </span>
        </div>
      )}

      {viewAllHref && (
        <div className="mt-8 text-center">
          <a href={viewAllHref}
            className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-5 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10">
            View all
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </a>
        </div>
      )}
    </div>
  );
}

export { CylinderGallery as ComingSoonCylinder };
