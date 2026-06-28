"use client";

/**
 * FileUploader — uploads to Supabase storage bucket 'business-files' and
 * creates a corresponding business_files row with metadata + visibility.
 *
 * Path: {business_id}/{contract_id_or_root}/{timestamp}-{filename}
 *
 * Visibility is per-upload (radio group): business-wide (default), team
 * (default for contract files), or owner-only.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, X, Loader2, FileText, CheckCircle2 } from "lucide-react";

const VISIBILITY_OPTIONS = [
  { value: "team",                label: "Team",                hint: "Owner + assigned employee can see this" },
  { value: "business_owner_only", label: "Owner only",          hint: "Only you. Hidden from employees." },
  { value: "public_within_business", label: "Public (org)",      hint: "Anyone in the business can see, including future members" },
] as const;

export function FileUploader({
  businessId, contractId, disabled,
}: { businessId: string; contractId?: string; disabled?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [visibility, setVisibility] = React.useState<string>(contractId ? "team" : "business_owner_only");
  const [uploading, setUploading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function pickFile(f: File | null) {
    setFile(f);
    setErr(null);
    setDone(false);
  }

  async function upload() {
    if (!file) { setErr("Pick a file first."); return; }
    if (file.size > 100 * 1024 * 1024) { setErr("File exceeds 100 MB limit."); return; }
    setUploading(true); setErr(null); setDone(false);

    const sb = createClient();
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const storagePath = contractId
      ? `${businessId}/${contractId}/${Date.now()}-${safeName}`
      : `${businessId}/_root/${Date.now()}-${safeName}`;

    // 1. Upload to storage
    const { error: upErr } = await sb.storage.from("business-files").upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (upErr) {
      setErr(`Upload failed: ${upErr.message}`);
      setUploading(false);
      return;
    }

    // 2. Insert the metadata row
    const { error: dbErr } = await sb.from("business_files").insert({
      business_id: businessId,
      contract_id: contractId ?? null,
      storage_path: storagePath,
      storage_bucket: "business-files",
      name: file.name,
      size_bytes: file.size,
      mime_type: file.type || "application/octet-stream",
      visibility,
      uploaded_by: (await sb.auth.getUser()).data.user?.id,
    } as any);
    if (dbErr) {
      // Roll back the storage object so we don't leak orphans
      await sb.storage.from("business-files").remove([storagePath]);
      setErr(`Failed to record file: ${dbErr.message}`);
      setUploading(false);
      return;
    }

    setUploading(false);
    setDone(true);
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
    // Auto-close after a moment
    setTimeout(() => { setOpen(false); setDone(false); }, 1200);
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} variant="gradient" disabled={disabled}>
        <Upload className="h-4 w-4" /> Upload file
      </Button>
    );
  }

  return (
    <div className="w-full max-w-md rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Upload className="h-4 w-4" /> Upload file</h3>
        <Button size="icon" variant="ghost" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="file">File</Label>
          <Input
            id="file"
            ref={inputRef}
            type="file"
            disabled={uploading}
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
          {file && (
            <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-2 text-xs">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="flex-1 truncate">{file.name}</span>
              <span className="text-muted-foreground">{humanSize(file.size)}</span>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Visibility</Label>
          <div className="space-y-1">
            {VISIBILITY_OPTIONS.map((o) => (
              <label
                key={o.value}
                className={`flex cursor-pointer items-start gap-2 rounded-md border p-2 text-xs transition-colors ${
                  visibility === o.value ? "border-primary bg-primary/5" : "hover:border-foreground/30"
                }`}
              >
                <input
                  type="radio"
                  name="visibility"
                  className="mt-0.5"
                  checked={visibility === o.value}
                  onChange={() => setVisibility(o.value)}
                  disabled={uploading}
                />
                <span>
                  <span className="font-medium">{o.label}</span>
                  <span className="ml-1.5 text-muted-foreground">— {o.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {err && (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">{err}</p>
        )}
        {done && (
          <p className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-xs text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" /> Uploaded successfully.
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={() => { setOpen(false); setFile(null); setErr(null); setDone(false); }} disabled={uploading}>Cancel</Button>
          <Button onClick={upload} variant="gradient" disabled={!file || uploading}>
            {uploading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…</> : <><Upload className="h-3.5 w-3.5" /> Upload</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

function humanSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
