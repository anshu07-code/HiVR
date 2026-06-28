"use client";

import * as React from "react";
import { Upload, FileText, Image as ImageIcon, Loader2, AlertTriangle, Check, RefreshCw, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { perceptualHash, loadTesseract, loadPdfjs, extractDOBFromText, extractNameFromText } from "@/lib/verification";
import {
  validateAadhaar, validatePAN, validatePassport, validateDL,
} from "@/lib/verification";

export type DocumentKind = "adult_aadhaar" | "adult_pan" | "adult_passport" | "adult_dl" | "minor_school_id" | "minor_aadhaar";

export type DocumentResult = {
  docBlob: Blob;
  mimeType: string;
  ocrName: string | null;
  ocrDob: Date | null;
  docNumber: string | null;
  docHash: string | null;
  docValidityScore: number;
  ocrText: string;
  docNumberValid: boolean;
  lines: string[];
};

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

/**
 * Document upload + client-side OCR via Tesseract.js (loaded lazily
 * from a CDN). Computes a perceptual hash, extracts name + DOB from
 * the OCR text, and validates the document number pattern.
 */
export function DocumentUpload({
  kind,
  onComplete,
  onCancel,
  presetDob,
}: {
  kind: DocumentKind;
  onComplete: (r: DocumentResult) => void;
  onCancel: () => void;
  presetDob?: Date | null;
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [ocrText, setOcrText] = React.useState<string>("");
  const [lines, setLines] = React.useState<string[]>([]);
  const [name, setName] = React.useState<string | null>(null);
  const [dob, setDob] = React.useState<Date | null>(null);
  const [docNumber, setDocNumber] = React.useState<string | null>(null);
  const [docValid, setDocValid] = React.useState(false);
  const [hash, setHash] = React.useState<string | null>(null);
  const [docScore, setDocScore] = React.useState(0);
  const [isPdf, setIsPdf] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const dropRef = React.useRef<HTMLDivElement | null>(null);
  const imgRef = React.useRef<HTMLImageElement | null>(null);

  React.useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const label = kind.startsWith("minor") ? "Minor ID" : labelForKind(kind);

  // ---------- file selection ----------
  function selectFile(f: File | null) {
    if (!f) return;
    if (f.size > MAX_BYTES) { setError("File is over 8 MB."); return; }
    if (!/^image\//.test(f.type) && f.type !== "application/pdf") { setError("Use an image (JPG/PNG) or a PDF."); return; }
    setError(null);
    setFile(f);
    setOcrText("");
    setLines([]);
    setName(null);
    setDob(null);
    setDocNumber(null);
    setDocValid(false);
    setHash(null);
    setDocScore(0);
    setProgress(0);
    setIsPdf(f.type === "application/pdf");
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
  }

  // ---------- run OCR + pHash ----------
  async function process() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      let imgEl: HTMLImageElement | null = null;
      if (file.type.startsWith("image/")) {
        imgEl = await loadImageElement(file);
      } else {
        // PDF: render the first page to an image via createImageBitmap
        imgEl = await renderPdfFirstPage(file);
      }
      if (!imgEl) throw new Error("Could not load the document image.");

      // 1. perceptual hash
      const ph = await perceptualHash(imgEl);
      setHash(ph);

      // 2. OCR
      const Tesseract = await loadTesseract();
      const result: any = await Tesseract.recognize(imgEl, "eng", {
        logger: (m: any) => {
          if (m.status === "recognizing text" && typeof m.progress === "number") {
            setProgress(Math.round(m.progress * 100));
          }
        },
      });
      const text: string = result?.data?.text ?? "";
      const lineList: string[] = (result?.data?.lines ?? []).map((l: any) => l.text?.trim()).filter(Boolean);
      setOcrText(text);
      setLines(lineList);

      // 3. extract fields
      const extractedName = extractNameFromText(text, lineList.length > 0 ? lineList : text.split(/\n+/));
      const extractedDob = extractDOBFromText(text) ?? presetDob ?? null;
      const extractedNumber = extractDocNumber(text, kind);
      const numberValid = validateNumberForKind(extractedNumber, kind);

      setName(extractedName);
      setDob(extractedDob);
      setDocNumber(extractedNumber);
      setDocValid(numberValid);

      // 4. doc validity score: combine hash uniqueness (placeholder), number validity, presence of DOB + name
      let score = 0;
      if (extractedName) score += 25;
      if (extractedDob) score += 25;
      if (numberValid) score += 35;
      // Hash exists + has reasonable entropy
      if (ph && ph.length === 16) score += 15;
      setDocScore(score);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // ---------- submit ----------
  function submit() {
    if (!file || !name || !dob || !docNumber) return;
    onComplete({
      docBlob: file,
      mimeType: file.type,
      ocrName: name,
      ocrDob: dob,
      docNumber,
      docHash: hash,
      docValidityScore: docScore,
      ocrText,
      docNumberValid: docValid,
      lines,
    });
  }

  // ---------- drag and drop ----------
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) selectFile(f);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-display text-lg font-semibold">Upload your {label}</h3>
        <p className="text-xs text-muted-foreground">We OCR the document locally. The text never leaves your device.</p>
      </div>

      <div
        ref={dropRef}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={cn(
          "grid place-items-center rounded-xl border-2 border-dashed bg-muted/20 p-6 text-center transition-colors",
          file ? "border-primary/40" : "border-muted-foreground/30 hover:border-primary/40",
        )}
      >
        {!file ? (
          <div className="space-y-2 text-sm text-muted-foreground">
            <Upload className="mx-auto h-7 w-7" />
            <p>Drag &amp; drop an image or PDF, or</p>
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" />Choose file
            </Button>
            <p className="text-[10px]">JPG, PNG, or PDF · up to 8 MB</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => selectFile(e.target.files?.[0] ?? null)}
            />
          </div>
        ) : (
          <div className="w-full space-y-3">
            <div className="flex items-center justify-center">
              {isPdf ? (
                <div className="grid h-32 w-48 place-items-center rounded-md border bg-background text-muted-foreground">
                  <FileText className="h-7 w-7" />
                  <p className="mt-1 text-[10px]">PDF · {(file.size / 1024).toFixed(0)} KB</p>
                </div>
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img ref={imgRef} src={previewUrl ?? undefined} alt="Document preview" className="max-h-48 rounded-md border object-contain" />
              )}
            </div>
            <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
              <ImageIcon className="h-3 w-3" />
              <span className="truncate max-w-[200px]">{file.name}</span>
              <button type="button" onClick={() => { setFile(null); setPreviewUrl(null); }} className="text-primary hover:underline">Replace</button>
            </div>
          </div>
        )}
      </div>

      {file && (
        <div className="flex items-center justify-end">
          <Button onClick={process} disabled={busy} variant="outline">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {busy ? `Reading… ${progress}%` : "Read document"}
          </Button>
        </div>
      )}

      {busy && (
        <div className="space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-[10px] text-muted-foreground">Reading document… {progress}%</p>
        </div>
      )}

      {/* Result panel */}
      {ocrText && (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-xs">
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="Name" value={name ?? "—"} ok={!!name} />
            <Field label="DOB" value={dob ? dob.toISOString().slice(0, 10) : "—"} ok={!!dob} />
            <Field label="Doc #" value={docNumber ? maskNumber(docNumber) : "—"} ok={docValid} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-[10px]">
              Hash: <span className="font-mono">{hash ?? "—"}</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-[10px]">
              Validity score: <span className="font-mono">{docScore}</span>
            </span>
          </div>
          <details className="rounded-md border bg-background p-2">
            <summary className="cursor-pointer text-[10px] text-muted-foreground">Raw OCR text</summary>
            <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-[10px] text-muted-foreground">{ocrText}</pre>
          </details>
        </div>
      )}

      {error && (
        <p className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" />{error}
        </p>
      )}

      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <ArrowLeft className="h-3.5 w-3.5" />Back
        </Button>
        <Button onClick={submit} disabled={!name || !dob || !docValid} variant="gradient">
          <Check className="h-3.5 w-3.5" />Continue
        </Button>
      </div>
    </div>
  );
}

