"use client";

import * as React from "react";
import { Search } from "lucide-react";

function VideoBackground() {
  const [mounted, setMounted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => { setMounted(true); }, []);

  React.useEffect(() => {
    if (!mounted) return;
    const v = videoRef.current;
    if (!v) return;
    v.src = "/videos/hero-bg.mp4";
    v.load();
    v.play().catch(() => {});
  }, [mounted]);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Video — client-only to avoid hydration mismatch */}
      {mounted && (
        <video
          ref={videoRef}
          autoPlay muted loop playsInline
          className="absolute inset-0 h-full w-full object-cover"
          onError={(e) => {
            const el = e.currentTarget;
            const msg = el.error ? `${el.error.code}: ${el.error.message}` : "unknown";
            setError(msg);
            console.error("[video] error:", msg);
          }}
        />
      )}
      {error && (
        <div className="pointer-events-none absolute bottom-4 left-4 z-50 rounded bg-red-900/80 px-3 py-1.5 text-xs text-red-200 font-mono">
          Video: {error}
        </div>
      )}
      {/* Dark overlay for text readability — works in both themes */}
      <div className="pointer-events-none absolute inset-0"
        style={{
          background: "linear-gradient(to bottom, rgba(0,0,0,0.60), rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.50))",
        }}
      />
      {/* Ambient glow orbs */}
      <div className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 80% 50% at 20% 20%, hsl(var(--primary) / 0.15) 0%, transparent 60%), radial-gradient(ellipse 50% 40% at 80% 80%, hsl(var(--primary) / 0.08) 0%, transparent 50%)",
        }}
      />
    </div>
  );
}

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

export function CategoriesHero({
  onSearch,
  totalCategories,
}: {
  onSearch?: (q: string) => void;
  totalCategories: number;
}) {
  const [query, setQuery] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => { setMounted(true); }, []);

  React.useEffect(() => {
    if (!mounted) return;
    function update() { setIsMobile(window.innerWidth < 768); }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [mounted]);

  return (
    <section className="relative min-h-[80vh] overflow-hidden md:min-h-[90vh]">
      <VideoBackground />

      {/* Content — bottom-left to keep video visible */}
      <div className="absolute bottom-6 left-4 z-10 max-w-2xl md:bottom-12 md:left-10 lg:bottom-16 lg:left-14">
        <div className="mb-3 text-[10px] font-medium uppercase tracking-widest text-white/50 md:mb-4 md:text-[11px]">
          {totalCategories} categories · Live now
        </div>

        <h1 className="font-display text-3xl font-bold leading-[1.05] tracking-tight text-white md:text-6xl lg:text-7xl">
          Find the right talent
          <br />
          <span className="text-teal-400">for any project</span>
        </h1>

        <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/60 md:mt-4 md:text-base">
          Browse skilled professionals across every category. From data entry to AI
          engineering — hire with confidence, pay only on approval.
        </p>

        {/* Search — icon replaces button */}
        <div className="mt-5 flex max-w-lg items-center overflow-hidden rounded-xl border border-white/10 bg-black/30 shadow-xl backdrop-blur-sm transition-all focus-within:border-teal-400/50 md:mt-6">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && onSearch) onSearch(query);
            }}
            placeholder={isMobile ? "Search categories..." : 'Try "spreadsheet", "full-stack", "mentoring"...'}
            className="flex-1 bg-transparent px-4 py-2.5 text-sm text-white placeholder-white/40 outline-none md:px-5 md:py-3 md:text-base"
          />
          <button
            onClick={() => onSearch?.(query)}
            className="flex items-center justify-center px-3 py-2.5 text-teal-400 transition-colors hover:text-teal-300 md:px-4 md:py-3"
            aria-label="Search"
          >
            <Search className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Scroll indicator */}
      {mounted && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 md:bottom-8">
          <div className="flex flex-col items-center gap-2 text-[10px] uppercase tracking-widest text-white/20">
            <span>Scroll</span>
            <div className="h-6 w-px bg-gradient-to-b from-white/20 to-transparent md:h-8" />
          </div>
        </div>
      )}
    </section>
  );
}
