"use client";

import * as React from "react";
import { Upload, Loader2, AlertTriangle, CheckCircle2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

export type DiditPanResult = {
  fullName: string | null;
  dob: string | null;
  documentNumber: string | null;
  status: "Approved" | "Declined";
};

export function PanDiditUpload({
  onComplete,
  onCancel,
}: {
  onComplete: (r: DiditPanResult) => void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [result, setResult] = React.useState<DiditPanResult | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  async function handleFile(f: File) {
    if (!f.type.startsWith("image/")) {
      setError("Please select an image file (JPEG or PNG)");
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setError(null);
    setResult(null);
  }

  async function submit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("front_image", file, "pan.jpg");
      form.append("vendor_data", "hivr-pan");

      const res = await fetch("/api/didit/id-verification", {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "PAN verification failed" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const idv = data.id_verification || {};
      const r: DiditPanResult = {
        fullName: idv.full_name || null,
        dob: idv.date_of_birth || null,
        documentNumber: idv.document_number || null,
        status: idv.status || "Declined",
      };
      setResult(r);

      if (r.status === "Approved") {
        onComplete(r);
      } else {
        setError("PAN could not be verified. Make sure the image is clear.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          Upload a clear photo of the front of your PAN card. Didit AI extracts and verifies the details.
        </p>
      </div>

      {!file && (
        <div
          className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors hover:bg-muted/30"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">Tap to upload PAN card image</p>
          <p className="text-xs text-muted-foreground">JPEG or PNG, max 10 MB</p>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </div>
      )}

      {preview && file && (
        <div className="overflow-hidden rounded-xl border">
          <img src={preview} alt="PAN preview" className="max-h-64 w-full object-contain bg-muted" />
        </div>
      )}

      {error && (
        <p className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5" />{error}
        </p>
      )}

      {result && result.status === "Approved" && (
        <div className="rounded-xl border-2 border-emerald-500/30 bg-emerald-500/5 p-4">
          <div className="flex items-center gap-2 text-emerald-700">
            <CheckCircle2 className="h-5 w-5" />
            <p className="text-sm font-semibold">PAN verified</p>
          </div>
          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
            {result.fullName && <p>Name: {result.fullName}</p>}
            {result.dob && <p>DOB: {result.dob}</p>}
            {result.documentNumber && <p>PAN: {result.documentNumber}</p>}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Back
        </Button>
        <div className="flex gap-2">
          {file && !result && (
            <Button onClick={submit} disabled={busy} variant="gradient">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify with Didit"}
            </Button>
          )}
          {file && result && (
            <Button variant="outline" size="sm" onClick={() => { setFile(null); setPreview(null); setResult(null); setError(null); }}>
              Upload different card
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