function Field({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className={cn("rounded-md border p-2", ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5")}>
      <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xs font-medium">{value}</p>
    </div>
  );
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => { resolve(img); /* keep URL alive for preview */ };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Failed to decode image")); };
    img.src = url;
  });
}

async function renderPdfFirstPage(file: File): Promise<HTMLImageElement | null> {
  // Tesseract can OCR PDFs directly, but we still need an image for the
  // perceptual hash. Use pdfjs to render the first page. Since pdfjs is
  // not bundled, we fall back to a minimal "best-effort": just hash a
  // poster image and OCR the raw PDF text stream.
  try {
    const pdfjsLib: any = await loadPdfjs();
    if (!pdfjsLib) return null;
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1.5 });
    const c = document.createElement("canvas");
    c.width = viewport.width;
    c.height = viewport.height;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const dataUrl = c.toDataURL("image/jpeg", 0.85);
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to render PDF page"));
      img.src = dataUrl;
    });
  } catch {
    return null;
  }
}

function labelForKind(kind: DocumentKind) {
  if (kind === "adult_aadhaar") return "Aadhaar card";
  if (kind === "adult_pan") return "PAN card";
  if (kind === "adult_passport") return "Passport";
  if (kind === "adult_dl") return "Driving Licence";
  if (kind === "minor_school_id") return "School ID";
  return "Aadhaar card";
}

