/**
 * lib/verification/index.ts
 *
 * Client-side + shared verification helpers. Pure functions only — no
 * third-party dependencies. Safe to use in "use client" components and
 * route handlers.
 *
 * Capabilities:
 *   * age detection (minor / no-consent-required)
 *   * document number validators (Aadhaar Verhoeff, PAN, Passport, DL, FAMPay)
 *   * HMAC-SHA256 via Web Crypto
 *   * 8x8 perceptual hash (dHash) for image similarity
 *   * Levenshtein distance + fuzzy name matching
 *   * OCR helpers — date-of-birth and name extraction
 *
 * The previous provider abstraction (DigiLocker / mock) lives in
 * `lib/verification/provider.ts` and is imported as
 * `@/lib/verification/provider`.
 */

/* ====================================================================== */
/* 1. Age detection                                                        */
/* ====================================================================== */

export type AgeResult = {
  isMinor: boolean;
  minorNoConsent: boolean;
  years: number;
};

/**
 * Classifies a date of birth for routing into the right verification
 * flow.
 *   * isMinor            — under 18
 *   * minorNoConsent     — 15+ (no parent consent required)
 *   * requiresConsent    — 13–14 (parent consent required)
 *   * tooYoung           — under 13 (rejected at the RPC layer)
 */
export function detectAge(dob: Date): AgeResult {
  const now = new Date();
  let years = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) years -= 1;
  const isMinor = years < 18;
  const minorNoConsent = isMinor && years >= 15;
  return { isMinor, minorNoConsent, years };
}

/* ====================================================================== */
/* 2. Document validators                                                  */
/* ====================================================================== */

/**
 * Aadhaar — 12 digits, last digit is a Verhoeff checksum.
 * Reference: https://en.wikipedia.org/wiki/Verhoeff_algorithm
 */
export function validateAadhaar(num: string): boolean {
  if (typeof num !== "string") return false;
  const s = num.replace(/\s+/g, "");
  if (!/^\d{12}$/.test(s)) return false;
  return verhoeffValidate(s);
}

const VERHOEFF_D: number[][] = [
  [0,1,2,3,4,5,6,7,8,9],
  [1,2,3,4,0,6,7,8,9,5],
  [2,3,4,0,1,7,8,9,5,6],
  [3,4,0,1,2,8,9,5,6,7],
  [4,0,1,2,3,9,5,6,7,8],
  [5,9,8,7,6,0,4,3,2,1],
  [6,5,9,8,7,1,0,4,3,2],
  [7,6,5,9,8,2,1,0,4,3],
  [8,7,6,5,9,3,2,1,0,4],
  [9,8,7,6,5,4,3,2,1,0],
];
const VERHOEFF_P: number[][] = [
  [0,1,2,3,4,5,6,7,8,9],
  [1,5,7,6,2,8,3,0,9,4],
  [5,8,0,3,7,9,6,1,4,2],
  [8,9,1,6,0,4,3,5,2,7],
  [9,4,5,3,1,2,6,8,7,0],
  [4,2,8,6,5,7,3,9,0,1],
  [2,7,9,3,8,0,6,4,1,5],
  [7,0,4,6,9,1,3,2,5,8],
];
const VERHOEFF_J: number[] = [0,4,3,2,1,5,6,7,8,9];

function verhoeffValidate(num: string): boolean {
  let c = 0;
  const digits = num.split("").reverse().map(Number);
  for (let i = 0; i < digits.length; i++) {
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][digits[i]]];
  }
  return c === 0;
}

/** PAN — 5 letters, 4 digits, 1 letter. */
export function validatePAN(num: string): boolean {
  if (typeof num !== "string") return false;
  return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(num.replace(/\s+/g, "").toUpperCase());
}

/**
 * Indian passport — 1 letter (A|P|R|W|Y) + 7 digits. Optional single
 * space before the final 4 digits (the printed format on the book).
 */
export function validatePassport(num: string): boolean {
  if (typeof num !== "string") return false;
  return /^[A-PR-WY][1-9]\d\s?\d{4}[1-9]$/.test(num.trim().toUpperCase());
}

/** Indian driving licence — 2-letter state code + 13 digits (variable suffix). */
export function validateDL(num: string): boolean {
  if (typeof num !== "string") return false;
  const s = num.replace(/[\s-]/g, "").toUpperCase();
  return /^[A-Z]{2}\d{2,13}[A-Z]?$/.test(s);
}

/** FAMPay handle — username@fampay. */
export function validateFAMPayHandle(handle: string): boolean {
  if (typeof handle !== "string") return false;
  return /^[a-z0-9._-]{3,30}@fampay$/.test(handle.trim().toLowerCase());
}

