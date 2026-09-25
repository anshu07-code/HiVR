import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

export interface LivenessFrame {
  hasFace: boolean;
  ear: number;
  headYaw: number;
  smileProb: number;
  faceScore: number;
  method: "mediapipe" | "canvas";
}

// ── MediaPipe (optional enhancement) ───────────────────────────────

let faceLandmarker: FaceLandmarker | null = null;
let mpLoadAttempted = false;

export async function loadFaceModels() {
  if (faceLandmarker) return;
  if (mpLoadAttempted) return;
  mpLoadAttempted = true;
  try {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm",
    );
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "/wasm/face_landmarker.task",
        delegate: "CPU",
      },
      runningMode: "VIDEO",
      numFaces: 1,
      minFaceDetectionConfidence: 0.3,
    });
    console.log("MediaPipe FaceLandmarker loaded OK");
  } catch (e) {
    console.warn("MediaPipe unavailable, using canvas fallback:", e);
  }
}

function analyzeWithMediaPipe(input: HTMLVideoElement | HTMLCanvasElement): LivenessFrame | null {
  if (!faceLandmarker) return null;
  try {
    const ts = performance.now();
    const result = faceLandmarker.detectForVideo(input, ts);
    if (!result.faceLandmarks || result.faceLandmarks.length === 0) return null;
    const lm = result.faceLandmarks[0];

    const L_EYE = [33, 159, 158, 133, 153, 144];
    const R_EYE = [362, 386, 385, 263, 374, 380];
    const NOSE = 1;
    const MOUTH_L = 61;
    const MOUTH_R = 291;

    function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
      return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
    }
    function ear6(pts: { x: number; y: number }[], indices: number[]): number {
      const p = indices.map((i) => pts[i]);
      return (dist(p[1], p[5]) + dist(p[2], p[4])) / (2 * dist(p[0], p[3]));
    }

    const ear = (ear6(lm, L_EYE) + ear6(lm, R_EYE)) / 2;
    const rawYaw = (lm[NOSE].x - 0.5) * 2;
    const headYaw = rawYaw;
    const mw = dist(lm[MOUTH_L], lm[MOUTH_R]);
    const xs = lm.map((p) => p.x);
    const fw = Math.max(...xs) - Math.min(...xs);
    const smileProb = Math.min(1, Math.max(0, ((fw > 0 ? mw / fw : 0) - 0.38) / 0.12));
    const boxW = Math.max(...xs) - Math.min(...xs);
    const w = input instanceof HTMLVideoElement ? input.videoWidth || 640 : input.width || 640;
    const faceScore = Math.min(1, (boxW * w) / 320);

    if (frameCount % 10 === 1) {
      console.log(
        "MP ear=" + ear.toFixed(3) + " yaw=" + headYaw.toFixed(3) + " smile=" + smileProb.toFixed(3),
      );
    }
    return { hasFace: true, ear, headYaw, smileProb, faceScore, method: "mediapipe" };
  } catch (e) {
    console.warn("MediaPipe analyze error:", e);
    return null;
  }
}

// ── Canvas fallback (always works) ─────────────────────────────────

let canvasEl: HTMLCanvasElement | null = null;
let prevFrame: ImageData | null = null;
let eyeHist: number[] = [];
let blinkFlag = false;
let smoothYaw = 0;
let smoothSmile = 0;

function getCanvas(w: number, h: number): HTMLCanvasElement {
  if (!canvasEl || canvasEl.width !== w || canvasEl.height !== h) {
    canvasEl = document.createElement("canvas");
    canvasEl.width = w;
    canvasEl.height = h;
  }
  return canvasEl;
}