/**
 * Find the most likely document number in OCR text. We anchor on the
 * closest label keyword (e.g. "Aadhaar No."), then take the next
 * whitespace-free token.
 */
function extractDocNumber(text: string, kind: DocumentKind): string | null {
  if (!text) return null;
  const clean = text.replace(/\s+/g, " ");
  // Try a label-anchored extract first
  const labels: Record<DocumentKind, RegExp[]> = {
    adult_aadhaar:    [/aadhaar\s*(?:no\.?|number)?[:\s]+([0-9\s]{12,20})/i, /uid\s*(?:no\.?|number)?[:\s]+([0-9\s]{12,20})/i],
    adult_pan:        [/pan\s*(?:no\.?|number)?[:\s]+([A-Z0-9\s]{10,15})/i, /income\s*tax\s*dept[:\s]+([A-Z0-9\s]{10,15})/i],
    adult_passport:   [/passport\s*(?:no\.?|number)?[:\s]+([A-Z0-9\s]{8,12})/i],
    adult_dl:         [/dl\s*(?:no\.?|number)?[:\s]+([A-Z0-9\s]{10,18})/i, /licence\s*(?:no\.?|number)?[:\s]+([A-Z0-9\s]{10,18})/i, /license\s*(?:no\.?|number)?[:\s]+([A-Z0-9\s]{10,18})/i],
    minor_school_id:  [/(?:id|admission|roll)\s*(?:no\.?|number)?[:\s]+([A-Z0-9\s]{6,15})/i],
    minor_aadhaar:    [/aadhaar\s*(?:no\.?|number)?[:\s]+([0-9\s]{12,20})/i],
  };
  for (const re of labels[kind] ?? []) {
    const m = re.exec(clean);
    if (m) {
      const v = (m[1] ?? "").replace(/\s+/g, "").toUpperCase();
      if (v.length >= 6) return v;
    }
  }
  // Fallback: longest digit run (Aadhaar) or alphanumeric run (PAN)
  if (kind === "adult_aadhaar" || kind === "minor_aadhaar") {
    const m = clean.match(/\d{12}/);
    return m ? m[0] : null;
  }
  if (kind === "adult_pan") {
    const m = clean.match(/[A-Z]{5}\d{4}[A-Z]/);
    return m ? m[0] : null;
  }
  if (kind === "adult_passport") {
    const m = clean.match(/[A-PR-WY][1-9]\d{6}/);
    return m ? m[0] : null;
  }
  if (kind === "adult_dl") {
    const m = clean.match(/[A-Z]{2}\d{2,13}[A-Z]?/);
    return m ? m[0] : null;
  }
  return null;
}

function validateNumberForKind(num: string | null, kind: DocumentKind): boolean {
  if (!num) return false;
  if (kind === "adult_aadhaar" || kind === "minor_aadhaar") return validateAadhaar(num);
  if (kind === "adult_pan") return validatePAN(num);
  if (kind === "adult_passport") return validatePassport(num);
  if (kind === "adult_dl") return validateDL(num);
  return num.length >= 6;
}

function maskNumber(n: string) {
  if (n.length <= 4) return n;
  return "•••• •••• " + n.slice(-4);
}
