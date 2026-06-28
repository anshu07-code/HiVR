"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * AnimatedCategoryShowcase
 *
 * A premium, dense, fully-CSS-animated mini-scene per category. No
 * external images — every pixel is generated with Tailwind, CSS
 * keyframes, and small SVG. This keeps the showcase fast (no image
 * downloads), accessible (works in dark/light/any device), and
 * premium (subtle motion draws the eye without being annoying).
 *
 * Each scene is intentionally compact (~80-120px tall) so 12+ of
 * them can fit on screen at once in a 3-4 column grid.
 *
 * The "hero" variant renders a single, larger, fully-detailed scene
 * (used in the hero of the landing page to replace the static
 * Spreadsheet card).
 */
type Variant = "hero" | "card";

export function AnimatedCategoryShowcase({
  category, variant = "card",
}: { category: CategoryId; variant?: Variant }) {
  const Scene = SCENES[category];
  return (
    <div className={cn(
      "relative overflow-hidden rounded-lg",
      variant === "hero" ? "h-[280px] w-full bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 ring-1 ring-white/10" : "h-20 w-full bg-zinc-950 ring-1 ring-white/10"
    )}>
      {variant === "hero" ? (
        <Scene.hero />
      ) : (
        <Scene.compact />
      )}
      {/* Subtle scanline overlay for "monitor" feel */}
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage: "repeating-linear-gradient(0deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 3px)",
        }}
      />
    </div>
  );
}

// =============================================================
//                      CATEGORY CATALOG
// =============================================================

type CategoryId =
  | "spreadsheet" | "tech" | "mentoring"
  | "fullstack" | "ai" | "nlp" | "design" | "devops" | "mobile" | "security" | "pm"
  | "content" | "finance" | "labeling" | "va" | "translation" | "consulting";

type Scene = { hero: React.FC; compact: React.FC };

const SCENES: Record<CategoryId, Scene> = {
  // ─── Tier A (live) ───
  spreadsheet: SpreadsheetScene(),
  tech:        CodeScene(),
  mentoring:   MentoringScene(),
  // ─── Tier B (live) ───
  fullstack:   FullStackScene(),
  ai:          AIScene(),
  nlp:         NLPScene(),
  // ─── Tier B (coming soon) ───
  design:      DesignScene(),
  devops:      DevOpsScene(),
  mobile:      MobileScene(),
  security:    SecurityScene(),
  pm:          PMScene(),
  // ─── Tier A (coming soon) ───
  content:     ContentScene(),
  finance:     FinanceScene(),
  labeling:    LabelingScene(),
  va:          VAScene(),
  translation: TranslationScene(),
  consulting:  ConsultingScene(),
};

// =============================================================
//                       SPREADSHEET SCENE
// =============================================================

function SpreadsheetScene(): Scene {
  return {
    hero: () => (
      <div className="relative h-full w-full p-5 text-zinc-100">
        {/* Title bar */}
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-zinc-500">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          vendors-2026.xlsx · auto-reconciling
        </div>

        {/* Spreadsheet grid */}
        <div className="mt-3 grid grid-cols-5 gap-px overflow-hidden rounded border border-zinc-800 bg-zinc-800 text-[11px]">
          {/* Header row */}
          {["", "Vendor A", "Vendor B", "Vendor C", "Total"].map((h, i) => (
            <div key={i} className={cn("bg-zinc-900 px-2 py-1.5 font-mono font-semibold", i === 0 && "text-zinc-500 text-center")}>
              {h}
            </div>
          ))}
          {/* Data rows */}
          {[
            ["INV-001", "₹12,400", "₹12,400", "₹12,500", "✓"],
            ["INV-002", "₹8,200",  "₹8,200",  "—",       "✓"],
            ["INV-003", "₹4,950",  "₹4,950",  "₹4,950",  "✓"],
            ["INV-004", "₹22,100", "₹22,100", "₹22,100", "✓"],
          ].map((row, ri) =>
            row.map((cell, ci) => (
              <div key={`${ri}-${ci}`} className={cn(
                "bg-zinc-950 px-2 py-1.5 font-mono",
                ri === 3 && ci === 4 && "bg-emerald-500/20 text-emerald-300 font-bold",
                ri === 1 && ci === 3 && "text-zinc-600 italic",
                ci > 0 && ri < 4 && "animate-cell-fill"
              )}>
                {cell}
              </div>
            ))
          )}
        </div>

        {/* Footer status bar */}
        <div className="mt-3 flex items-center gap-3 text-[10px]">
          <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            4/4 matched
          </div>
          <div className="text-zinc-500">3 vendors · 47 rows · 0 conflicts</div>
        </div>

        {/* Floating chat bubble */}
        <div className="absolute right-4 top-4 max-w-[180px] rounded-lg bg-sky-500/20 px-2.5 py-1.5 text-[10px] text-sky-200 ring-1 ring-sky-500/30 animate-fade-up">
          HiVR reconciled 4 invoices in 1.2s ✓
        </div>
      </div>
    ),
    compact: () => (
      <div className="flex h-full w-full items-center gap-1 p-1.5 text-[8px] font-mono">
        <div className="grid flex-1 grid-cols-4 gap-px overflow-hidden rounded-sm border border-zinc-800 bg-zinc-800">
          {["A","B","C","Σ"].map((c, i) => (
            <div key={i} className="bg-zinc-950 px-1 py-0.5 text-center text-zinc-300">{c}</div>
          ))}
          {Array.from({length: 4}).map((_, ri) => (
            Array.from({length: 4}).map((_, ci) => (
              <div key={`${ri}-${ci}`} className={cn(
                "bg-zinc-950 px-1 py-0.5 text-zinc-400 animate-cell-fill",
                ri === 3 && ci === 3 && "bg-emerald-500/30 text-emerald-300 font-bold"
              )}>{(ri + ci) % 3 === 0 ? "✓" : "·"}</div>
            ))
          ))}
        </div>
        <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
      </div>
    ),
  };
}