function analyzeWithCanvas(input: HTMLVideoElement | HTMLCanvasElement): LivenessFrame {
  try {
    const w = input instanceof HTMLVideoElement ? input.videoWidth || 640 : input.width || 640;
    const h = input instanceof HTMLVideoElement ? input.videoHeight || 480 : input.height || 480;
    if (w === 0 || h === 0) {
      console.log("Canvas: zero dimensions");
      return { hasFace: false, ear: 0.35, headYaw: 0, smileProb: 0, faceScore: 0, method: "canvas" };
    }

    // Scale down for performance
    const sw = 80;
    const sh = Math.round((sw / w) * h);
    if (sh < 10) {
      console.log("Canvas: too small");
      return { hasFace: false, ear: 0.35, headYaw: 0, smileProb: 0, faceScore: 0, method: "canvas" };
    }

    const canvas = getCanvas(sw, sh);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      console.log("Canvas: no 2d context");
      return { hasFace: false, ear: 0.35, headYaw: 0, smileProb: 0, faceScore: 0, method: "canvas" };
    }
    ctx.drawImage(input, 0, 0, sw, sh);
    const data = ctx.getImageData(0, 0, sw, sh);
    const pixels = data.data;

    // ── Broad skin detection ──────────────────────────────────────
    // Use multiple methods: HSV + simple luminance + warm-tone check
    let skinCount = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const min = Math.min(r, g, b);
      const max = Math.max(r, g, b);

      // Method 1: simple heuristic - warm-toned pixels (more red than blue)
      const warm = r > b && r > 40 && g > 20 && b > 10;
      // Method 2: not too dark, not too bright, not pure gray
      const lit = max > 50 && max < 230 && (max - min) > 15;
      // Method 3: face-friendly hue range (approximate)
      const hueOk = r > g * 0.7 && r > b * 0.6 && g > b * 0.5;

      if (warm && lit && hueOk) {
        skinCount++;
      }
    }
    const skinRatio = skinCount / (sw * sh);

    // ── Motion via frame differencing ─────────────────────────────
    const motion = prevFrame
      ? (() => {
          let diff = 0;
          const total = pixels.length / 4;
          for (let i = 0; i < pixels.length; i += 16) {
            const pi = prevFrame.data[i];
            const ci = pixels[i];
            const pi1 = prevFrame.data[i + 1];
            const ci1 = pixels[i + 1];
            const pi2 = prevFrame.data[i + 2];
            const ci2 = pixels[i + 2];
            if (Math.abs(pi - ci) + Math.abs(pi1 - ci1) + Math.abs(pi2 - ci2) > 60) diff++;
          }
          return diff / Math.max(1, total / 4);
        })()
      : 0;
    prevFrame = data;

    // Face present if skin > 2% OR significant motion
    const hasFace = skinRatio > 0.02 || motion > 0.3;

    // ── Eye brightness (blink detection) ─────────────────────────
    const eyeY1 = Math.round(sh * 0.2);
    const eyeY2 = Math.round(sh * 0.4);
    const eyeX1 = Math.round(sw * 0.25);
    const eyeX2 = Math.round(sw * 0.75);
    let eyeBright = 0;
    let eyeCount = 0;
    for (let y = eyeY1; y < eyeY2 && y < sh; y++) {
      for (let x = eyeX1; x < eyeX2 && x < sw; x++) {
        const i = (y * sw + x) * 4;
        eyeBright += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
        eyeCount++;
      }
    }
    eyeBright /= Math.max(1, eyeCount);

    eyeHist.push(eyeBright);
    if (eyeHist.length > 15) eyeHist.shift();
    if (eyeHist.length >= 10) {
      const recent = eyeHist.slice(-5);
      const older = eyeHist.slice(-10, -5);
      const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
      const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
      if (olderAvg - recentAvg > 6 && olderAvg - recentAvg < 35) {
        blinkFlag = true;
      }
      if (blinkFlag && recentAvg > olderAvg - 1) {
        blinkFlag = false;
      }
    }
    const ear = blinkFlag ? 0.15 : 0.35;

    // ── Head yaw approximation ────────────────────────────────────
    const midY1 = Math.round(sh * 0.15);
    const midY2 = Math.round(sh * 0.55);
    let leftSum = 0;
    let rightSum = 0;
    let lc = 0;
    let rc = 0;
    const third = Math.round(sw / 3);
    for (let y = midY1; y < midY2 && y < sh; y++) {
      for (let x = 0; x < third && x < sw; x++) {
        const i = (y * sw + x) * 4;
        leftSum += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
        lc++;
      }
      for (let x = sw - third; x < sw && x >= 0; x++) {
        const i = (y * sw + x) * 4;
        rightSum += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
        rc++;
      }
    }
    leftSum /= Math.max(1, lc);
    rightSum /= Math.max(1, rc);
    const rawYawVal = Math.max(-1, Math.min(1, (leftSum - rightSum) / 48));
    smoothYaw = smoothYaw * 0.85 + rawYawVal * 0.15;
    const headYaw = smoothYaw;

    // ── Smile approximation ───────────────────────────────────────
    const mouthY1 = Math.round(sh * 0.55);
    const mouthY2 = Math.round(sh * 0.7);
    const mouthX1 = Math.round(sw * 0.3);
    const mouthX2 = Math.round(sw * 0.7);
    let mouthMean = 0;
    let mc = 0;
    for (let y = mouthY1; y < mouthY2 && y < sh; y++) {
      for (let x = mouthX1; x < mouthX2 && x < sw; x++) {
        const i = (y * sw + x) * 4;
        mouthMean += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
        mc++;
      }
    }
    mouthMean /= Math.max(1, mc);
    let mouthVar = 0;
    for (let y = mouthY1; y < mouthY2 && y < sh; y++) {
      for (let x = mouthX1; x < mouthX2 && x < sw; x++) {
        const i = (y * sw + x) * 4;
        const v = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3 - mouthMean;
        mouthVar += v * v;
      }
    }
    mouthVar /= Math.max(1, mc);
    const rawSmile = Math.min(1, mouthVar / 400);
    smoothSmile = smoothSmile * 0.85 + rawSmile * 0.15;
    const smileProb = smoothSmile;

    // faceScore based on skin ratio *or* motion (whichever is higher)
    const faceScore = Math.min(1, Math.max(skinRatio * 12, motion * 2));

    if (frameCount % 60 === 1) {
      console.log(
        "Canvas skin=" + (skinRatio * 100).toFixed(1) + "% motion=" + motion.toFixed(2) +
        " hasFace=" + hasFace + " score=" + faceScore.toFixed(2),
      );
    }

    return { hasFace, ear, headYaw, smileProb, faceScore, method: "canvas" };
  } catch (e) {
    console.error("Canvas analyze ERROR:", e);
    return { hasFace: false, ear: 0.35, headYaw: 0, smileProb: 0, faceScore: 0, method: "canvas" };
  }
}

// ── Public API ─────────────────────────────────────────────────────

let frameCount = 0;

export async function analyzeFrame(
  input: HTMLVideoElement | HTMLCanvasElement,
): Promise<LivenessFrame> {
  frameCount++;
  const mp = analyzeWithMediaPipe(input);
  if (mp) return mp;
  const result = analyzeWithCanvas(input);
  if (frameCount % 30 === 1) {
    console.log(
      "analyzeFrame #" + frameCount + " method=" + result.method +
      " hasFace=" + result.hasFace + " score=" + result.faceScore.toFixed(2) +
      " ear=" + result.ear.toFixed(2) + " yaw=" + result.headYaw.toFixed(2) +
      " smile=" + result.smileProb.toFixed(2),
    );
  }
  return result;
}
