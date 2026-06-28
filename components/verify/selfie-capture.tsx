"use client";

import * as React from "react";
import { Camera, Loader2, RefreshCw, ShieldCheck, AlertTriangle, Check, Smile, Eye, ArrowLeft, ArrowRight, Hand } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export type LivenessChallenge = { prompt: string; detected: boolean; score: number };
export type SelfieResult = { selfieBlob: Blob; livenessScore: number; livenessChallenges: LivenessChallenge[] };

type ChallengeKind = "blink" | "turn" | "smile" | "look_up" | "open_mouth";

const PROMPTS: Array<{ key: ChallengeKind; text: string; icon: any }> = [
  { key: "blink",      text: "Blink twice",          icon: Eye },
  { key: "turn",       text: "Turn your head left",  icon: ArrowRight },
  { key: "smile",      text: "Smile",                icon: Smile },
  { key: "look_up",    text: "Look up",              icon: Hand },
  { key: "open_mouth", text: "Open your mouth",      icon: Hand },
];

// Timing per challenge (ms)
const PREPARE_MS = 3000;   // "Get ready" countdown
const ACTION_MS  = 5000;   // Window where user performs the action
const REST_MS    = 1500;   // Brief rest between challenges
const FINAL_HOLD_MS = 1500; // Brief hold after final challenge

/**
 * Selfie capture with sequential liveness challenges.
 *
 * For each challenge, we have 3 phases:
 *   1. PREPARE (3s) — countdown "Get ready…"
 *   2. ACTION  (5s) — the prompt is shown, user does the action, we sample motion
 *   3. REST    (1.5s) — "Great!" / "Try again" feedback, score breakdown
 *
 * Detection is more forgiving than the original: we look for either a
 * sudden spike in motion (blink) OR sustained moderate motion (smile/turn)
 * within the action window.
 */