// =============================================================
//                          CODE SCENE
// =============================================================

function CodeScene(): Scene {
  return {
    hero: () => (
      <div className="flex h-full w-full flex-col text-zinc-100">
        <div className="flex items-center gap-1.5 border-b border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-[10px]">
          <span className="h-2 w-2 rounded-full bg-rose-500/70" />
          <span className="h-2 w-2 rounded-full bg-amber-500/70" />
          <span className="h-2 w-2 rounded-full bg-emerald-500/70" />
          <span className="ml-2 font-mono text-zinc-500">~/repo/billing.ts · fix null ref</span>
          <span className="ml-auto text-zinc-600">test.ts ✓</span>
        </div>
        <div className="flex-1 overflow-hidden p-3 font-mono text-[10.5px] leading-relaxed">
          <TypeLine prefix="-" delay={0}  ><span className="text-rose-400">const</span> <span className="text-sky-300">charge</span> = <span className="text-amber-300">await</span> stripe.<span className="text-sky-300">charges</span>.<span className="text-emerald-300">create</span>({`{`}</TypeLine>
          <TypeLine prefix=" " delay={400}><span className="text-zinc-500">amount</span>: <span className="text-violet-300">cents</span>, <span className="text-zinc-500">customer</span>: user.<span className="text-sky-300">id</span>,</TypeLine>
          <TypeLine prefix=" " delay={800}><span className="text-zinc-500">confirm</span>: <span className="text-amber-300">true</span>,</TypeLine>
          <TypeLine prefix=" " delay={1200}><span className="text-zinc-500">payment_method</span>: card.<span className="text-sky-300">pm</span>,</TypeLine>
          <TypeLine prefix=" " delay={1600}><span className="text-zinc-500">description</span>: <span className="text-emerald-300">"Invoice #"</span> + id,</TypeLine>
          <TypeLine prefix=" " delay={2000}>{`})`};</TypeLine>
          <TypeLine prefix="+" delay={2400} className="text-emerald-300">// fixed null ref on failed card</TypeLine>
          <TypeLine prefix=">" delay={2800}>$ <span className="animate-pulse text-amber-300">npm</span> test</TypeLine>
        </div>
      </div>
    ),
    compact: () => (
      <div className="flex h-full w-full flex-col p-1.5 font-mono text-[8px] leading-tight text-zinc-300">
        <div className="flex items-center gap-0.5">
          <span className="h-1 w-1 rounded-full bg-rose-400" />
          <span className="h-1 w-1 rounded-full bg-amber-400" />
          <span className="h-1 w-1 rounded-full bg-emerald-400" />
        </div>
        <div className="mt-1 space-y-px">
          <div><span className="text-rose-400">const</span> <span className="text-sky-300">fix</span> = () =&gt; {`{`}</div>
          <div className="pl-2 text-zinc-500">await <span className="text-amber-300">test</span>();</div>
          <div>{`}`} <span className="text-emerald-300">// ✓</span></div>
        </div>
      </div>
    ),
  };
}

/**
 * TypeLine — a single line of code that fades in after `delay` ms.
 * Used by the CodeScene to simulate a stream of fixes being typed
 * into a real IDE. The `prefix` slot mimics a diff marker / caret
 * (e.g. "-" for removed line, ">" for shell prompt, " " for indent).
 */
function TypeLine({
  prefix = " ",
  delay = 0,
  className = "",
  children,
}: {
  prefix?: string;
  delay?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`whitespace-pre ${className}`}
      style={{ animation: "fade-up 0.35s ease-out backwards", animationDelay: `${delay}ms` }}
    >
      <span className="select-none text-zinc-600">{prefix}</span>
      {children}
    </div>
  );
}

// =============================================================
//                        MENTORING SCENE
// =============================================================

function MentoringScene(): Scene {
  return {
    hero: () => (
      <div className="flex h-full w-full text-zinc-100">
        {/* Video tile */}
        <div className="relative flex-1 bg-gradient-to-br from-indigo-950 via-zinc-900 to-zinc-950 p-3">
          <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-rose-500/20 px-2 py-0.5 text-[9px] text-rose-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />
            LIVE 12:43
          </div>
          <div className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-amber-400 to-rose-500 text-base font-bold text-white">
            P
          </div>
          <p className="mt-1.5 text-xs font-semibold">Priya M.</p>
          <p className="text-[9px] text-zinc-400">Mentor · IIT Delhi · Live Doubt Solving</p>
          {/* Sound waves */}
          <div className="mt-3 flex items-end gap-0.5 h-4">
            {Array.from({length: 18}).map((_, i) => (
              <div key={i} className="w-0.5 bg-amber-400/60 animate-sound-wave" style={{ height: `${20 + (i * 13) % 80}%`, animationDelay: `${i * 80}ms` }} />
            ))}
          </div>
        </div>
        {/* Chat side */}
        <div className="w-44 border-l border-zinc-800 bg-zinc-900/60 p-2 text-[10px] space-y-1.5">
          <p className="text-zinc-500">Live chat</p>
          <div className="rounded bg-zinc-800/60 px-1.5 py-1 animate-msg-in">Quick doubt on Q5 👆</div>
          <div className="ml-auto w-fit rounded bg-sky-500/20 px-1.5 py-1 text-sky-200 animate-msg-in" style={{ animationDelay: "300ms" }}>Use chain rule 📐</div>
          <div className="rounded bg-zinc-800/60 px-1.5 py-1 animate-msg-in" style={{ animationDelay: "600ms" }}>Got it, thanks!</div>
          <div className="ml-auto w-fit rounded bg-sky-500/20 px-1.5 py-1 text-sky-200 animate-msg-in" style={{ animationDelay: "900ms" }}>👍 +1 hr added</div>
        </div>
      </div>
    ),
    compact: () => (
      <div className="flex h-full w-full items-center gap-1.5 p-1.5">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-amber-400 to-rose-500 text-[10px] font-bold text-white">P</div>
        <div className="flex-1 space-y-0.5 text-[8px]">
          <p className="font-semibold text-zinc-200">Priya M. · LIVE</p>
          <div className="flex items-end gap-px h-3">
            {Array.from({length: 12}).map((_, i) => (
              <div key={i} className="w-0.5 bg-amber-400/70 animate-sound-wave" style={{ height: `${20 + (i * 17) % 80}%`, animationDelay: `${i * 60}ms` }} />
            ))}
          </div>
        </div>
      </div>
    ),
  };
}