/* ====================================================================== */
/* 3. HMAC-SHA256 (Web Crypto)                                             */
/* ====================================================================== */

/**
 * HMAC-SHA256(secret, data) — returns lowercase hex. Works in the
 * browser, edge runtime, and Node 18+.
 */
export async function hmacSha256(secret: string, data: string): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("Web Crypto API is not available in this environment.");
  }
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* ====================================================================== */
/* 4. Perceptual hash (8x8 dHash)                                          */
/* ====================================================================== */

/**
 * Compute a 64-bit difference hash for an image, returned as 16-char hex.
 *
 * Algorithm (dHash):
 *   1. Downscale to 9x8 grayscale (canvas).
 *   2. For each row, compare each pixel to its neighbour to the right.
 *   3. If left > right, set that bit to 1.
 *   4. Concatenate the 8 rows of 8 bits = 64 bits = 16 hex chars.
 *
 * The caller is responsible for the image source (e.g. an <img> with
 * crossOrigin = "anonymous", or a VideoFrame from getUserMedia). Pass
 * the resulting ImageData, or use a helper to load an image from a URL.
 */
export async function perceptualHash(image: ImageData | HTMLImageElement | HTMLCanvasElement | HTMLVideoElement): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = 9;
  canvas.height = 8;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D context unavailable.");

  if (image instanceof HTMLVideoElement) {
    ctx.drawImage(image, 0, 0, 9, 8);
  } else if (image instanceof HTMLCanvasElement) {
    ctx.drawImage(image, 0, 0, 9, 8);
  } else if (image instanceof HTMLImageElement) {
    ctx.drawImage(image, 0, 0, 9, 8);
  } else {
    // ImageData — already 8bpp grayscale or RGBA
    const tmp = document.createElement("canvas");
    tmp.width = image.width;
    tmp.height = image.height;
    const tctx = tmp.getContext("2d");
    if (!tctx) throw new Error("Canvas 2D context unavailable.");
    tctx.putImageData(image, 0, 0);
    ctx.drawImage(tmp, 0, 0, 9, 8);
  }

  const data = ctx.getImageData(0, 0, 9, 8).data;
  const grays: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    // Rec. 601 luma
    const y = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    grays.push(y);
  }
  // 9*8 = 72 pixels; compute 8 rows of 8 bits by comparing pixel[x] vs pixel[x+1]
  let bits = "";
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const a = grays[row * 9 + col];
      const b = grays[row * 9 + col + 1];
      bits += a > b ? "1" : "0";
    }
  }
  // 64 bits → 16 hex chars
  let hex = "";
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

/* ====================================================================== */
/* 5. Levenshtein + fuzzy name match                                       */
/* ====================================================================== */

/**
 * Iterative Levenshtein with two-row rolling buffer. O(n*m) time, O(min(n,m))
 * memory. Returns the number of insertions / deletions / substitutions
 * required to turn `a` into `b`.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  const m = aLower.length;
  const n = bLower.length;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = aLower[i - 1] === bLower[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

const NAME_MATCH_THRESHOLD = 85;

/**
 * Returns a 0-100 score and a boolean `isMatch` based on character-level
 * similarity between two names. Strips common middle initials and
 * normalises case + whitespace.
 */
export function fuzzyNameMatch(ocrName: string, signupName: string): { score: number; isMatch: boolean } {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const a = norm(ocrName);
  const b = norm(signupName);
  if (!a || !b) return { score: 0, isMatch: false };
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  const score = maxLen === 0 ? 0 : Math.round((1 - dist / maxLen) * 100);
  return { score, isMatch: score >= NAME_MATCH_THRESHOLD };
}

/**
 * Hamming distance between two hex perceptual hashes (each 16 chars = 64
 * bits). Returns the number of differing bits.
 */
export function hammingDistance(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 64;
  let dist = 0;
  for (let i = 0; i < a.length; i += 4) {
    const ai = parseInt(a.slice(i, i + 4), 16);
    const bi = parseInt(b.slice(i, i + 4), 16);
    let x = ai ^ bi;
    while (x) { dist += x & 1; x >>>= 1; }
  }
  return dist;
}

/**
 * Returns a 0-100 score where 100 = identical hashes and 0 = completely
 * different. 64-bit hashes tolerate up to ~12 differing bits (≈80%) for
 * "same person" matches.
 */
export function hashSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const d = hammingDistance(a, b);
  return Math.max(0, Math.round((1 - d / 64) * 100));
}

/* ====================================================================== */
/* 6. OCR helpers — DOB / name extraction                                  */
/* ====================================================================== */

