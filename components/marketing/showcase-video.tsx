"use client";

import * as React from "react";
import {
  Play, Pause, Volume2, VolumeX, Maximize2, Minimize2,
  Sparkles, Zap, CheckCircle2, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * HiVRShowcaseVideo
 *
 * A self-contained, polished video panel for the landing page.
 *
 * Features:
 *   * HTML5 video with play/pause, mute, fullscreen, seek, loop
 *   * Lazy thumbnail/poster (preload="none" until play)
 *   * Graceful fallback: if the video URL errors or 404s, the
 *     poster + play button stay visible (the video just doesn't
 *     play — better than a broken embed)
 *   * Floating chapter overlay (5 quick captions) on the right side
 *   * Built-in call-to-action ("See live categories →")
 *   * Auto-hide controls while playing; show on hover
 *   * Subtle pulse on the play button so visitors know it's clickable
 *
 * Props:
 *   - src:        URL to the video (mp4 / webm). Pass an empty
 *                 string to render the poster-only "coming soon"
 *                 variant.
 *   - poster:     URL to a poster image (jpg / webp). Shown before
 *                 play and as a fallback if the video errors.
 *   - chapters:   Optional list of `{ t: seconds, label: string }`
 *                 for the floating chapter overlay.
 *
 * Usage:
 *   <HiVRShowcaseVideo
 *     src="/videos/hivr-showcase.mp4"
 *     poster="/videos/hivr-showcase.jpg"
 *     chapters={[
 *       { t: 0,  label: "Tier A — micro-tasks" },
 *       { t: 6,  label: "Tier B — role engagements" },
 *       { t: 12, label: "Smart Match" },
 *       { t: 18, label: "Workspace + escrow" },
 *       { t: 24, label: "Mark as done" },
 *     ]}
 *   />
 */
type Chapter = { t: number; label: string };

export function HiVRShowcaseVideo({
  src,
  poster,
  chapters = DEFAULT_CHAPTERS,
}: {
  src: string;
  poster?: string;
  chapters?: Chapter[];
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const wrapRef   = React.useRef<HTMLDivElement>(null);
  const [playing, setPlaying]   = React.useState(false);
  const [muted, setMuted]       = React.useState(true); // start muted so autoplay is allowed by browsers
  const [isFullscreen, setFs]   = React.useState(false);
  const [error, setError]       = React.useState(false);
  const [currentTime, setTime]  = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const [hovered, setHovered]   = React.useState(false);
  const [hasStarted, setStarted] = React.useState(false);

  // Tick the currentTime so the progress bar moves + chapters highlight
  React.useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const loop = () => {
      const v = videoRef.current;
      if (v) setTime(v.currentTime);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // Track fullscreen changes (F11, Esc, etc.)
  React.useEffect(() => {
    function onChange() {
      setFs(!!document.fullscreenElement);
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Keyboard: space = play/pause, m = mute, f = fullscreen
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!wrapRef.current?.contains(document.activeElement)) return;
      if (e.key === " ") { e.preventDefault(); togglePlay(); }
      else if (e.key.toLowerCase() === "m") { setMuted((m) => !m); }
      else if (e.key.toLowerCase() === "f") { toggleFullscreen(); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function togglePlay() {
    const v = videoRef.current;
    if (!v || error) return;
    if (v.paused) {
      v.play().then(() => { setPlaying(true); setStarted(true); }).catch(() => setPlaying(false));
    } else {
      v.pause();
      setPlaying(false);
    }
  }

  function toggleFullscreen() {
    if (!wrapRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      wrapRef.current.requestFullscreen?.().catch(() => {});
    }
  }

  function seek(t: number) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = t;
    setTime(t);
    if (v.paused) {
      v.play().then(() => setPlaying(true)).catch(() => {});
    }
  }

  const showControls = !playing || hovered;
  const pct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const activeChapterIdx = (() => {
    let i = -1;
    for (let k = 0; k < chapters.length; k++) {
      if (currentTime >= chapters[k].t) i = k;
      else break;
    }
    return i;
  })();

  return (
    <section className="border-t bg-gradient-to-b from-background via-primary/5 to-background py-16 md:py-24">
      <div className="container">
        <div className="mb-8 max-w-2xl">
          <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">
            <Sparkles className="h-3 w-3" />See it in action
          </Badge>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight md:text-4xl">
            Two tiers. One platform. Zero haggling.
          </h2>
          <p className="mt-3 text-muted-foreground text-pretty">
            A 60-second tour of how HiVR matches the right person to the right work, escrows the
            money, and releases it when the work is done.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* Video player */}
          <div
            ref={wrapRef}
            tabIndex={0}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className="group relative overflow-hidden rounded-xl border bg-zinc-950 shadow-2xl outline-none focus:ring-2 focus:ring-primary"
            style={{ aspectRatio: "16 / 9" }}
          >
            {/* Background poster — always rendered so the SSR HTML
                and the client first-render match (avoids hydration
                mismatch). The video element sits on top of it; when
                the video plays the poster is hidden by the video
                frames, and when the video errors or has no src the
                poster (or a CSS gradient) stays visible. */}
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{
                backgroundImage: poster
                  ? `url(${poster})`
                  : "linear-gradient(135deg, #0c1424 0%, #1e3a8a 50%, #0c1424 100%)",
              }}
              aria-hidden
            />

            {/* Video element (only when src is set). Always rendered
                when src is provided so the DOM is stable between SSR
                and client; we never conditionally remove it. The
                browser shows the poster underneath the video until
                the first frame is decoded. */}
            {src && (
              <video
                ref={videoRef}
                src={src}
                poster={poster}
                preload="none"
                playsInline
                muted={muted}
                loop
                className={cn(
                  "absolute inset-0 h-full w-full bg-zinc-950 object-cover transition-opacity duration-300",
                  error && "opacity-0 pointer-events-none"
                )}
                onLoadedMetadata={(e) => setDuration((e.currentTarget as HTMLVideoElement).duration || 0)}
                onTimeUpdate={(e) => setTime((e.currentTarget as HTMLVideoElement).currentTime)}
                onEnded={() => setPlaying(false)}
                onError={() => setError(true)}
              />
            )}

            {/* Cinematic overlay (always rendered) */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-transparent to-zinc-950/30" />

            {/* Big play button — center, pulses until played */}
            {!playing && (
              <button
                type="button"
                onClick={togglePlay}
                disabled={error}
                aria-label="Play product video"
                className="absolute inset-0 grid place-items-center"
              >
                <span
                  className={cn(
                    "grid h-20 w-20 place-items-center rounded-full bg-white/95 text-primary shadow-2xl backdrop-blur transition-transform",
                    !hasStarted && "animate-pulse-slow",
                    "group-hover:scale-110 active:scale-95"
                  )}
                >
                  <Play className="h-8 w-8 fill-current" />
                </span>
              </button>
            )}

            {/* Top corner: duration + Live badge */}
            <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-rose-600/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white shadow-lg">
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
              {playing ? "Playing" : "Watch · 60s"}
            </div>

            {/* Bottom controls */}
            <div
              className={cn(
                "absolute inset-x-0 bottom-0 z-10 px-3 pb-3 pt-12 transition-opacity duration-200",
                showControls ? "opacity-100" : "pointer-events-none opacity-0"
              )}
            >
              {/* Progress bar */}
              <button
                type="button"
                onClick={(e) => {
                  const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                  const ratio = (e.clientX - rect.left) / rect.width;
                  seek(ratio * duration);
                }}
                className="group/progress relative mb-2 block h-1 w-full cursor-pointer overflow-hidden rounded-full bg-white/20"
              >
                <div
                  className="h-full bg-primary transition-[width] duration-100"
                  style={{ width: `${pct}%` }}
                />
                <div
                  className="absolute top-1/2 h-3 w-3 -translate-y-1/2 -translate-x-1/2 rounded-full bg-white opacity-0 shadow transition-opacity group-hover/progress:opacity-100"
                  style={{ left: `${pct}%` }}
                />
              </button>

              <div className="flex items-center gap-2 text-white">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={togglePlay}
                  className="h-8 w-8 text-white hover:bg-white/15"
                  aria-label={playing ? "Pause" : "Play"}
                >
                  {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => setMuted((m) => !m)}
                  className="h-8 w-8 text-white hover:bg-white/15"
                  aria-label={muted ? "Unmute" : "Mute"}
                >
                  {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </Button>
                <span className="text-[11px] tabular-nums text-white/80">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
                <div className="flex-1" />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={toggleFullscreen}
                  className="h-8 w-8 text-white hover:bg-white/15"
                  aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                >
                  {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          {/* Chapter list + CTAs */}
          <Card className="border-2 border-primary/20 bg-primary/5">
            <CardContent className="space-y-4 p-5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">In this video</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Click a chapter to jump</p>
              </div>
              <ol className="space-y-1.5">
                {chapters.map((ch, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => seek(ch.t)}
                      className={cn(
                        "group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                        i === activeChapterIdx ? "bg-primary/15 text-primary font-semibold" : "text-muted-foreground hover:bg-primary/10 hover:text-foreground"
                      )}
                    >
                      <span className={cn(
                        "grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9px] font-mono",
                        i === activeChapterIdx ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      )}>
                        {i + 1}
                      </span>
                      <span className="flex-1">{ch.label}</span>
                      <ChevronRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  </li>
                ))}
              </ol>

              <div className="rounded-md border bg-background p-3 text-xs text-muted-foreground">
                <p className="flex items-center gap-1.5 font-semibold text-foreground">
                  <Zap className="h-3 w-3 text-amber-500" />The full tour
                </p>
                <p className="mt-1 leading-relaxed">
                  See Smart Match, escrow funding, the workspace, and the per-file review flow
                  that protects both buyer and employee.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <Button asChild className="w-full">
                  <a href="/instant-hire">
                    <Zap className="h-3.5 w-3.5" />Try Instant Hire <ChevronRight className="h-3.5 w-3.5" />
                  </a>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <a href="/how-it-works">
                    How HiVR works
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}

const DEFAULT_CHAPTERS: Chapter[] = [
  { t: 0,  label: "Tier A — micro-tasks" },
  { t: 10, label: "Tier B — role engagements" },
  { t: 20, label: "Smart Match (Instant Hire)" },
  { t: 32, label: "Workspace + escrow" },
  { t: 46, label: "Per-file review + Mark as done" },
];

function formatTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
