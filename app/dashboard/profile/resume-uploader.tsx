"use client";

/**
 * ResumeUploader
 * -------------
 * Client-side component that lets the user upload a PDF / DOCX / TXT / MD file,
 * extracts the text in the browser, and submits it to the server action
 * `uploadResume` which calls `parseResume` to extract structured data.
 *
 * Why client-side extraction?
 *  - No native deps (poppler, libreoffice) in the Node container.
 *  - No server-side image/PDF parsing surface area to secure.
 *  - The raw text only leaves the browser after the user clicks submit.
 *  - PDF.js works fully in the browser via Web Workers; mammoth is a
 *    small pure-JS DOCX parser.
 *
 * File-size cap: 10 MB (enforced both here and server-side).
 * File-type cap: PDF / DOCX / TXT / MD. We render a clear error otherwise.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Loader2, AlertCircle, CheckCircle2, FileText } from "lucide-react";
import { uploadResume, deleteResume } from "./resume-actions";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXT = [".pdf", ".docx", ".txt", ".md"];
const MIN_TEXT_CHARS = 100;
const MAX_TEXT_CHARS = 200_000; // ~ 200 KB of plain text, plenty for a 10-page resume

function isAllowed(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ALLOWED_EXT.some((ext) => lower.endsWith(ext));
}

async function readPdf(file: File): Promise<string> {
  // Dynamic import so this only loads for PDF files (not on every page load).
  const pdfjs = await import("pdfjs-dist");
  // Use the bundled worker (Vite picks it up via ?url import below).
  // We import the worker URL at module load; if it's missing we fall back
  // to disableWorker which is slower but works.
  const buf = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({
    data: buf,
    // Disable the worker (slower but works without bundler cooperation)
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true,
  } as any);
  const doc = await loadingTask.promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const line = (tc.items as any[])
      .map((it) => (typeof it.str === "string" ? it.str : ""))
      .filter(Boolean)
      .join(" ");
    out.push(line);
  }
  return out.join("\n");
}

async function readDocx(file: File): Promise<string> {
  const mammoth = await import("mammoth/mammoth.browser");
  const buf = await file.arrayBuffer();
  const result = await (mammoth as any).extractRawText({ arrayBuffer: buf });
  return (result?.value as string) ?? "";
}

async function readPlain(file: File): Promise<string> {
  return await file.text();
}

export function ResumeUploader() {
  const router = useRouter();
  const [fileName, setFileName] = React.useState("resume.txt");
  const [fileSize, setFileSize] = React.useState(0);
  const [content, setContent] = React.useState("");
  const [extracting, setExtracting] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<{ ok?: boolean; error?: string; parsed?: any } | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null);

    if (!isAllowed(file.name)) {
      setResult({ error: `Unsupported file type. Allowed: ${ALLOWED_EXT.join(", ")}` });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setResult({ error: `File is ${(file.size / 1024 / 1024).toFixed(1)} MB. Maximum is 10 MB.` });
      return;
    }
    if (file.size === 0) {
      setResult({ error: "File is empty." });
      return;
    }

    setFileName(file.name);
    setFileSize(file.size);
    setExtracting(true);
    setContent("");
    try {
      const lower = file.name.toLowerCase();
      let text = "";
      if (lower.endsWith(".pdf")) {
        text = await readPdf(file);
      } else if (lower.endsWith(".docx")) {
        text = await readDocx(file);
      } else {
        text = await readPlain(file);
      }
      text = text.replace(/\r\n?/g, "\n").trim();
      if (text.length < MIN_TEXT_CHARS) {
        setResult({
          error: `Only extracted ${text.length} characters of text. The file may be a scanned PDF (no text layer) or an image — try pasting the text manually below.`,
        });
      } else if (text.length > MAX_TEXT_CHARS) {
        // Truncate with a marker so the AI gets a representative sample.
        text = text.slice(0, MAX_TEXT_CHARS) + "\n\n[... truncated for length ...]";
      }
      setContent(text);
    } catch (e) {
      setResult({ error: `Extraction failed: ${(e as Error).message}. You can paste the text manually below.` });
    } finally {
      setExtracting(false);
    }
  }

  async function submit() {
    if (content.length < MIN_TEXT_CHARS) {
      setResult({ error: `Resume must have at least ${MIN_TEXT_CHARS} characters of text.` });
      return;
    }
    setSubmitting(true);
    setResult(null);
    const fd = new FormData();
    fd.set("file_name", fileName);
    fd.set("file_size", String(fileSize));
    fd.set("content", content);
    const res = await uploadResume(fd);
    setSubmitting(false);
    if (res?.error) {
      setResult({ error: res.error });
    } else {
      setResult({ ok: true, parsed: res.parsed });
      router.refresh();
    }
  }

  async function remove() {
    if (!confirm("Delete your resume and the AI-parsed skills? This will also unlink the parsed data from your profile.")) return;
    const res = await deleteResume();
    if (res?.error) {
      setResult({ error: res.error });
    } else {
      setContent("");
      setResult({ ok: true, parsed: null });
      router.refresh();
    }
  }

  const busy = extracting || submitting;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr,auto] sm:items-end">
        <div>
          <Label htmlFor="resume-file">Resume file (.pdf, .docx, .txt, .md)</Label>
          <Input
            id="resume-file"
            type="file"
            accept=".pdf,.docx,.txt,.md"
            onChange={onFile}
            disabled={busy}
          />
        </div>
        <div className="text-right">
          <Label className="text-xs text-muted-foreground">Extracted text</Label>
          <p className="font-mono text-xs text-muted-foreground">
            {content.length.toLocaleString()} / {MAX_TEXT_CHARS.toLocaleString()} chars
          </p>
        </div>
      </div>

      <Textarea
        rows={8}
        placeholder="Or paste your full resume text here. Upload a file above to auto-extract the text."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        disabled={busy}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={submit} disabled={busy || content.length < MIN_TEXT_CHARS} variant="gradient">
          {extracting ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Extracting…</>
          ) : submitting ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Parsing with AI…</>
          ) : (
            <><Upload className="h-4 w-4" /> Upload + AI parse</>
          )}
        </Button>
        <Button onClick={remove} variant="ghost" size="sm" disabled={busy}>
          <FileText className="h-3.5 w-3.5" /> Delete resume
        </Button>
      </div>

      {result?.error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{result.error}</span>
        </div>
      )}
      {result?.ok && (
        <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Parsed! Found {result.parsed?.skills?.length ?? 0} skills and {result.parsed?.projects?.length ?? 0} projects.</p>
            {result.parsed?.skills?.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Top skills: {result.parsed.skills.slice(0, 6).join(", ")}
              </p>
            )}
            {result.parsed?.years_experience != null && (
              <p className="mt-1 text-xs text-muted-foreground">
                Detected: ~{result.parsed.years_experience} years of experience
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
