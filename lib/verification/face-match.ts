import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { perceptualHash, hashSimilarity } from "./index";

let faceLandmarker: FaceLandmarker | null = null;
let loadAttempted = false;

async function getLandmarker(): Promise<FaceLandmarker | null> {
  if (faceLandmarker) return faceLandmarker;
  if (loadAttempted) return null;
  loadAttempted = true;
  try {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm",
    );
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "/wasm/face_landmarker.task",
        delegate: "CPU",
      },
      runningMode: "IMAGE",
      numFaces: 1,
    });
  } catch {
    console.warn("MediaPipe unavailable for face-match, using full-image hash");
  }
  return faceLandmarker;
}

async function cropFace(
  img: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
  margin = 0.3,
): Promise<string | null> {
  const d = await getLandmarker();
  if (!d) return null;
  try {
    const result = d.detect(img);
    if (!result.faceLandmarks || result.faceLandmarks.length === 0) return null;

    const lm = result.faceLandmarks[0];
    const xs = lm.map((p) => p.x);
    const ys = lm.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const fw = maxX - minX;
    const fh = maxY - minY;
    const padX = fw * margin;
    const padY = fh * margin;

    const totalW = img instanceof HTMLVideoElement ? img.videoWidth : img.width;
    const totalH = img instanceof HTMLVideoElement ? img.videoHeight : img.height;

    const sx = Math.max(0, (minX - padX) * totalW);
    const sy = Math.max(0, (minY - padY) * totalH);
    const sw = Math.min(totalW - sx, (fw + padX * 2) * totalW);
    const sh = Math.min(totalH - sy, (fh + padY * 2) * totalH);

    const canvas = document.createElement("canvas");
    canvas.width = 224;
    canvas.height = 224;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 224, 224);
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return null;
  }
}

async function getFullImageHash(
  img: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = 224;
  canvas.height = 224;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(img, 0, 0, 224, 224);
  const url = canvas.toDataURL("image/jpeg", 0.85);
  const i = new Image();
  i.src = url;
  await new Promise((resolve) => { i.onload = resolve; i.onerror = resolve; });
  return perceptualHash(i);
}

export async function compareFaces(
  img1: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
  img2: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
): Promise<{ score: number; isMatch: boolean; error?: string }> {
  try {
    const [crop1, crop2] = await Promise.all([cropFace(img1), cropFace(img2)]);

    if (crop1 && crop2) {
      const imgA = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = crop1;
      });
      const imgB = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = crop2;
      });
      const [hash1, hash2] = await Promise.all([perceptualHash(imgA), perceptualHash(imgB)]);
      const similarity = hashSimilarity(hash1, hash2);
      return { score: similarity, isMatch: similarity >= 55 };
    }

    // Fallback: hash full images (no face crop)
    const [hash1, hash2] = await Promise.all([
      crop1
        ? perceptualHash(await new Promise<HTMLImageElement>((resolve, reject) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = reject;
            i.src = crop1;
          }))
        : getFullImageHash(img1),
      crop2
        ? perceptualHash(await new Promise<HTMLImageElement>((resolve, reject) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = reject;
            i.src = crop2;
          }))
        : getFullImageHash(img2),
    ]);

    if (!hash1) return { score: 0, isMatch: false, error: "Could not hash first image" };
    if (!hash2) return { score: 0, isMatch: false, error: "Could not hash second image" };

    const similarity = hashSimilarity(hash1, hash2);
    return { score: similarity, isMatch: similarity >= 50 };
  } catch (e) {
    return { score: 0, isMatch: false, error: (e as Error).message };
  }
}

export async function loadFaceModels() {
  await getLandmarker();
}
