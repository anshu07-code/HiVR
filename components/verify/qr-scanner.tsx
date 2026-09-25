"use client";

import * as React from "react";
import {
  Loader2, AlertTriangle, CheckCircle2, ArrowLeft,
  Type, Upload, Clipboard, ExternalLink, Smartphone, FileImage, FileText, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type QrScanResult = {
  raw: string;
  source: "camera" | "upload" | "manual";
  fallback?: { name: string; dob: string; aadhaarLast4: string };
};

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
  onFallback,
  showSampleData = false,
  defaultMode = "manual",
  sampleData = SAMPLE_AADHAAR_QR,
  sampleLabel = "Try sample Aadhaar QR",
  guideSteps,
}: {
  title: string;
  description: string;
  validate?: (raw: string) => string | null;
  onResult: (r: QrScanResult) => void;
  onCancel: () => void;
  onFallback?: (data: { name: string; dob: string; aadhaarLast4: string }) => void;
  showSampleData?: boolean;
  defaultMode?: "camera" | "upload" | "manual";
  sampleData?: string;
  sampleLabel?: string;
  guideSteps?: { icon?: React.ReactNode; text: React.ReactNode }[];
}) {
  const [mode, setMode] = React.useState<"manual" | "photo" | "pdf">(
    defaultMode === "upload" ? "photo" : "manual",
  );
  const [error, setError] = React.useState<string | null>(null);
  const [manual, setManual] = React.useState("");
  const [scanning, setScanning] = React.useState(false);
  const [pdfPassword, setPdfPassword] = React.useState("");
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [scanFailed, setScanFailed] = React.useState(false);
  const [fallbackName, setFallbackName] = React.useState("");
  const [fallbackDob, setFallbackDob] = React.useState("");
  const [fallbackLast4, setFallbackLast4] = React.useState("");

  const photoInputRef = React.useRef<HTMLInputElement | null>(null);
  const pdfInputRef = React.useRef<HTMLInputElement | null>(null);

  /** Convert a canvas to high-contrast black & white (grayscale + Otsu binarization).
   *  This dramatically improves QR detection from blurry photos and screenshots. */
  function preprocessImage(canvas: HTMLCanvasElement): HTMLCanvasElement {
    const ctx = canvas.getContext("2d")!;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const len = data.length;

    // 1. Convert to grayscale (luminosity weighting)
    for (let i = 0; i < len; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      data[i] = data[i + 1] = data[i + 2] = gray | 0;
    }

    // 2. Otsu threshold — automatically finds the optimal cutoff between
    //    dark QR modules and light background, even in uneven lighting.
    const histogram = new Uint32Array(256);
    for (let i = 0; i < len; i += 4) histogram[data[i]]++;
    const total = len / 4;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * histogram[i];
    let sumB = 0, wB = 0, maxVariance = 0, threshold = 128;
    for (let i = 0; i < 256; i++) {
      wB += histogram[i];
      if (wB === 0) continue;
      const wF = total - wB;
      if (wF === 0) break;
      sumB += i * histogram[i];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const variance = wB * wF * (mB - mF) * (mB - mF);
      if (variance > maxVariance) { maxVariance = variance; threshold = i; }
    }

    // 3. Binarize using the Otsu threshold
    for (let i = 0; i < len; i += 4) {
      const val = data[i] > threshold ? 255 : 0;
      data[i] = data[i + 1] = data[i + 2] = val;
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }

  async function onUploadFile(file: File | null) {
    if (!file) return;
    setScanning(true);
    setError(null);
    setScanFailed(false);
    try {
      let uploadFile: File;
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        // Render PDF page 1 to a canvas → preprocess → export as JPEG
        const pdfjs = await import("pdfjs-dist");
        // Create a Worker from the local copy via webpack-friendly URL pattern,
        // and also register exports on globalThis so pdfjs's #mainThreadWorkerMessageHandler
        // skips the internal import() fallback entirely.
        try {
          // We cannot use import() here (webpack tries to resolve static paths),
          // so we create a Worker directly. The worker module auto-sets
          // globalThis.pdfjsWorker as a side effect of its module evaluation.
          const w = new Worker("/pdf.worker.min.js", { type: "module" });
          pdfjs.GlobalWorkerOptions.workerPort = w;
        } catch (workerErr) {
          console.error("[qr-scanner] Worker creation failed, falling back to workerSrc.", workerErr);
          pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";
        }
        const arrBuf = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument({
          data: arrBuf,
          password: pdfPassword || undefined,
        }).promise;
        const page = await pdf.getPage(1);
        const vp = page.getViewport({ scale: 3 });
        const canvas = document.createElement("canvas");
        canvas.width = vp.width;
        canvas.height = vp.height;
        await page.render({ canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
        // Use lossless PNG for PDF renders to preserve QR module edges perfectly.
        // JPEG artifacts at any quality level can flip QR module pixels.
        const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
        if (!blob) throw new Error("Could not render PDF to image");
        uploadFile = new File([blob], file.name.replace(/\.pdf$/i, ".png"), { type: "image/png" });
      } else {
        // For regular images: load onto a canvas → preprocess → export as JPEG
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(typeof r.result === "string" ? r.result : "");
          r.onerror = () => reject(r.error);
          r.readAsDataURL(file);
        });
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const i = new Image();
          i.onload = () => resolve(i);
          i.onerror = () => reject(new Error("Image load failed"));
          i.src = dataUrl;
        });
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext("2d")!.drawImage(img, 0, 0);
        preprocessImage(canvas);
        const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.92));
        if (!blob) throw new Error("Could not process image");
        uploadFile = new File([blob], file.name, { type: "image/jpeg" });
      }

      // Upload to server — server decodes QR + verifies UIDAI signature
      const form = new FormData();
      form.append("file", uploadFile);
      const res = await fetch("/api/verify-aadhaar", { method: "POST", body: form });
      const json = await res.json();
      if (!json.success) {
        // QR not found — show fallback entry form
        setScanFailed(true);
        setError(json.message || "Verification failed");
        setScanning(false);
        return;
      }
      onResult({ raw: json.qrData, source: "upload" });
    } catch (e) {
      setScanFailed(true);
      setError((e as Error).message);
      setScanning(false);
    }
  }

  function submitFallback() {
    if (!fallbackName.trim() || !fallbackDob.trim() || !fallbackLast4.trim()) {
      setError("Please fill in all fallback fields.");
      return;
    }
    if (!/^\d{4}$/.test(fallbackLast4.trim())) {
      setError("Aadhaar last 4 digits must be exactly 4 digits.");
      return;
    }
    onFallback?.({ name: fallbackName.trim(), dob: fallbackDob.trim(), aadhaarLast4: fallbackLast4.trim() });
  }

  function resetUpload() {
    setScanning(false);
    setScanFailed(false);
    setError(null);
    setSelectedFile(null);
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

      {/* Mode tabs — three options: manual, photo, PDF */}
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
          onClick={() => { resetUpload(); setMode("photo"); }}
          className={cn("flex-1 rounded px-2 py-1.5 transition-colors inline-flex items-center justify-center gap-1",
            mode === "photo" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}
        >
          <FileImage className="h-3.5 w-3.5" />Upload photo
        </button>
        <button
          type="button"
          onClick={() => { resetUpload(); setMode("pdf"); }}
          className={cn("flex-1 rounded px-2 py-1.5 transition-colors inline-flex items-center justify-center gap-1",
            mode === "pdf" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}
        >
          <FileText className="h-3.5 w-3.5" />Upload PDF
        </button>
      </div>

      {/* Upload photo — send image to server for QR decode + UIDAI verification */}
      {mode === "photo" && (
        <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-center">
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setSelectedFile(f);
              if (f) onUploadFile(f);
            }}
          />
          {scanning ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Preprocessing &amp; scanning for QR code…</p>
            </div>
          ) : scanFailed ? (
            <div className="space-y-3 text-left">
              <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-700">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Could not read a QR code from the photo. Enter your details below to continue.</span>
              </div>
              <FallbackFormFields
                fallbackName={fallbackName} setFallbackName={setFallbackName}
                fallbackDob={fallbackDob} setFallbackDob={setFallbackDob}
                fallbackLast4={fallbackLast4} setFallbackLast4={setFallbackLast4}
              />
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => photoInputRef.current?.click()} className="h-7 text-[10px]">
                  <Upload className="h-3 w-3" />Try different photo
                </Button>
                <Button size="sm" variant="gradient" onClick={submitFallback} className="h-7 text-[10px]"
                  disabled={!fallbackName.trim() || !fallbackDob.trim() || fallbackLast4.length !== 4}>
                  Continue with entered details
                </Button>
              </div>
            </div>
          ) : (
            <>
              <FileImage className="h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm">Upload a screenshot or photo of the Aadhaar QR.</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Works with screenshots, camera photos, and saved images.
              </p>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => photoInputRef.current?.click()}>
                <Upload className="h-3.5 w-3.5" />Choose photo
              </Button>
              {selectedFile && !scanning && mode === "photo" && (
                <p className="mt-2 text-[10px] text-muted-foreground truncate max-w-xs mx-auto">
                  {selectedFile.name}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* Upload PDF — send PDF (with optional password) to server */}
      {mode === "pdf" && (
        <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-center">
          <input
            ref={pdfInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setSelectedFile(f);
              if (f) onUploadFile(f);
            }}
          />
          {scanning ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Rendering PDF &amp; scanning for QR code…</p>
            </div>
          ) : scanFailed ? (
            <div className="space-y-3 text-left">
              <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-700">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Could not read a QR code from the PDF. Enter your details below to continue.</span>
              </div>
              <FallbackFormFields
                fallbackName={fallbackName} setFallbackName={setFallbackName}
                fallbackDob={fallbackDob} setFallbackDob={setFallbackDob}
                fallbackLast4={fallbackLast4} setFallbackLast4={setFallbackLast4}
              />
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => pdfInputRef.current?.click()} className="h-7 text-[10px]">
                  <Upload className="h-3 w-3" />Try different PDF
                </Button>
                <Button size="sm" variant="gradient" onClick={submitFallback} className="h-7 text-[10px]"
                  disabled={!fallbackName.trim() || !fallbackDob.trim() || fallbackLast4.length !== 4}>
                  Continue with entered details
                </Button>
              </div>
            </div>
          ) : (
            <>
              <FileText className="h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm">Upload the e-Aadhaar PDF from uidai.gov.in.</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Password-protected PDFs supported (e.g. &ldquo;RAHU1999&rdquo;).
              </p>

              {/* PDF password field — always visible in PDF mode */}
              <div className="mt-3 flex items-center gap-2 max-w-xs mx-auto">
                <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder="PDF password (e.g. RAHU1999)"
                  value={pdfPassword}
                  onChange={(e) => setPdfPassword(e.target.value)}
                  className="h-7 text-[10px]"
                />
              </div>

              <Button size="sm" variant="outline" className="mt-3" onClick={() => pdfInputRef.current?.click()}>
                <Upload className="h-3.5 w-3.5" />Choose PDF
              </Button>
              {selectedFile && !scanning && mode === "pdf" && (
                <p className="mt-2 text-[10px] text-muted-foreground truncate max-w-xs mx-auto">
                  {selectedFile.name}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* Manual mode — paste QR text */}
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
        </div>
      </div>
    </div>
  );
}

/** Reusable fallback form fields used in both photo and PDF modes. */
function FallbackFormFields({
  fallbackName, setFallbackName,
  fallbackDob, setFallbackDob,
  fallbackLast4, setFallbackLast4,
}: {
  fallbackName: string; setFallbackName: (v: string) => void;
  fallbackDob: string; setFallbackDob: (v: string) => void;
  fallbackLast4: string; setFallbackLast4: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div>
        <Label className="text-[10px]">Full name (as on Aadhaar)</Label>
        <Input
          value={fallbackName}
          onChange={(e) => setFallbackName(e.target.value)}
          placeholder="e.g. Rahul Sharma"
          className="mt-0.5 h-7 text-[10px]"
        />
      </div>
      <div>
        <Label className="text-[10px]">Date of birth</Label>
        <Input
          type="date"
          value={fallbackDob}
          onChange={(e) => setFallbackDob(e.target.value)}
          className="mt-0.5 h-7 text-[10px]"
        />
      </div>
      <div>
        <Label className="text-[10px]">Last 4 digits of Aadhaar</Label>
        <Input
          value={fallbackLast4}
          onChange={(e) => setFallbackLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="xxxx-xxxx-1234"
          maxLength={4}
          className="mt-0.5 h-7 text-[10px] font-mono"
        />
      </div>
    </div>
  );
}
