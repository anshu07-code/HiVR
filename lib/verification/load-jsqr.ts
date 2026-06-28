/**
 * lib/verification/load-jsqr.ts
 * Lazily injects the jsQR library via <script> tag. Same pattern as
 * loadTesseract / loadPdfjs — avoids webpack trying to bundle a
 * remote URL at build time.
 */

const JSQR_CDN = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js";

declare global {
  interface Window {
    jsQR?: (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null;
  }
}

let _jsqrPromise: Promise<any> | null = null;

export function loadJsQR(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("jsQR can only run in the browser"));
  if (window.jsQR) return Promise.resolve(window.jsQR);
  if (_jsqrPromise) return _jsqrPromise;
  _jsqrPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-jsqr]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(window.jsQR));
      existing.addEventListener("error", () => reject(new Error("Failed to load jsQR")));
      return;
    }
    const s = document.createElement("script");
    s.src = JSQR_CDN;
    s.async = true;
    s.setAttribute("data-jsqr", "1");
    s.onload = () => resolve(window.jsQR);
    s.onerror = () => reject(new Error("Failed to load jsQR"));
    document.head.appendChild(s);
  });
  return _jsqrPromise;
}
