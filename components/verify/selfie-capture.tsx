"use client";

import * as React from "react";
import { Camera, Loader2, CheckCircle2, AlertTriangle, ShieldCheck, Eye, MoveHorizontal, Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { loadFaceModels, analyzeFrame, type LivenessFrame } from "@/lib/verification/face-liveness";

export type LivenessChallenge = { prompt: string; detected: boolean; score: number };
export type SelfieResult = { selfieBlob: Blob; livenessScore: number; livenessChallenges: LivenessChallenge[] };

const CHALLENGES: { key: string; label: string; icon: typeof Eye; stable: number; check: (f: LivenessFrame) => boolean }[] = [
  { key: "face",       label: "Look at the camera",  icon: Camera,        stable: 5,  check: (f) => f.hasFace && f.faceScore > 0.3 },
  { key: "blink",      label: "Blink twice",          icon: Eye,           stable: 1,  check: () => true },
  { key: "turn",       label: "Turn head left",       icon: MoveHorizontal, stable: 8,  check: (f) => f.headYaw < -0.25 },
  { key: "turn_right", label: "Turn head right",      icon: MoveHorizontal, stable: 8,  check: (f) => f.headYaw > 0.25 },
  { key: "smile",      label: "Smile",                icon: Smile,         stable: 6,  check: (f) => f.smileProb > 0.45 },
];

interface ChallengeState {
  key: string;
  label: string;
  icon: typeof Eye;
  done: boolean;
}

export function SelfieCapture({ onComplete, onCancel }: { onComplete: (r: SelfieResult) => void; onCancel: () => void }) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const animRef = React.useRef<number>(0);

  const [error, setError] = React.useState<string | null>(null);
  const [ready, setReady] = React.useState(false);
  const [phase, setPhase] = React.useState<"loading" | "challenges" | "done" | "failed">("loading");
  const [challenges, setChallenges] = React.useState<ChallengeState[]>(
    CHALLENGES.map((c) => ({ key: c.key, label: c.label, icon: c.icon, done: false })),
  );
  const [currentChallenge, setCurrentChallenge] = React.useState(0);
  const [faceDetected, setFaceDetected] = React.useState(false);
  const [ear, setEar] = React.useState(0);
  const [progress, setProgress] = React.useState(0);
  const [liveValues, setLiveValues] = React.useState({ ear: 0, yaw: 0, smile: 0 });
  const [stuckCount, setStuckCount] = React.useState(0);

  const mountedRef = React.useRef(true);
  const stableFramesRef = React.useRef(0);
  const currentChallengeRef = React.useRef(0);
  const blinkRef = React.useRef({ prevClosed: false, count: 0 });

  async function initCamera() {
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera not supported");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } },
        audio: false,
      });
      if (!mountedRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try { await videoRef.current.play(); } catch { /* play interrupted by unmount */ }
      }
      if (mountedRef.current) setReady(true);
    } catch (e) {
      if (mountedRef.current) setError((e as Error).message);
    }
  }

  React.useEffect(() => {
    mountedRef.current = true;
    loadFaceModels(); // fire-and-forget — loads in background, canvas fallback works immediately
    initCamera();
    return () => {
      mountedRef.current = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  let detectCallCount = 0;

  async function runDetection() {
    const v = videoRef.current;
    if (!v || phaseRef.current === "done") {
      console.log("runDetection: skip (no video or done)");
      return;
    }
    detectCallCount++;
    if (detectCallCount % 60 === 1) {
      console.log("runDetection #" + detectCallCount + " readyState=" + v.readyState);
    }
    if (v.readyState < 2) {
      animRef.current = requestAnimationFrame(runDetection);
      return;
    }
    const frame = await analyzeFrame(v);
    if (!mountedRef.current) return;
    setFaceDetected(frame.hasFace);
    setEar(frame.ear);
    setLiveValues({ ear: frame.ear, yaw: frame.headYaw, smile: frame.smileProb });
    setProgress(stableFramesRef.current);
    setStuckCount((c) => (frame.hasFace ? 0 : Math.min(c + 1, 999)));

    if (frame.hasFace && currentChallengeRef.current < CHALLENGES.length) {
      const ch = CHALLENGES[currentChallengeRef.current];
      let passed = ch.check(frame);
      // Override blink check: count complete blink cycles (open→closed→open)
      if (ch.key === "blink") {
        const ear = frame.ear;
        const valid = ear > 0.1 && ear < 0.5;
        const isClosed = valid && ear < 0.24;
        if (valid && blinkRef.current.prevClosed && !isClosed) {
          blinkRef.current.count++;
        }
        if (valid) blinkRef.current.prevClosed = isClosed;
        passed = blinkRef.current.count >= 2;
      }
      if (passed) {
        stableFramesRef.current++;
        if (stableFramesRef.current >= ch.stable) {
          setChallenges((prev) => {
            const next = [...prev];
            next[currentChallengeRef.current] = { ...next[currentChallengeRef.current], done: true };
            return next;
          });
          stableFramesRef.current = 0;
          if (currentChallengeRef.current + 1 >= CHALLENGES.length) {
            captureSelfie();
            return;
          }
          currentChallengeRef.current++;
          setCurrentChallenge(currentChallengeRef.current);
          // Reset blink counter for blink challenge
          if (CHALLENGES[currentChallengeRef.current]?.key === "blink") {
            blinkRef.current = { prevClosed: false, count: 0 };
          }
        }
      } else {
        stableFramesRef.current = 0;
      }
    }

    animRef.current = requestAnimationFrame(runDetection);
  }

  const phaseRef = React.useRef(phase);
  phaseRef.current = phase;

  React.useEffect(() => {
    if (ready) {
      setPhase((p) => (p === "loading" ? "challenges" : p));
      const t = setTimeout(() => {
        animRef.current = requestAnimationFrame(runDetection);
      }, 300);
      return () => {
        clearTimeout(t);
        cancelAnimationFrame(animRef.current);
      };
    }
  }, [ready]);

  async function captureSelfie() {
    setPhase("done");
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return;
    c.width = v.videoWidth || 640;
    c.height = v.videoHeight || 640;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.85));
    if (!blob) { setError("Failed to capture"); return; }

    const doneCount = challenges.filter((c) => c.done).length;
    const score = Math.round((doneCount / CHALLENGES.length) * 100);

    // Stop camera
    streamRef.current?.getTracks().forEach((t) => t.stop());

    onComplete({
      selfieBlob: blob,
      livenessScore: score,
      livenessChallenges: challenges.map((c) => ({
        prompt: c.label,
        detected: c.done,
        score: c.done ? 100 : 0,
      })),
    });
  }

  return (
    <div className="space-y-4">
      <div className="relative mx-auto aspect-square w-full max-w-md overflow-hidden rounded-xl border bg-zinc-950">
        <video ref={videoRef} autoPlay muted playsInline className="absolute inset-0 h-full w-full mirror" />
        <canvas ref={canvasRef} className="hidden" />

        {/* Face not detected overlay */}
        {phase === "challenges" && !faceDetected && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-black/60 text-center text-xs text-white">
            <Camera className="mx-auto h-8 w-8 mb-2" />
            <p>Position your face in the frame</p>
            <div className="mt-2 font-mono text-[10px] text-white/70">
              yaw={liveValues.yaw.toFixed(2)} smile={liveValues.smile.toFixed(2)}
            </div>
            {stuckCount > 150 && (
              <div className="mt-2 max-w-[200px] rounded bg-white/10 p-2 text-[10px] font-mono text-left leading-relaxed">
                <p>Stuck {Math.round(stuckCount / 30)}s &mdash; ear={liveValues.ear.toFixed(2)}</p>
                <p className="text-yellow-300">Check console (F12) for logs</p>
              </div>
            )}
          </div>
        )}

        {/* Loading */}
        {phase === "loading" && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-black/60 text-xs text-white">
            <Loader2 className="mx-auto h-6 w-6 animate-spin mb-1" />
            Loading…
          </div>
        )}

        {/* Done overlay */}
        {phase === "done" && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-emerald-500/20">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          </div>
        )}
      </div>

      {/* Challenge list */}
      {phase === "challenges" && (
        <div className="space-y-1.5">
          {challenges.map((ch, i) => {
            const isActive = i === currentChallenge;
            const Icon = ch.icon;
            const curStable = CHALLENGES[currentChallenge]?.stable ?? 2;
            const progressPct = Math.round((progress / curStable) * 100);
            const showProgress = isActive && !ch.done && progress > 0;
            return (
              <div
                key={ch.key}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-1.5 text-xs transition-colors",
                  ch.done && "text-emerald-600 bg-emerald-500/10",
                  isActive && !ch.done && "text-foreground bg-primary/5 border border-primary/20",
                  !ch.done && !isActive && "text-muted-foreground",
                )}
              >
                {ch.done ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                ) : isActive ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                ) : (
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="flex-1">{ch.label}</span>
                {isActive && !ch.done && (
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {ch.key.startsWith("turn") && "yaw=" + liveValues.yaw.toFixed(2)}
                    {ch.key === "smile" && "smile=" + liveValues.smile.toFixed(2)}
                    {ch.key === "blink" && "blinks=" + blinkRef.current.count + "/2"}
                  </span>
                )}
                {showProgress && (
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {progressPct}%
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {phase === "done" && (
        <div className="rounded-xl border-2 border-emerald-500/30 bg-emerald-500/5 p-4 text-center">
          <ShieldCheck className="mx-auto h-8 w-8 text-emerald-500" />
          <p className="mt-1 text-sm font-semibold text-emerald-700">All checks passed</p>
          <p className="text-xs text-muted-foreground">
            {challenges.filter(c => c.done).length}/{CHALLENGES.length} checks passed
          </p>
        </div>
      )}

      {error && (
        <p className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/5 p-2 text-xs text-rose-700">
          <AlertTriangle className="h-3.5 w-3.5" />{error}
        </p>
      )}

      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onCancel}>Back</Button>
        {phase === "failed" && (
          <Button size="sm" variant="outline" onClick={() => { setPhase("challenges"); setCurrentChallenge(0); }}>
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}
