"use client";

import * as React from "react";
import {
  Camera, Loader2, AlertTriangle, CheckCircle2, ScanLine, RefreshCw, ArrowLeft,
  Type, Upload, Clipboard, ExternalLink, Smartphone, FileImage,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type QrScanResult = { raw: string; source: "camera" | "upload" | "manual" };

declare global {
  interface Window {
    Html5Qrcode?: any;
    Html5QrcodeSupportedFormats?: any;
  }
}

const HTML5_QRCODE_CDN = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";

function loadHtml5Qrcode(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("browser only"));
  if (window.Html5Qrcode) return Promise.resolve(window.Html5Qrcode);
  if ((window as any).__html5QrcodeLoading) return (window as any).__html5QrcodeLoading;
  (window as any).__html5QrcodeLoading = new Promise<any>((resolve, reject) => {
    const existing = document.querySelector(`script[data-html5qrcode]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(window.Html5Qrcode));
      existing.addEventListener("error", () => reject(new Error("Failed to load html5-qrcode")));
      return;
    }
    const s = document.createElement("script");
    s.src = HTML5_QRCODE_CDN;
    s.async = true;
    s.setAttribute("data-html5qrcode", "1");
    s.onload = () => resolve(window.Html5Qrcode);
    s.onerror = () => reject(new Error("Failed to load html5-qrcode"));
    document.head.appendChild(s);
  });
  return (window as any).__html5QrcodeLoading;
}

// A small fake Aadhaar QR for dev/testing. Signature is fake so the
// server-side UIDAI verification will reject it — that's the point:
// it lets the user test the wizard flow without a real Aadhaar.
const SAMPLE_AADHAAR_QR = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<PrintLetterBarcodeData credentialType="X" referenceId="DEMO0000001">
<name>Test User</name>
<dob>1990-01-01</dob>
<gender>M</gender>
<co>S/O Demo Father</co>
<address>Demo Address, Bengaluru, Karnataka - 560001</address>
<uid>1234</uid>
<photo>iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==</photo>
<Signature>DEMO-FAKE-SIGNATURE-NOT-VERIFIED-BY-UIDAI</Signature>
</PrintLetterBarcodeData>`;

export function QrScanner({
  title,
  description,
  validate,
  onResult,
  onCancel,
  showSampleData = false,
  defaultMode = "manual",       // MANUAL is the default — works 100% of the time
  sampleData = SAMPLE_AADHAAR_QR,
  sampleLabel = "Try sample Aadhaar QR",
  guideSteps,
}: {
  title: string;
  description: string;
  validate?: (raw: string) => string | null;
  onResult: (r: QrScanResult) => void;
  onCancel: () => void;
  showSampleData?: boolean;
  defaultMode?: "camera" | "upload" | "manual";
  sampleData?: string;
  sampleLabel?: string;
  guideSteps?: { icon?: React.ReactNode; text: React.ReactNode }[];
}) {
  const [mode, setMode] = React.useState<"camera" | "upload" | "manual">(defaultMode);
  const [error, setError] = React.useState<string | null>(null);
  const [ready, setReady] = React.useState(false);
  const [manual, setManual] = React.useState("");
  const [scanning, setScanning] = React.useState(false);
  const [framesDecoded, setFramesDecoded] = React.useState(0);

  const containerId = React.useId();
  const scannerRef = React.useRef<any>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const camStoppedRef = React.useRef(true);

  async function startCamera() {
    setError(null);
    setReady(false);
    setFramesDecoded(0);
    try {
      const Html5Qrcode = await loadHtml5Qrcode();
      if (!Html5Qrcode) throw new Error("html5-qrcode failed to load");
      // Stop any existing scanner
      if (scannerRef.current && !camStoppedRef.current) {
        try { await scannerRef.current.stop(); } catch { /* ignore */ }
      }
      const el = document.getElementById(containerId);
      if (!el) throw new Error("Scanner container not mounted");
      const scanner = new Html5Qrcode(containerId, /* verbose = */ false);
      scannerRef.current = scanner;
      camStoppedRef.current = false;
      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 12,                                   // ZXing can do real-time at 12fps
          qrbox: (vw: number, vh: number) => {
            const minEdge = Math.min(vw, vh);
            const size = Math.floor(minEdge * 0.7);
            return { width: size, height: size };
          },
          aspectRatio: 1.0,
          disableFlip: false,
        },
        (decoded: string) => {
          // Success callback
          camStoppedRef.current = true;
          const err = validate?.(decoded);
          if (err) {
            setError(err);
            // Re-arm after 1.5s
            setTimeout(() => { try { scanner.resume(); } catch { /* */ } }, 1500);
            return;
          }
          try { scanner.stop(); } catch { /* */ }
          onResult({ raw: decoded, source: "camera" });
        },
        (_errMsg: string) => { /* per-frame failure — ignore */ },
      );
      setReady(true);
      setScanning(true);
      // Poll the decoded-counts display
      const poll = setInterval(() => {
        try {
          const counts = scanner.getState?.();
          // No direct frame counter in html5-qrcode; we just animate a dot
          setFramesDecoded((n) => n + 1);
        } catch { clearInterval(poll); }
      }, 1000);
      (scanner as any).__pollInterval = poll;
    } catch (e) {
      setError(`Camera unavailable: ${(e as Error).message}. Use "Enter manually" or "Upload photo" instead.`);
      setReady(false);
    }
  }

  function stopCamera() {
    camStoppedRef.current = true;
    if (scannerRef.current) {
      try { scannerRef.current.stop(); } catch { /* */ }
      try { clearInterval((scannerRef.current as any).__pollInterval); } catch { /* */ }
      scannerRef.current = null;
    }
    setReady(false);
    setScanning(false);
  }

  React.useEffect(() => {
    if (mode === "camera") {
      startCamera();
      return () => stopCamera();
    } else {
      stopCamera();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  React.useEffect(() => () => stopCamera(), []);

  async function onUploadFile(file: File | null) {
    if (!file) return;
    setError(null);
    try {
      const Html5Qrcode = await loadHtml5Qrcode();
      if (!Html5Qrcode) throw new Error("html5-qrcode failed to load");
      const scanner = new Html5Qrcode(`upload-${containerId}`, false);
      const decoded = await scanner.scanFile(file, /* showImage = */ false);
      const err = validate?.(decoded);
      if (err) { setError(err); return; }
      onResult({ raw: decoded, source: "upload" });
    } catch (e) {
      setError("No QR code found in that image. Try a clearer, well-lit photo. Or use 'Enter manually' for 100% reliability.");
    }
  }

  function submitManual() {
    if (!manual.trim()) { setError("Paste the QR data first"); return; }
    const err = validate?.(manual.trim());
    if (err) { setError(err); return; }
    onResult({ raw: manual.trim(), source: "manual" });
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setManual(text);
    } catch {
      setError("Couldn't read clipboard. Paste manually with Ctrl/Cmd+V.");
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-display text-lg font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      {/* Mode tabs */}
      <div className="flex flex-wrap gap-1 rounded-md border bg-muted/30 p-1 text-xs">
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={cn("flex-1 rounded px-2 py-1.5 transition-colors inline-flex items-center justify-center gap-1",
            mode === "manual" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}
        >
          <Type className="h-3.5 w-3.5" />Enter manually
          <span className="ml-1 rounded bg-emerald-500/20 px-1 text-[9px] text-emerald-700">recommended</span>
        </button>
        <button
          type="button"
          onClick={() => setMode("upload")}
          className={cn("flex-1 rounded px-2 py-1.5 transition-colors inline-flex items-center justify-center gap-1",
            mode === "upload" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}
        >
          <FileImage className="h-3.5 w-3.5" />Upload photo
        </button>
        <button
          type="button"
          onClick={() => setMode("camera")}
          className={cn("flex-1 rounded px-2 py-1.5 transition-colors inline-flex items-center justify-center gap-1",
            mode === "camera" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}
        >
          <Camera className="h-3.5 w-3.5" />Camera
        </button>
      </div>

      {/* Camera mode — uses html5-qrcode (ZXing) */}
      {mode === "camera" && (
        <div className="relative aspect-square w-full max-w-md mx-auto overflow-hidden rounded-xl border bg-zinc-950">
          <div id={containerId} className="absolute inset-0 h-full w-full" />
          {!ready && !error && (
            <div className="absolute inset-0 z-10 grid place-items-center bg-black/60 text-xs text-white">
              <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Starting camera…
            </div>
          )}
          {ready && (
            <>
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="h-2/3 w-2/3 rounded-lg border-2 border-primary/70 shadow-[0_0_40px_rgba(59,130,246,0.5)]" />
              </div>
              <div className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-white">
                <span className="h-1.5 w-1.5 inline-block animate-pulse rounded-full bg-emerald-500" />{" "}
                ZXing live · {scanning ? "scanning" : "starting"}
              </div>
            </>
          )}
          {/* Hidden element used by upload scanFile */}
          <div id={`upload-${containerId}`} className="hidden" />
        </div>
      )}

      {/* Upload mode — uses html5-qrcode scanFile */}
      {mode === "upload" && (
        <div className="rounded-xl border border-dashed bg-muted/20 p-8 text-center">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onUploadFile(e.target.files?.[0] ?? null)}
          />
          <FileImage className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm">Upload a clear, well-lit photo of the QR code.</p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Best: open the QR on another device (mAadhaar app or e-Aadhaar PDF) and take a screenshot.
          </p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" />Choose photo
          </Button>
        </div>
      )}

      {/* Manual mode — the recommended path */}
      {mode === "manual" && (
        <div className="space-y-2 rounded-md border-2 border-emerald-500/30 bg-emerald-500/5 p-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold text-emerald-700">
              <Smartphone className="mr-1 inline h-3.5 w-3.5" />
              Paste the raw QR data — works 100% of the time
            </Label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 text-[10px]"
              onClick={pasteFromClipboard}
            >
              <Clipboard className="h-3 w-3" />Paste
            </Button>
          </div>
          <Textarea
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder='<?xml version="1.0" encoding="UTF-8" standalone="no"?>...'
            rows={5}
            className="font-mono text-[10px]"
          />

          {/* Step-by-step guide */}
          {guideSteps && guideSteps.length > 0 && (
            <div className="rounded-md border bg-background/70 p-2.5 text-[10px]">
              <p className="font-semibold text-foreground">How to get the raw text:</p>
              <ol className="mt-1.5 space-y-1.5">
                {guideSteps.map((step, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-primary/15 text-[9px] font-bold text-primary">
                      {i + 1}
                    </span>
                    <span className="flex items-start gap-1.5">
                      <span className="mt-0.5 shrink-0 text-muted-foreground">{step.icon}</span>
                      <span className="text-muted-foreground">{step.text}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {showSampleData && (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted"
              onClick={() => setManual(sampleData)}
            >
              <ExternalLink className="h-3 w-3" />
              {sampleLabel}
              <span className="ml-1 text-amber-700">(signature will fail — for dev only)</span>
            </button>
          )}
        </div>
      )}

      {error && (
        <p className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5" />{error}
        </p>
      )}

      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <ArrowLeft className="h-3.5 w-3.5" />Back
        </Button>
        <div className="flex items-center gap-2">
          {mode === "manual" && (
            <Button onClick={submitManual} variant="gradient" size="sm" disabled={!manual.trim()}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Submit
            </Button>
          )}
          {mode === "camera" && (
            <Button onClick={() => { stopCamera(); setMode("camera"); setTimeout(startCamera, 50); }} variant="ghost" size="sm">
              <RefreshCw className="h-3.5 w-3.5" /> Restart camera
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