export function SelfieCapture({ onComplete, onCancel }: { onComplete: (r: SelfieResult) => void; onCancel: () => void }) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  const [error, setError] = React.useState<string | null>(null);
  const [ready, setReady] = React.useState(false);
  const [demo, setDemo] = React.useState(false);
  const [phase, setPhase] = React.useState<"intro" | "prepare" | "action" | "rest" | "capturing" | "done">("intro");
  const [activeIdx, setActiveIdx] = React.useState(0);
  const [challenges, setChallenges] = React.useState<LivenessChallenge[]>([]);
  const [phaseMsLeft, setPhaseMsLeft] = React.useState(0);
  const [fallback, setFallback] = React.useState(false);
  const [fallbackBlob, setFallbackBlob] = React.useState<Blob | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const prompts = React.useMemo(() => {
    const shuffled = [...PROMPTS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 3);
  }, []);

  // ---------- camera bootstrap ----------
  React.useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera not supported in this browser");
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setReady(true);
      } catch (e) {
        const msg = (e as Error).message ?? "Camera unavailable";
        setFallback(true);
        setError(`Camera unavailable — ${msg}. You can upload a still photo instead, but liveness confidence will be lower.`);
      }
    }
    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Countdown ticker — drives the visible timer in the prompt overlay
  React.useEffect(() => {
    if (phase === "intro" || phase === "done" || phase === "capturing") return;
    if (phaseMsLeft <= 0) return;
    const id = setInterval(() => setPhaseMsLeft((v) => Math.max(0, v - 100)), 100);
    return () => clearInterval(id);
  }, [phase, phaseMsLeft]);

  // ---------- motion sampling ----------
  // Computes the average brightness delta between the current frame and
  // the previous one. Returns 0..255 (roughly).
  function sampleMotion(): number {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c || v.videoWidth === 0) return 0;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return 0;
    const prev = (c as any).__prevFrame as ImageData | undefined;
    c.width = 64;
    c.height = 64;
    ctx.drawImage(v, 0, 0, 64, 64);
    const frame = ctx.getImageData(0, 0, 64, 64);
    if (!prev) {
      (c as any).__prevFrame = frame;
      return 0;
    }
    let diff = 0;
    let count = 0;
    for (let i = 0; i < frame.data.length; i += 16) {
      const a = frame.data[i] + frame.data[i + 1] + frame.data[i + 2];
      const b = prev.data[i] + prev.data[i + 1] + prev.data[i + 2];
      diff += Math.abs(a - b);
      count += 1;
    }
    (c as any).__prevFrame = frame;
    return diff / Math.max(1, count) / 3;
  }

  // Sample motion for `duration` ms. Awaits a chain of setTimeout calls
  // so the browser can repaint between samples (so we see real frames).
  async function sampleFor(duration: number): Promise<{ peak: number; avg: number; samples: number[] }> {
    const samples: number[] = [];
    const start = performance.now();
    const sampleEveryMs = 100;
    while (performance.now() - start < duration) {
      const v = sampleMotion();
      if (v > 0) samples.push(v);
      await sleep(sampleEveryMs);
    }
    const peak = samples.length ? Math.max(...samples) : 0;
    const avg = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : 0;
    return { peak, avg, samples };
  }

  // Heuristic: a "real" liveness action produces either a sharp peak
  // (blink) or sustained motion (turn/smile/mouth).
  // Tunable: lowered thresholds so honest attempts pass.
  function detectAction(kind: ChallengeKind, samples: { peak: number; avg: number }): { detected: boolean; score: number } {
    if (samples.peak < 3 && samples.avg < 1) return { detected: false, score: 10 };
    if (kind === "blink") {
      // Blink = short, sharp spike
      if (samples.peak > 6) return { detected: true, score: Math.min(100, 50 + samples.peak * 4) };
      return { detected: false, score: 25 };
    }
    // Turn / smile / look_up / open_mouth = sustained motion
    if (samples.avg > 2 || samples.peak > 10) {
      return { detected: true, score: Math.min(100, 50 + (samples.avg * 10) + (samples.peak * 1.5)) };
    }
    return { detected: false, score: 30 };
  }

  // Demo helper: simulate a passing action
  function fakeSamplesForDemo(): { peak: number; avg: number; samples: number[] } {
    return { peak: 18, avg: 9, samples: [9, 9, 9] };
  }

  // Run one challenge: prepare -> action -> rest
  async function runOne(idx: number): Promise<LivenessChallenge> {
    const prompt = prompts[idx].text;
    const kind = prompts[idx].key;

    // PREPARE — countdown 3..2..1
    setPhase("prepare");
    setPhaseMsLeft(PREPARE_MS);
    await sleep(PREPARE_MS);
    if (demo) await sleep(400);

    // ACTION — show prompt, sample motion
    setPhase("action");
    setPhaseMsLeft(ACTION_MS);
    const { peak, avg, samples } = demo ? fakeSamplesForDemo() : await sampleFor(ACTION_MS);
    const { detected, score } = demo ? { detected: true, score: 92 } : detectAction(kind, { peak, avg });

    // REST — show feedback
    setPhase("rest");
    setPhaseMsLeft(REST_MS);
    await sleep(REST_MS);

    return { prompt, detected, score: Math.round(score) };
  }

  async function runSequence() {
    if (fallback) return;
    setChallenges([]);
    setActiveIdx(0);

    const out: LivenessChallenge[] = [];
    for (let i = 0; i < prompts.length; i++) {
      setActiveIdx(i);
      const result = await runOne(i);
      out.push(result);
      setChallenges((cur) => [...cur, result]);
    }

    setActiveIdx(prompts.length); // past end
    setPhaseMsLeft(FINAL_HOLD_MS);
    setPhase("rest");
    await sleep(FINAL_HOLD_MS);

    // Capture final frame
    setPhase("capturing");
    const finalBlob = await captureFrame();
    if (!finalBlob) {
      setError("Could not capture the final selfie frame. Try again.");
      setPhase("intro");
      return;
    }
    setPhase("done");

    const overall = out.reduce((a, c) => a + c.score, 0) / out.length;
    onComplete({ selfieBlob: finalBlob, livenessScore: Math.round(overall), livenessChallenges: out });
  }

  async function captureFrame(): Promise<Blob | null> {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return null;
    c.width = v.videoWidth || 720;
    c.height = v.videoHeight || 720;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0, c.width, c.height);
    return new Promise<Blob | null>((resolve) => {
      c.toBlob((b) => resolve(b), "image/jpeg", 0.85);
    });
  }

  function onFallbackSelected(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    setFallbackBlob(file);
    onComplete({
      selfieBlob: file,
      livenessScore: 30,
      livenessChallenges: [{ prompt: "fallback-static", detected: false, score: 30 }],
    });
  }

  const secondsLeft = Math.ceil(phaseMsLeft / 1000);
  const isPrepare = phase === "prepare";
  const isAction  = phase === "action";
  const isRest    = phase === "rest";
  const activePrompt = prompts[activeIdx];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-lg font-semibold">Liveness selfie</h3>
          <p className="text-xs text-muted-foreground">
            {fallback
              ? "Camera unavailable — upload a still photo."
              : "Follow each prompt. 3 challenges, 3 seconds to get ready, 5 seconds to act."}
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border bg-muted/30 px-2 py-1 text-[10px]">
          <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} />
          <span>Demo mode</span>
        </label>
      </div>

      <div className="relative aspect-square w-full max-w-sm mx-auto overflow-hidden rounded-xl border bg-zinc-950">
        {!fallback ? (
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="absolute inset-0 h-full w-full object-cover [transform:scaleX(-1)]"
          />
        ) : (
          <div className="grid h-full place-items-center text-zinc-500">
            {fallbackBlob ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={URL.createObjectURL(fallbackBlob)} alt="Selected" className="h-full w-full object-cover" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-sm">
                <Camera className="h-8 w-8" />
                <span>Camera unavailable</span>
                <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                  Choose photo
                </Button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFallbackSelected(e.target.files?.[0] ?? null)} />
              </div>
            )}
          </div>
        )}

        {/* Prepare phase: "Get ready" countdown, prompt hidden */}
        {isPrepare && activePrompt && (
          <div className="absolute inset-0 grid place-items-center bg-black/40 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3 text-white">
              <activePrompt.icon className="h-12 w-12 opacity-80" />
              <p className="text-sm font-semibold uppercase tracking-wider opacity-80">Get ready…</p>
              <p className="text-5xl font-bold tabular-nums">{Math.max(0, secondsLeft)}</p>
              <p className="text-xs opacity-60">Next: {activePrompt.text}</p>
            </div>
          </div>
        )}

        {/* Action phase: big prompt + countdown */}
        {isAction && activePrompt && (
          <div className="absolute inset-x-0 top-3 flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-base font-semibold text-white shadow-lg backdrop-blur">
              <activePrompt.icon className="h-5 w-5" />
              <span>{activePrompt.text}</span>
            </div>
            <div className="rounded-full bg-primary/90 px-3 py-1 text-sm font-bold text-primary-foreground tabular-nums">
              {Math.max(0, secondsLeft)}
            </div>
            <p className="mt-1 text-[10px] uppercase tracking-wider text-white/70">Action window</p>
          </div>
        )}

        {/* Rest phase: feedback per challenge */}
        {isRest && challenges[activeIdx] && (
          <div className={cn(
            "absolute inset-x-0 top-3 flex flex-col items-center gap-1",
          )}>
            <div className={cn(
              "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow-lg backdrop-blur",
              challenges[activeIdx].detected
                ? "bg-emerald-600/90 text-white"
                : "bg-rose-600/90 text-white",
            )}>
              {challenges[activeIdx].detected
                ? <><Check className="h-4 w-4" /> Got it!</>
                : <><AlertTriangle className="h-4 w-4" /> Try again next time</>}
            </div>
            {activeIdx < prompts.length - 1 && (
              <p className="mt-1 text-[10px] text-white/70">
                Next: {prompts[activeIdx + 1].text}
              </p>
            )}
          </div>
        )}

        {/* Frame guide */}
        {phase !== "done" && !fallback && (
          <div className="pointer-events-none absolute inset-6 rounded-full border-2 border-white/30" />
        )}

        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Progress / challenges */}
      <div className="space-y-1">
        <Progress value={(challenges.length / prompts.length) * 100} className="h-1.5" />
        <div className="grid grid-cols-3 gap-1.5 text-[10px]">
          {prompts.map((p, i) => {
            const c = challenges[i];
            const isActive = i === activeIdx && phase !== "intro" && phase !== "done";
            return (
              <div
                key={i}
                className={cn(
                  "flex items-center gap-1 rounded-md border px-2 py-1.5",
                  c
                    ? c.detected
                      ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700"
                      : "border-rose-500/30 bg-rose-500/5 text-rose-700"
                    : isActive
                      ? "border-primary/40 bg-primary/5 text-foreground"
                      : "border-border bg-muted/20 text-muted-foreground",
                )}
              >
                <p.icon className="h-3 w-3 shrink-0" />
                <span className="truncate">{p.text}</span>
                {c
                  ? <span className="ml-auto font-mono">{c.score}</span>
                  : isActive
                    ? <Loader2 className="ml-auto h-3 w-3 animate-spin" />
                    : <span className="ml-auto text-[9px] opacity-50">pending</span>}
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <p className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5" />{error}
        </p>
      )}

      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <ArrowLeft className="h-3.5 w-3.5" />Back
        </Button>
        {phase === "intro" && !fallback && (
          <Button onClick={runSequence} disabled={!ready} variant="gradient">
            <Camera className="h-3.5 w-3.5" />Start liveness check
          </Button>
        )}
        {(phase === "prepare" || phase === "action" || phase === "rest" || phase === "capturing") && (
          <Button onClick={runSequence} variant="outline" size="sm">
            <RefreshCw className="h-3.5 w-3.5" />Restart
          </Button>
        )}
      </div>
    </div>
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function iconForPrompt(prompt: string) {
  if (/blink/i.test(prompt)) return <Eye className="inline h-3 w-3" />;
  if (/smile/i.test(prompt)) return <Smile className="inline h-3 w-3" />;
  return <ArrowRight className="inline h-3 w-3" />;
}