// =============================================================
//                        FULLSTACK SCENE
// =============================================================

function FullStackScene(): Scene {
  return {
    hero: () => (
      <div className="flex h-full w-full text-zinc-100">
        {/* Frontend preview */}
        <div className="flex-1 p-3">
          <div className="mb-1.5 flex items-center gap-1 text-[9px] text-zinc-500">
            <div className="flex gap-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </div>
            <span className="ml-1 truncate">app.hivr.com/dashboard</span>
          </div>
          <div className="space-y-1 rounded border border-zinc-800 bg-zinc-900/40 p-2 text-[9px]">
            <div className="flex items-center justify-between"><span className="text-zinc-300 font-semibold">Active contracts</span><span className="text-zinc-500">12</span></div>
            <div className="flex items-center justify-between"><span className="text-zinc-300">Escrow</span><span className="text-emerald-300">₹1.2L</span></div>
            <div className="flex items-center justify-between"><span className="text-zinc-300">Pending</span><span className="text-amber-300">3</span></div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full w-3/4 animate-progress bg-gradient-to-r from-sky-500 to-emerald-500" />
            </div>
          </div>
        </div>
        {/* Backend monitor */}
        <div className="w-44 border-l border-zinc-800 bg-zinc-950/80 p-2 text-[8.5px]">
          <p className="text-zinc-500 mb-1">API · p95 142ms</p>
          <svg viewBox="0 0 100 30" className="h-7 w-full">
            <polyline
              fill="none"
              stroke="rgb(56,189,248)"
              strokeWidth="1.5"
              points="0,20 10,18 20,22 30,15 40,19 50,12 60,17 70,8 80,14 90,6 100,11"
              className="animate-dash"
            />
          </svg>
          <div className="mt-1.5 space-y-0.5">
            <div className="flex justify-between text-emerald-300"><span>✓ /api/contracts</span><span>23ms</span></div>
            <div className="flex justify-between text-emerald-300"><span>✓ /api/vault</span><span>41ms</span></div>
            <div className="flex justify-between text-amber-300"><span>⚠ /api/payments</span><span>312ms</span></div>
          </div>
        </div>
      </div>
    ),
    compact: () => (
      <div className="flex h-full w-full items-center gap-1 p-1.5">
        <div className="flex-1 space-y-0.5 text-[7.5px]">
          <div className="flex items-center gap-1"><span className="h-1 w-1 rounded-full bg-emerald-400" />app.hivr.com</div>
          <div className="h-1 overflow-hidden rounded-full bg-zinc-800"><div className="h-full w-3/4 animate-progress bg-gradient-to-r from-sky-500 to-emerald-500" /></div>
          <div className="flex gap-0.5 text-emerald-300"><span>✓ contracts</span><span>·</span><span>23ms</span></div>
        </div>
        <svg viewBox="0 0 30 20" className="h-10 w-12">
          <polyline fill="none" stroke="rgb(56,189,248)" strokeWidth="1" points="0,15 5,13 10,16 15,10 20,12 25,6 30,9" className="animate-dash" />
        </svg>
      </div>
    ),
  };
}

// =============================================================
//                            AI SCENE
// =============================================================

function AIScene(): Scene {
  return {
    hero: () => (
      <div className="relative h-full w-full p-4 text-zinc-100">
        <p className="text-[10px] uppercase tracking-wider text-zinc-500">RAG · GPT-4o · ctx 12k</p>
        <p className="mt-1 text-xs font-mono">Query: <span className="text-sky-300 animate-type-cursor">"summarise Q3 burn rate"</span></p>
        <div className="mt-2 space-y-1 text-[10px]">
          <div className="rounded bg-zinc-900/60 p-1.5 text-zinc-300 animate-msg-in" style={{animationDelay: "200ms"}}>
            <span className="text-sky-400">chunk_01</span> · finance-report-q3.pdf · 0.91
          </div>
          <div className="rounded bg-zinc-900/60 p-1.5 text-zinc-300 animate-msg-in" style={{animationDelay: "500ms"}}>
            <span className="text-sky-400">chunk_02</span> · runway-2026.xlsx · 0.87
          </div>
          <div className="rounded bg-zinc-900/60 p-1.5 text-zinc-300 animate-msg-in" style={{animationDelay: "800ms"}}>
            <span className="text-sky-400">chunk_03</span> · investor-update.pdf · 0.82
          </div>
        </div>
        {/* Token-by-token streaming */}
        <div className="mt-2 rounded border border-emerald-500/30 bg-emerald-500/5 p-2 text-[10px] text-emerald-200">
          <p className="font-mono">
            <span className="animate-stream">$1.2M burn, 18mo runway at current pace.</span>
            <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-emerald-300" />
          </p>
        </div>
        {/* Floating tokens */}
        <div className="pointer-events-none absolute inset-0">
          {["[CLS]", "[SEP]", "[MASK]", "[PAD]"].map((t, i) => (
            <span key={i} className="absolute font-mono text-[9px] text-violet-300/50 animate-float-token"
              style={{ top: `${10 + i * 18}%`, left: `${70 + (i % 2) * 12}%`, animationDelay: `${i * 200}ms` }}>{t}</span>
          ))}
        </div>
      </div>
    ),
    compact: () => (
      <div className="flex h-full w-full items-center gap-1 p-1.5 text-[8px] font-mono">
        <div className="flex-1">
          <p className="text-zinc-300">"summarise Q3 burn"</p>
          <div className="mt-0.5 h-0.5 overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full animate-progress bg-gradient-to-r from-violet-500 to-emerald-500" style={{width: "85%"}} />
          </div>
        </div>
        <span className="font-mono text-violet-300/60 text-[10px] animate-pulse">[AI]</span>
      </div>
    ),
  };
}

