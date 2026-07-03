"use client";

import * as React from "react";

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

export function CylinderGallery({ categories, badge, title, description, statusLabel }: {
  categories: Cat[];
  badge?: string;
  title?: string;
  description?: string;
  statusLabel?: string;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [isHovering, setIsHovering] = React.useState(false);
  const angleRef = React.useRef(0);
  const rafRef = React.useRef(0);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container || categories.length === 0) return;

    const cards = container.querySelectorAll<HTMLElement>(".cylinder-card");
    const radius = 560;
    const total = cards.length;
    const slice = (2 * Math.PI) / total;

    function render(angle: number) {
      cards.forEach((card, i) => {
        const theta = angle + i * slice;
        const x = Math.sin(theta) * radius - 130;
        const z = Math.cos(theta) * radius - radius;
        const scale = ((z + radius * 2) / (radius * 3)) * 0.35 + 0.65;
        const opacity = ((z + radius * 2) / (radius * 3)) * 0.35 + 0.65;
        card.style.transform = `translateX(${x}px) translateZ(${z}px) scale(${scale})`;
        card.style.opacity = String(opacity);
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

      <div ref={containerRef} className="relative mx-auto flex h-[460px] items-start justify-center overflow-hidden"
        style={{ perspective: "1400px" }}>
        <div className="relative preserve-3d" style={{ transformStyle: "preserve-3d" }}>
          {categories.map((cat) => (
            <div key={cat.id}
              className="cylinder-card absolute left-1/2 top-1/2 h-[22rem] w-[18rem] -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-2xl border border-white/10 bg-card shadow-xl transition-shadow duration-300 hover:shadow-2xl hover:shadow-primary/20"
              style={{ backfaceVisibility: "hidden" }}>
              <a href={`/categories/${cat.slug}`}>
                <div className="relative h-48 overflow-hidden rounded-t-2xl">
                  <img src={`https://picsum.photos/seed/${cat.slug}/900/600`} alt={cat.name}
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
    </div>
  );
}

export { CylinderGallery as ComingSoonCylinder };
