/**
 * lib/verification/facial-liveness.ts
 *
 * Real face tracking using MediaPipe FaceLandmarker.
 * Detects  478 face landmarks with head rotation (yaw/pitch/roll)
 * and facial action blendshapes (eye blink, mouth open, etc.).
 *
 * Runs entirely in the browser via WebGL — no API calls, no server cost.
 * Model loads lazily from Google's CDN on first use (~10MB WASM).
 */

let faceLandmarkerInstance: any = null;
let loadingPromise: Promise<any> | null = null;

export type FaceTrackingResult = {
  yaw: number;      // head rotation left/right  (-180..180)
  pitch: number;    // head rotation up/down      (-180..180)
  roll: number;     // head tilt                  (-180..180)
  leftEyeBlink: number;   // 0=open, 1=closed
  rightEyeBlink: number;  // 0=open, 1=closed
  mouthOpen: number;      // 0=closed, 1=wide open
  mouthSmile: number;     // 0=neutral, 1=full smile
  headCenterX: number;    // 0..1  (normalized face center x)
  headCenterY: number;    // 0..1  (normalized face center y)
} | null;

const BLENDSHAPE_INDICES: Record<string, number> = {
  eyeBlinkLeft: 9,
  eyeBlinkRight: 10,
  mouthOpen: 21,
  mouthSmileLeft: 28,
  mouthSmileRight: 29,
  jawOpen: 24,
};

/**
 * Lazily load the FaceLandmarker model.
 * Returns the instance once ready.
 */
export async function loadFaceLandmarker(): Promise<any> {
  if (faceLandmarkerInstance) return faceLandmarkerInstance;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      const { FaceLandmarker, FilesetResolver } = await import(
        /* webpackMode: "lazy" */
        "@mediapipe/tasks-vision"
      );
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm"
      );
      faceLandmarkerInstance = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        minFaceDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
        numFaces: 1,
      });
      return faceLandmarkerInstance;
    } catch (e) {
      loadingPromise = null;
      throw e;
    }
  })();

  return loadingPromise;
}

/**
 * Track a single video frame and return face data.
 * Call this in a loop (e.g. every 50-100ms).
 */
export async function trackFace(video: HTMLVideoElement): Promise<FaceTrackingResult> {
  try {
    const landmarker = await loadFaceLandmarker();
    const result = landmarker.detectForVideo(video, performance.now());
    if (!result?.faceLandmarks?.length) return null;

    const landmarks = result.faceLandmarks[0];
    const matrix = result.facialTransformationMatrixes?.[0];
    const blendshapes = result.faceBlendshapes?.[0]?.categories ?? [];

    // Extract head rotation from transformation matrix
    let yaw = 0, pitch = 0, roll = 0;
    if (matrix?.data) {
      // The matrix is a 4x4 row-major transformation matrix.
      // We extract Euler angles from the rotation component.
      const m = matrix.data;
      // Yaw = atan2(m[4], m[0])  (rotation around Y)
      // Pitch = asin(-m[8])      (rotation around X)
      // Roll = atan2(m[9], m[10]) (rotation around Z)
      yaw = Math.atan2(m[4], m[0]) * (180 / Math.PI);
      pitch = Math.asin(Math.max(-1, Math.min(1, -m[8]))) * (180 / Math.PI);
      roll = Math.atan2(m[9], m[10]) * (180 / Math.PI);
    }

    // Extract blendshapes
    function getBlendshape(name: string): number {
      const idx = BLENDSHAPE_INDICES[name];
      if (idx !== undefined && blendshapes[idx]) {
        return blendshapes[idx].score;
      }
      return 0;
    }

    // Compute face center from landmarks (use nose tip: landmark 1)
    const nose = landmarks[1];
    const leftCheek = landmarks[234];
    const rightCheek = landmarks[454];

    // Normalize face center (0..1)
    const headCenterX = nose?.x ?? 0.5;
    const headCenterY = nose?.y ?? 0.5;

    return {
      yaw,
      pitch,
      roll,
      leftEyeBlink: getBlendshape("eyeBlinkLeft"),
      rightEyeBlink: getBlendshape("eyeBlinkRight"),
      mouthOpen: Math.max(getBlendshape("mouthOpen"), getBlendshape("jawOpen")),
      mouthSmile: (getBlendshape("mouthSmileLeft") + getBlendshape("mouthSmileRight")) / 2,
      headCenterX,
      headCenterY,
    };
  } catch {
    return null;
  }
}

/**
 * Pre-warm the model (call early in the wizard before the user reaches
 * the selfie step, so it's ready when needed).
 */
export async function prewarmFaceLandmarker(): Promise<void> {
  try {
    await loadFaceLandmarker();
  } catch {
    // Non-fatal — will fall back to canvas detection
  }
}