// =============================================================
//                            NLP SCENE
// =============================================================

function NLPScene(): Scene {
  return {
    hero: () => (
      <div className="flex h-full w-full p-4 text-zinc-100">
        <div className="flex-1 space-y-1.5">
          <p className="text-[9px] uppercase tracking-wider text-zinc-500">hi → en, ta, te, bn, mr</p>
          <p className="text-xs font-semibold">"नमस्ते, मैं ठीक हूँ।"</p>
          <div className="grid grid-cols-3 gap-1.5 text-[9px]">
            {["Hello, I am fine.",",, ,", "নমস্কার, আমি ভাল আছি."].map((t, i) => (
              <div key={i} className="rounded border border-zinc-800 bg-zinc-900/40 p-1.5 animate-msg-in" style={{animationDelay: `${i * 300}ms`}}>
                <p className="text-zinc-300">{t}</p>
                <p className="text-[8px] text-zinc-500">conf {(94 - i * 3).toFixed(0)}%</p>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 text-[9px] text-zinc-500">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            5 languages · 47ms / 1k tokens
          </div>
        </div>
      </div>
    ),
    compact: () => (
      <div className="flex h-full w-full items-center gap-1 p-1.5 text-[8px]">
        <span className="text-amber-300 font-semibold">नमस्ते</span>
        <span className="text-zinc-500">→</span>
        <span className="text-zinc-300">Hello</span>
        <span className="ml-auto text-emerald-400">94%</span>
      </div>
    ),
  };
}

// =============================================================
//                          DESIGN SCENE
// =============================================================

function DesignScene(): Scene {
  return {
    hero: () => (
      <div className="flex h-full w-full p-3 text-zinc-100">
        <div className="flex-1 rounded border border-zinc-800 bg-zinc-900/40 p-2">
          <div className="flex items-center gap-1.5 text-[9px] text-zinc-500">
            <span>🎨</span> Figma · wireframe v3
          </div>
          {/* Animated wireframe */}
          <div className="mt-1.5 space-y-1">
            <div className="h-2 w-3/4 rounded bg-zinc-700 animate-bar-grow" />
            <div className="h-1.5 w-1/2 rounded bg-zinc-700/70 animate-bar-grow" style={{animationDelay: "100ms"}} />
            <div className="grid grid-cols-3 gap-1 mt-1.5">
              {[1,2,3].map(i => <div key={i} className="aspect-square rounded bg-gradient-to-br from-violet-500/30 to-pink-500/20 border border-violet-500/30 animate-fade-in" style={{animationDelay: `${i * 200}ms`}} />)}
            </div>
            <div className="mt-1.5 flex gap-1">
              <div className="h-5 flex-1 rounded bg-sky-500/30 border border-sky-500/40 animate-fade-in" style={{animationDelay: "600ms"}} />
              <div className="h-5 w-8 rounded bg-pink-500/30 border border-pink-500/40 animate-fade-in" style={{animationDelay: "700ms"}} />
            </div>
          </div>
        </div>
      </div>
    ),
    compact: () => (
      <div className="flex h-full w-full items-center gap-1 p-1.5">
        <div className="grid flex-1 grid-cols-3 gap-0.5">
          {Array.from({length: 3}).map((_, i) => (
            <div key={i} className="aspect-square rounded-sm bg-gradient-to-br from-violet-500/30 to-pink-500/20 border border-violet-500/30 animate-fade-in" style={{animationDelay: `${i * 150}ms`}} />
          ))}
        </div>
        <span className="text-[8px] text-zinc-400">v3</span>
      </div>
    ),
  };
}

// =============================================================
//                          DEVOPS SCENE
// =============================================================

function DevOpsScene(): Scene {
  return {
    hero: () => (
      <div className="flex h-full w-full p-3 text-zinc-100">
        <div className="flex-1 space-y-1.5">
          <p className="text-[9px] uppercase tracking-wider text-zinc-500">CI/CD · main → prod</p>
          {["lint ✓", "test ✓", "build ✓", "deploy ✓"].map((step, i) => (
            <div key={i} className="flex items-center gap-2 rounded bg-zinc-900/40 px-2 py-1 text-[10px] animate-fade-up" style={{animationDelay: `${i * 250}ms`}}>
              <span className={cn(
                "h-1.5 w-1.5 rounded-full",
                i === 3 ? "bg-emerald-400 animate-pulse" : "bg-emerald-500"
              )} />
              <span className="text-zinc-300 flex-1">{step}</span>
              <span className="text-[8px] text-zinc-500 font-mono">{(i + 1) * 12}s</span>
            </div>
          ))}
          <div className="mt-2 rounded border border-emerald-500/30 bg-emerald-500/5 px-2 py-1 text-[9px] text-emerald-300">
            ✓ main @ 7f3a91c → prod · 4.2s
          </div>
        </div>
      </div>
    ),
    compact: () => (
      <div className="flex h-full w-full items-center gap-1 p-1.5 text-[8px] font-mono">
        <span className="text-emerald-400">✓</span>
        <span className="text-zinc-300">main → prod</span>
        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
      </div>
    ),
  };
}

// =============================================================
//                          MOBILE SCENE
// =============================================================

function MobileScene(): Scene {
  return {
    hero: () => (
      <div className="flex h-full w-full items-center justify-center gap-4 p-3 text-zinc-100">
        {/* Phone frame */}
        <div className="relative h-44 w-20 rounded-2xl border-2 border-zinc-700 bg-zinc-950 p-1 shadow-2xl">
          <div className="h-full w-full rounded-xl bg-gradient-to-b from-sky-500/20 to-violet-500/20 overflow-hidden">
            <div className="mt-0.5 flex justify-center"><div className="h-1 w-6 rounded-full bg-zinc-800" /></div>
            <div className="mt-1.5 mx-1 space-y-1">
              <div className="h-1.5 rounded bg-zinc-700 animate-bar-grow" style={{width: "70%"}} />
              <div className="h-1 rounded bg-zinc-700/60 animate-bar-grow" style={{width: "50%", animationDelay: "100ms"}} />
              <div className="mt-1 grid grid-cols-2 gap-1">
                {[1,2,3,4].map(i => (
                  <div key={i} className="aspect-square rounded bg-zinc-800/80 border border-zinc-700 animate-fade-in" style={{animationDelay: `${i * 100}ms`}} />
                ))}
              </div>
            </div>
          </div>
        </div>
        {/* Logs / progress */}
        <div className="flex-1 space-y-1.5 text-[10px]">
          <p className="text-zinc-500">iOS · Android · RN</p>
          <div className="rounded border border-zinc-800 bg-zinc-900/40 p-2 space-y-0.5">
            <div className="flex justify-between text-emerald-300"><span>✓ build 142</span><span>4.2MB</span></div>
            <div className="flex justify-between text-sky-300"><span>↗ TestFlight</span><span>2 testers</span></div>
            <div className="flex justify-between text-amber-300"><span>⚠ Android</span><span>1 warning</span></div>
            <div className="flex justify-between text-zinc-400"><span>store: pending</span><span>—</span></div>
          </div>
        </div>
      </div>
    ),
    compact: () => (
      <div className="flex h-full w-full items-center gap-1.5 p-1.5">
        <div className="relative h-12 w-5 rounded border border-zinc-700 bg-gradient-to-b from-sky-500/30 to-violet-500/30">
          <div className="mt-0.5 mx-auto h-0.5 w-2 rounded-full bg-zinc-600" />
          <div className="mt-1 mx-0.5 space-y-0.5">
            <div className="h-0.5 rounded bg-zinc-500/60 animate-bar-grow" style={{width: "60%"}} />
            <div className="grid grid-cols-2 gap-0.5">
              <div className="aspect-square rounded-sm bg-zinc-700/60" />
              <div className="aspect-square rounded-sm bg-zinc-700/60" />
            </div>
          </div>
        </div>
        <div className="text-[8px] text-zinc-300">iOS · Android</div>
      </div>
    ),
  };
}

// =============================================================
//                         SECURITY SCENE
// =============================================================

function SecurityScene(): Scene {
  return {
    hero: () => (
      <div className="flex h-full w-full items-center justify-center p-4 text-zinc-100">
        <div className="relative">
          {/* Concentric shield rings */}
          <svg viewBox="0 0 120 120" className="h-24 w-24">
            <circle cx="60" cy="60" r="55" fill="none" stroke="rgb(244,63,94)" strokeOpacity="0.3" strokeWidth="1" className="animate-ping-slow" />
            <circle cx="60" cy="60" r="42" fill="none" stroke="rgb(244,63,94)" strokeOpacity="0.5" strokeWidth="1" className="animate-ping-slow" style={{animationDelay: "300ms"}} />
            <circle cx="60" cy="60" r="30" fill="none" stroke="rgb(244,63,94)" strokeOpacity="0.7" strokeWidth="1" className="animate-ping-slow" style={{animationDelay: "600ms"}} />
            <path d="M60 35 L82 47 L82 65 Q82 78 60 88 Q38 78 38 65 L38 47 Z" fill="rgb(244,63,94)" fillOpacity="0.15" stroke="rgb(244,63,94)" strokeWidth="1.5" />
            <text x="60" y="65" textAnchor="middle" className="fill-rose-300 text-[8px] font-mono">SEC</text>
          </svg>
          {/* Threat ticks */}
          {Array.from({length: 4}).map((_, i) => (
            <div key={i} className="absolute font-mono text-[8px] text-rose-300/80 animate-fade-in"
              style={{ top: `${10 + i * 22}%`, left: i % 2 === 0 ? "-25%" : "115%", animationDelay: `${i * 200}ms` }}>
              ⚠ threat_{i + 1}
            </div>
          ))}
        </div>
      </div>
    ),
    compact: () => (
      <div className="flex h-full w-full items-center justify-center p-1.5">
        <svg viewBox="0 0 40 40" className="h-10 w-10">
          <circle cx="20" cy="20" r="18" fill="none" stroke="rgb(244,63,94)" strokeOpacity="0.5" className="animate-ping-slow" />
          <path d="M20 12 L28 16 L28 23 Q28 28 20 31 Q12 28 12 23 L12 16 Z" fill="rgb(244,63,94)" fillOpacity="0.3" stroke="rgb(244,63,94)" />
        </svg>
      </div>
    ),
  };
}

// =============================================================
//                            PM SCENE
// =============================================================

function PMScene(): Scene {
  return {
    hero: () => (
      <div className="flex h-full w-full p-3 text-zinc-100">
        <div className="flex-1">
          <p className="text-[9px] uppercase tracking-wider text-zinc-500">Kanban · Sprint 14</p>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
            {["Todo", "Doing", "Done"].map((col, i) => (
              <div key={col} className="space-y-1">
                <p className="text-[8px] text-zinc-500 text-center">{col}</p>
                {[0, 1].slice(0, col === "Todo" ? 2 : col === "Doing" ? 1 : 1).map((j) => (
                  <div key={j} className="rounded border border-zinc-800 bg-zinc-900/50 p-1 text-[8px] animate-fade-in"
                    style={{animationDelay: `${(i * 2 + j) * 120}ms`}}>
                    <div className="h-0.5 w-2/3 rounded bg-zinc-700 mb-0.5" />
                    <div className="h-0.5 w-1/2 rounded bg-zinc-700/60" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    compact: () => (
      <div className="flex h-full w-full items-center gap-0.5 p-1.5">
        <div className="flex-1 grid grid-cols-3 gap-0.5">
          {[2,1,1].map((n, i) => (
            <div key={i} className="space-y-0.5">
              {Array.from({length: n}).map((_, j) => (
                <div key={j} className="h-2 rounded-sm bg-zinc-700/60 animate-fade-in" style={{animationDelay: `${(i * 2 + j) * 80}ms`}} />
              ))}
            </div>
          ))}
        </div>
      </div>
    ),
  };
}

// =============================================================
//                          CONTENT SCENE
// =============================================================

function ContentScene(): Scene {
  return {
    hero: () => (
      <div className="flex h-full w-full p-3 text-zinc-100">
        <div className="flex-1 rounded border border-zinc-800 bg-zinc-900/40 p-2.5">
          <p className="text-[9px] uppercase tracking-wider text-zinc-500">Blog · "Why escrow matters"</p>
          <p className="mt-1 text-xs font-semibold">Why escrow matters more than ever in 2026</p>
          <p className="mt-1.5 text-[10px] text-zinc-300 leading-relaxed">
            <span className="animate-type-cursor">HiVR's escrow protects both parties by holding funds until the work is approved — a radical shift from the off-platform chaos most freelancers face today. The milestone-based system means </span>
            <span className="inline-block h-3 w-1 animate-pulse bg-amber-300 align-middle" />
          </p>
          <p className="mt-2 text-[8px] text-zinc-500">1,247 words · ~6 min read</p>
        </div>
      </div>
    ),
    compact: () => (
      <div className="flex h-full w-full items-center gap-1.5 p-1.5 text-[8px]">
        <div className="flex-1 space-y-0.5">
          <div className="h-1 w-3/4 rounded bg-zinc-300 animate-bar-grow" />
          <div className="h-0.5 w-1/2 rounded bg-zinc-600 animate-bar-grow" style={{animationDelay: "100ms"}} />
        </div>
        <span className="text-zinc-500 font-mono animate-pulse">|</span>
      </div>
    ),
  };
}

// =============================================================
//                          FINANCE SCENE
// =============================================================

function FinanceScene(): Scene {
  return {
    hero: () => (
      <div className="flex h-full w-full p-4 text-zinc-100">
        <div className="grid flex-1 grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <p className="text-[9px] uppercase tracking-wider text-zinc-500">Q3 · GST · TDS</p>
            <div className="rounded border border-zinc-800 bg-zinc-900/40 p-2 space-y-1 text-[10px]">
              {[
                ["Revenue", "₹24.6L", "emerald"],
                ["GST paid", "₹4.4L", "zinc"],
                ["TDS", "₹1.2L", "zinc"],
                ["Net", "₹19.0L", "sky"],
              ].map(([l, v, c], i) => (
                <div key={l} className="flex items-center justify-between animate-fade-up" style={{animationDelay: `${i * 100}ms`}}>
                  <span className="text-zinc-400">{l}</span>
                  <span className={cn(
                    "font-mono font-semibold",
                    c === "emerald" && "text-emerald-300",
                    c === "sky" && "text-sky-300"
                  )}>{v}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded border border-zinc-800 bg-zinc-900/40 p-2">
            <p className="text-[9px] text-zinc-500">Reconcile · Mar 2026</p>
            <div className="mt-1.5 grid grid-cols-4 gap-1">
              {Array.from({length: 28}).map((_, i) => (
                <div key={i} className={cn(
                  "h-3 rounded-sm",
                  (i * 7) % 3 === 0 ? "bg-emerald-500/40" :
                  (i * 7) % 5 === 0 ? "bg-amber-500/30" :
                  "bg-zinc-800/60"
                )} />
              ))}
            </div>
            <p className="mt-1.5 text-[8px] text-emerald-300">✓ 0 mismatches</p>
          </div>
        </div>
      </div>
    ),
    compact: () => (
      <div className="flex h-full w-full items-center gap-1 p-1.5 text-[8px]">
        <span className="text-zinc-300 font-mono">₹19.0L</span>
        <span className="text-emerald-400">net</span>
        <span className="ml-auto text-[8px] text-emerald-400">✓ 0 mismatches</span>
      </div>
    ),
  };
}

// =============================================================
//                         LABELING SCENE
// =============================================================

function LabelingScene(): Scene {
  return (
    {
      hero: () => (
        <div className="flex h-full w-full p-3 text-zinc-100">
          <div className="flex-1 space-y-1.5">
            <p className="text-[9px] uppercase tracking-wider text-zinc-500">Label queue · 142 / 480</p>
            <div className="rounded border border-zinc-800 bg-zinc-900/40 p-2 space-y-1 text-[9px]">
              {[
                ["x-ray 142.jpg", "fracture"],
                ["x-ray 143.jpg", "normal"],
                ["x-ray 144.jpg", "fracture · radius"],
                ["x-ray 145.jpg", "normal"],
              ].map(([f, t], i) => (
                <div key={i} className="flex items-center gap-2 animate-fade-in" style={{animationDelay: `${i * 150}ms`}}>
                  <span className="text-zinc-500 font-mono">{f}</span>
                  <span className="text-zinc-500">→</span>
                  <span className={cn(
                    "rounded px-1 py-0.5 font-mono",
                    t === "normal" ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"
                  )}>{t}</span>
                </div>
              ))}
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full w-[29.6%] animate-progress bg-gradient-to-r from-amber-500 to-emerald-500" />
            </div>
          </div>
        </div>
      ),
      compact: () => (
        <div className="flex h-full w-full items-center gap-1 p-1.5 text-[8px]">
          <span className="text-zinc-500 font-mono">142/480</span>
          <div className="flex-1 h-1 rounded-full bg-zinc-800 overflow-hidden">
            <div className="h-full w-[30%] animate-progress bg-gradient-to-r from-amber-500 to-emerald-500" />
          </div>
          <span className="text-emerald-400">fracture</span>
        </div>
      ),
    } as Scene
  );
}

// =============================================================
//                            VA SCENE
// =============================================================

function VAScene(): Scene {
  return {
    hero: () => (
      <div className="flex h-full w-full p-3 text-zinc-100">
        <div className="flex-1 space-y-1">
          <p className="text-[9px] uppercase tracking-wider text-zinc-500">Inbox · triaging</p>
          {[
            { from: "Acme Corp", subj: "Q4 contract renewal", tag: "urgent", color: "rose" },
            { from: "Stripe",    subj: "Receipt #2831",        tag: "finance", color: "emerald" },
            { from: "GitHub",    subj: "PR #142 ready",        tag: "review",  color: "sky" },
            { from: "Figma",     subj: "v3 comments",          tag: "design",  color: "violet" },
          ].map((e, i) => (
            <div key={i} className="flex items-center gap-1.5 rounded bg-zinc-900/40 px-2 py-1 text-[9px] animate-fade-in" style={{animationDelay: `${i * 150}ms`}}>
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
              <span className="text-zinc-400 truncate w-20">{e.from}</span>
              <span className="flex-1 truncate text-zinc-300">{e.subj}</span>
              <span className={cn("rounded px-1 text-[8px]", `bg-${e.color}-500/20 text-${e.color}-300`)}>{e.tag}</span>
            </div>
          ))}
        </div>
      </div>
    ),
    compact: () => (
      <div className="flex h-full w-full items-center gap-1 p-1.5 text-[8px]">
        <span className="text-zinc-400">Acme · Q4 renewal</span>
        <span className="ml-auto rounded bg-rose-500/20 text-rose-300 px-1">urgent</span>
      </div>
    ),
  };
}

// =============================================================
//                        TRANSLATION SCENE
// =============================================================

function TranslationScene(): Scene {
  return {
    hero: () => (
      <div className="grid h-full w-full grid-cols-2 gap-px bg-zinc-800 text-zinc-100">
        <div className="bg-zinc-950 p-3">
          <p className="text-[9px] uppercase tracking-wider text-zinc-500">en-US</p>
          <p className="mt-1 text-xs leading-relaxed">"The quick brown fox jumps over the lazy dog. A stitch in time saves nine."</p>
        </div>
        <div className="bg-zinc-950 p-3">
          <p className="text-[9px] uppercase tracking-wider text-emerald-400">ja-JP</p>
          <p className="mt-1 text-xs leading-relaxed text-emerald-200">
            <span className="animate-stream">「茶が熱いうちに飲め。 九針の縫合は時間の節約になる。」</span>
            <span className="inline-block h-3 w-1 animate-pulse bg-emerald-300" />
          </p>
        </div>
        <div className="col-span-2 bg-zinc-900/60 px-3 py-1 text-[9px] text-zinc-500">
          <span className="text-emerald-400">98.4% confidence</span> · 12 languages · 47ms / 1k tokens
        </div>
      </div>
    ),
    compact: () => (
      <div className="flex h-full w-full items-center gap-1 p-1.5 text-[8px]">
        <span className="text-zinc-400">EN</span>
        <span className="text-zinc-500">→</span>
        <span className="text-emerald-300">JA</span>
        <span className="ml-auto text-emerald-400">98%</span>
      </div>
    ),
  };
}

// =============================================================
//                        CONSULTING SCENE
// =============================================================

function ConsultingScene(): Scene {
  return {
    hero: () => (
      <div className="flex h-full w-full items-center justify-center p-4 text-zinc-100">
        <div className="relative">
          {/* Rotating compass */}
          <svg viewBox="0 0 100 100" className="h-32 w-32">
            <circle cx="50" cy="50" r="46" fill="none" stroke="rgb(245,158,11)" strokeOpacity="0.3" strokeWidth="1" />
            <circle cx="50" cy="50" r="36" fill="none" stroke="rgb(245,158,11)" strokeOpacity="0.5" strokeWidth="1" strokeDasharray="2 4" className="animate-spin-slow" />
            <g className="animate-spin-slow" style={{ transformOrigin: "50px 50px" }}>
              <path d="M50 14 L54 50 L50 86 L46 50 Z" fill="rgb(245,158,11)" fillOpacity="0.4" />
              <path d="M14 50 L50 54 L86 50 L50 46 Z" fill="rgb(245,158,11)" fillOpacity="0.2" />
              <circle cx="50" cy="50" r="3" fill="rgb(245,158,11)" />
            </g>
            <text x="50" y="98" textAnchor="middle" className="fill-amber-300/70 text-[6px] font-mono">N</text>
          </svg>
          {/* Floating insights */}
          {[
            { label: "TAM", value: "$2.4B" },
            { label: "CAC", value: "$120" },
            { label: "LTV", value: "$1.8k" },
          ].map((s, i) => (
            <div key={i} className="absolute font-mono text-[9px] text-amber-200 animate-fade-in"
              style={{ top: `${[20, 45, 70][i]}%`, left: i % 2 === 0 ? "5%" : "85%", animationDelay: `${i * 200}ms` }}>
              <span className="text-amber-400">{s.label}</span> <span className="text-amber-200">{s.value}</span>
            </div>
          ))}
        </div>
      </div>
    ),
    compact: () => (
      <div className="flex h-full w-full items-center justify-center p-1.5">
        <svg viewBox="0 0 40 40" className="h-10 w-10">
          <circle cx="20" cy="20" r="16" fill="none" stroke="rgb(245,158,11)" strokeOpacity="0.4" />
          <g className="animate-spin-slow" style={{ transformOrigin: "20px 20px" }}>
            <path d="M20 4 L22 20 L20 36 L18 20 Z" fill="rgb(245,158,11)" fillOpacity="0.6" />
          </g>
        </svg>
      </div>
    ),
  };
}

// =============================================================
//   PUBLIC: the full "Categories in action" showcase section
// =============================================================

import { Sparkles, ArrowRight, Lock, Check } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const CATEGORY_CATALOG: Array<{
  id: CategoryId;
  name: string;
  tier: "tierA" | "tierB";
  status: "active" | "coming_soon";
  blurb: string;
  href: string;
}> = [
  // Tier A (live)
  { id: "spreadsheet", name: "Spreadsheet & Data",       tier: "tierA", status: "active",      blurb: "CRM hygiene, multi-source reconciliation, messy digitization",  href: "/categories/spreadsheet-data-work" },
  { id: "tech",        name: "Tech Micro-Tasks",         tier: "tierA", status: "active",      blurb: "Real-codebase bug fixes, deploy help, code review",            href: "/categories/tech-micro-tasks" },
  { id: "mentoring",   name: "Mentoring & Doubt-Solving",tier: "tierA", status: "active",      blurb: "Live 1:1 sessions, exam strategy, ongoing accountability",     href: "/categories/mentoring-live-doubt-solving" },
  // Tier B (live)
  { id: "fullstack",   name: "Full Stack Dev",           tier: "tierB", status: "active",      blurb: "Embedded feature buildouts, MVP sprints, legacy maintenance",   href: "/categories/fullstack-dev" },
  { id: "ai",          name: "AI / ML Engineering",      tier: "tierB", status: "active",      blurb: "RAG, agents, fine-tuning, ML pipeline engineering",            href: "/categories/ai-ml-engineering" },
  { id: "nlp",         name: "NLP & Data Science",       tier: "tierB", status: "active",      blurb: "Domain-specific NLP, regional languages, applied data science", href: "/categories/nlp-data-science" },
  // Tier B (coming soon)
  { id: "design",      name: "Design",                   tier: "tierB", status: "coming_soon", blurb: "Iterative research, wireframes, stakeholder-facing iteration",   href: "/categories/design" },
  { id: "devops",      name: "DevOps & Cloud",           tier: "tierB", status: "coming_soon", blurb: "Ongoing management of real cloud / CI-CD / infra",               href: "/categories/devops-cloud" },
  { id: "mobile",      name: "Mobile App Dev",           tier: "tierB", status: "coming_soon", blurb: "iOS / Android / RN on real products over multi-week engagements", href: "/categories/mobile-dev" },
  { id: "security",    name: "Cybersecurity",            tier: "tierB", status: "coming_soon", blurb: "Accountability-shaped work in your actual environment",           href: "/categories/cybersecurity" },
  { id: "pm",          name: "Tech PM",                  tier: "tierB", status: "coming_soon", blurb: "Coordinating a real team / sprint over time",                     href: "/categories/tech-pm" },
  { id: "consulting",  name: "Consulting",               tier: "tierB", status: "coming_soon", blurb: "Judgment-bearing advisory tied to your actual business",          href: "/categories/consulting" },
  // Tier A (coming soon)
  { id: "content",     name: "Content & Copy",           tier: "tierA", status: "coming_soon", blurb: "Brand-voice writing, strategy-aware, not generic blog posts",     href: "/categories/content-writing" },
  { id: "finance",     name: "Finance & Accounts",       tier: "tierA", status: "coming_soon", blurb: "Live bookkeeping, reconciliation in your real accounts",         href: "/categories/finance-accounts" },
  { id: "labeling",    name: "Data Labeling",            tier: "tierA", status: "coming_soon", blurb: "Domain-expert labeling on genuinely ambiguous cases",             href: "/categories/data-labeling" },
  { id: "va",          name: "Virtual Assistant",       tier: "tierA", status: "coming_soon", blurb: "Inbox / calendar / ops with judgment inside your real tools",     href: "/categories/va-ops" },
  { id: "translation", name: "Translation & L10n",      tier: "tierA", status: "coming_soon", blurb: "Domain-aware translation, not generic machine translation",      href: "/categories/translation" },
];

/**
 * Full-section showcase that replaces the old static "Live / Tier A"
 * visual on the landing page. A 4-column grid of 17 category cards,
 * each with its own unique CSS-animated mini-scene.
 */
export function CategoriesInActionSection() {
  return (
    <section className="border-t bg-zinc-950 py-16 md:py-24 text-zinc-100">
      <div className="container">
        <div className="mb-10 max-w-2xl">
          <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-300">
            <Sparkles className="h-3 w-3" />17 categories · 3 live now
          </Badge>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight md:text-4xl">
            Every category, in action.
          </h2>
          <p className="mt-3 text-zinc-400 text-pretty">
            Each one is a real workspace — not a templated gig. Here's what the
            day-to-day actually looks like for every Tier A and Tier B category
            on HiVR, from the active ones today to the ones launching next.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {CATEGORY_CATALOG.map((c) => (
            <Link
              key={c.id}
              href={c.status === "active" ? c.href : "#"}
              className={cn(
                "group relative overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 p-3 transition-all hover:border-amber-500/40",
                c.status !== "active" && "opacity-60"
              )}
            >
              <AnimatedCategoryShowcase category={c.id} />
              <div className="mt-2 flex items-start gap-1.5">
                <Badge
                  variant={c.tier === "tierA" ? "tierA" : "tierB"}
                  className="text-[9px] px-1.5 py-0"
                >
                  {c.tier === "tierA" ? "A" : "B"}
                </Badge>
                <p className="text-xs font-semibold leading-tight">{c.name}</p>
                {c.status === "active" ? (
                  <span className="ml-auto inline-flex items-center gap-0.5 rounded bg-emerald-500/15 px-1 py-0 text-[8px] text-emerald-300">
                    <span className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" />
                    Live
                  </span>
                ) : (
                  <span className="ml-auto inline-flex items-center gap-0.5 rounded bg-zinc-800 px-1 py-0 text-[8px] text-zinc-400">
                    <Lock className="h-2 w-2" />Soon
                  </span>
                )}
              </div>
              <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-zinc-500">
                {c.blurb}
              </p>
              {c.status === "active" && (
                <div className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-amber-400 opacity-0 transition-opacity group-hover:opacity-100">
                  See live <ArrowRight className="h-3 w-3" />
                </div>
              )}
            </Link>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-sm">
          <span className="text-zinc-400">Don't see your category?</span>
          <Button asChild variant="outline" className="border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800">
            <Link href="/categories">
              <Check className="h-3.5 w-3.5" />Join the waitlist for new categories
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
