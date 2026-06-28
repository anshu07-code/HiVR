"use client";

import * as React from "react";
import { Camera, Loader2, Video as VideoIcon, X, Mic, Square, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type UploadedVideo = { id: string; storagePath: string; caption: string };

const MAX_BYTES = 50 * 1024 * 1024;
const MAX_DURATION = 60;

type SkillCategory = { id: string; name: string };

/**
 * Video uploader modal. Supports two sources:
 *   1. Record live with the camera (MediaRecorder API, 60s max).
 *   2. Pick a file from disk.
 *
 * On submit: POSTs to /api/profile/video-upload, then calls back to
 * the parent to refresh the grid.
 */
export function VideoUploader({
  categories,
  onClose,
  onUploaded,
}: {
  categories: SkillCategory[];
  onClose: () => void;
  onUploaded: (v: UploadedVideo) => void;
}) {
  const [source, setSource] = React.useState<"record" | "file">("file");
  const [file, setFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [caption, setCaption] = React.useState("");
  const [skill, setSkill] = React.useState<string>("");
  const [duration, setDuration] = React.useState(0);
  const [progress, setProgress] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // MediaRecorder
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const [recording, setRecording] = React.useState(false);
  const [recordSeconds, setRecordSeconds] = React.useState(0);

  React.useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, [previewUrl]);

  // ---------- file picker ----------
  function pickFile(f: File | null) {
    if (!f) return;
    if (f.size > MAX_BYTES) { setError("Max 50 MB."); return; }
    if (!/^video\//.test(f.type)) { setError("Pick a video file (mp4, webm, mov)."); return; }
    setError(null);
    setFile(f);
    setDuration(0);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
    // Read duration
    const v = document.createElement("video");
    v.preload = "metadata";
    v.src = URL.createObjectURL(f);
    v.onloadedmetadata = () => {
      setDuration(Math.round(v.duration));
      URL.revokeObjectURL(v.src);
    };
  }

  // ---------- live recording ----------
  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 720 } }, audio: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        await videoRef.current.play();
      }
      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : MediaRecorder.isTypeSupported("video/webm")
          ? "video/webm"
          : "video/mp4";
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1_500_000 });
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime });
        chunksRef.current = [];
        const f = new File([blob], `recording-${Date.now()}.webm`, { type: mime });
        setFile(f);
        setDuration(recordSeconds);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
        setSource("file");
      };
      rec.start(250);
      recorderRef.current = rec;
      setRecording(true);
      setRecordSeconds(0);
      // Auto-stop at 60s
      const t0 = performance.now();
      const tickInt = setInterval(() => {
        const s = Math.floor((performance.now() - t0) / 1000);
        setRecordSeconds(s);
        if (s >= MAX_DURATION) {
          stopRecording();
          clearInterval(tickInt);
        }
      }, 250);
      (rec as any)._tickInt = tickInt;
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function stopRecording() {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    if ((rec as any)?._tickInt) clearInterval((rec as any)._tickInt);
    setRecording(false);
  }

  // ---------- upload ----------
  async function upload() {
    if (!file || !caption.trim()) return;
    if (duration > MAX_DURATION + 1) {
      setError(`Trim to under ${MAX_DURATION}s. Yours is ${duration}s.`);
      return;
    }
    setBusy(true);
    setError(null);
    setProgress(0);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("caption", caption.trim());
      fd.set("durationSeconds", String(duration || 1));
      if (skill) fd.set("skillCategoryId", skill);
      // Use XHR for progress
      const result: any = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/profile/video-upload");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 90));
        };
        xhr.onload = () => {
          try { resolve(JSON.parse(xhr.responseText)); }
          catch { reject(new Error("Invalid response")); }
        };
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(fd);
      });
      setProgress(100);
      if (!result.ok) throw new Error(result.error ?? "Upload failed");
      onUploaded({ id: result.id, storagePath: result.storagePath, caption: caption.trim() });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold">Add a video</h3>
        <button onClick={onClose} className="rounded-md p-1 hover:bg-accent" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => { setSource("file"); streamRef.current?.getTracks().forEach((t) => t.stop()); }}
          className={cn("rounded-md border p-2 text-xs font-medium", source === "file" ? "border-primary bg-primary/5" : "hover:bg-muted")}
        >
          <VideoIcon className="mx-auto mb-1 h-4 w-4" />Upload
        </button>
        <button
          type="button"
          onClick={() => setSource("record")}
          className={cn("rounded-md border p-2 text-xs font-medium", source === "record" ? "border-primary bg-primary/5" : "hover:bg-muted")}
        >
          <Camera className="mx-auto mb-1 h-4 w-4" />Record
        </button>
      </div>

      {source === "record" && !file && (
        <div className="space-y-2">
          <div className="relative aspect-video w-full overflow-hidden rounded-lg border bg-zinc-950">
            <video ref={videoRef} playsInline className="h-full w-full object-cover [transform:scaleX(-1)]" />
            {recording && (
              <div className="absolute right-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                REC · {recordSeconds}s / {MAX_DURATION}s
              </div>
            )}
          </div>
          <div className="flex justify-center">
            {!recording ? (
              <Button onClick={startRecording} variant="gradient">
                <Mic className="h-3.5 w-3.5" />Start recording
              </Button>
            ) : (
              <Button onClick={stopRecording} variant="destructive">
                <Square className="h-3.5 w-3.5" />Stop
              </Button>
            )}
          </div>
        </div>
      )}

      {(source === "file" || file) && (
        <div className="space-y-2">
          {file && previewUrl ? (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-video-element */}
              <video src={previewUrl} controls className="aspect-video w-full rounded-lg border bg-black" />
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <VideoIcon className="h-3 w-3" />
                <span className="truncate">{file.name}</span>
                <span>· {(file.size / 1024 / 1024).toFixed(1)} MB</span>
                {duration > 0 && <span>· {duration}s</span>}
                <button type="button" className="ml-auto text-primary hover:underline" onClick={() => { setFile(null); setPreviewUrl(null); setDuration(0); }}>Replace</button>
              </div>
            </div>
          ) : (
            <label className="grid h-32 cursor-pointer place-items-center rounded-lg border-2 border-dashed bg-muted/20 text-xs text-muted-foreground hover:border-primary/40">
              <div className="text-center">
                <VideoIcon className="mx-auto h-6 w-6" />
                <p className="mt-1">Click to choose a video</p>
                <p className="text-[10px]">MP4 / WebM / MOV · max 60s · 50MB</p>
              </div>
              <input type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
            </label>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="caption">Caption</Label>
        <Textarea id="caption" rows={2} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="60 seconds on how I built this dashboard…" maxLength={200} />
      </div>

      {categories.length > 0 && (
        <div className="space-y-1.5">
          <Label>Skill category (optional)</Label>
          <Select value={skill} onValueChange={setSkill}>
            <SelectTrigger><SelectValue placeholder="Pick a category" /></SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {progress > 0 && progress < 100 && (
        <div className="space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-[10px] text-muted-foreground">Uploading… {progress}%</p>
        </div>
      )}

      {error && <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">{error}</p>}

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button onClick={upload} disabled={busy || !file || !caption.trim()} variant="gradient" size="sm">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          {busy ? "Uploading…" : "Upload"}
        </Button>
      </div>
    </div>
  );
}