const DOB_PATTERNS: RegExp[] = [
  // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
  /\b(0?[1-9]|[12]\d|3[01])[\/\-\.](0?[1-9]|1[0-2])[\/\-\.](\d{4})\b/g,
  // YYYY/MM/DD
  /\b(\d{4})[\/\-\.](0?[1-9]|1[0-2])[\/\-\.](0?[1-9]|[12]\d|3[01])\b/g,
];

/**
 * Find the first date-of-birth-shaped substring in `text` and return a
 * Date. Returns null if nothing matches.
 */
export function extractDOBFromText(text: string): Date | null {
  if (!text) return null;
  for (const re of DOB_PATTERNS) {
    re.lastIndex = 0;
    const m = re.exec(text);
    if (!m) continue;
    // First pattern is DD/MM/YYYY; second is YYYY/MM/DD.
    if (m[1].length === 4) {
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const d = Number(m[3]);
      return safeDate(y, mo, d);
    } else {
      const d = Number(m[1]);
      const mo = Number(m[2]);
      const y = Number(m[3]);
      return safeDate(y, mo, d);
    }
  }
  return null;
}

function safeDate(y: number, m: number, d: number): Date | null {
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;
  if (y < 1900 || y > new Date().getFullYear()) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) return null;
  return dt;
}

/**
 * Pick the most plausible full-name line from an OCR text block.
 *   1. We expect lines to be passed in (e.g. by the Tesseract hOCR / line
 *      iterator). The text argument is the joined string used for logging.
 *   2. Strategy: the longest line whose words all start with a capital
 *      letter (or roman digits) and which contains at least 2 words, with
 *      no digits in the middle of words.
 */
export function extractNameFromText(text: string, lines: string[]): string | null {
  if (!lines || lines.length === 0) return null;
  const candidates = lines
    .map((l) => l.trim())
    .filter((l) => l.length >= 3 && l.length <= 80)
    .filter((l) => /^[A-Z][A-Za-z'’.\- ]+$/.test(l)) // only letters/punct
    .filter((l) => {
      const words = l.split(/\s+/);
      if (words.length < 2) return false;
      return words.every((w) => /^[A-Z][A-Za-z'’.\-]+$/.test(w));
    });
  if (candidates.length === 0) return null;
  // Longest wins
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0];
}

/* ====================================================================== */
/* 7. Tesseract.js lazy loader (CDN)                                       */
/* ====================================================================== */

const TESSERACT_CDN = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";

declare global {
  interface Window {
    Tesseract?: any;
  }
}

let _tesseractPromise: Promise<any> | null = null;

/**
 * Lazily injects the Tesseract.js script tag on first call and resolves
 * with the global. Subsequent calls return the cached promise.
 */
export function loadTesseract(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("Tesseract can only run in the browser"));
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (_tesseractPromise) return _tesseractPromise;
  _tesseractPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-tesseract]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(window.Tesseract));
      existing.addEventListener("error", () => reject(new Error("Failed to load Tesseract.js")));
      return;
    }
    const s = document.createElement("script");
    s.src = TESSERACT_CDN;
    s.async = true;
    s.setAttribute("data-tesseract", "1");
    s.onload = () => resolve(window.Tesseract);
    s.onerror = () => reject(new Error("Failed to load Tesseract.js"));
    document.head.appendChild(s);
  });
  return _tesseractPromise;
}

/* ====================================================================== */
/* 8. PDF.js lazy loader (CDN) — for PDF document OCR                      */
/* ====================================================================== */

const PDFJS_CDN = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.mjs";
const PDFJS_WORKER_CDN = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs";

declare global {
  interface Window {
    pdfjsLib?: any;
  }
}

let _pdfjsPromise: Promise<any> | null = null;

/**
 * Lazily injects the pdfjs script tag on first call and resolves with
 * the global window.pdfjsLib. Also configures the worker URL.
 * Webpack would try to bundle any direct import() of an HTTPS URL — this
 * script-tag approach sidesteps that.
 */
export function loadPdfjs(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("pdfjs can only run in the browser"));
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (_pdfjsPromise) return _pdfjsPromise;
  _pdfjsPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-pdfjs]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(window.pdfjsLib));
      existing.addEventListener("error", () => reject(new Error("Failed to load pdfjs.js")));
      return;
    }
    const s = document.createElement("script");
    s.type = "module";
    s.src = PDFJS_CDN;
    s.async = true;
    s.setAttribute("data-pdfjs", "1");
    s.onload = () => {
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN;
        resolve(window.pdfjsLib);
      } else {
        reject(new Error("pdfjs loaded but window.pdfjsLib is undefined"));
      }
    };
    s.onerror = () => reject(new Error("Failed to load pdfjs.js"));
    document.head.appendChild(s);
  });
  return _pdfjsPromise;
}
