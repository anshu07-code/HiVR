"use client";

import * as React from "react";
import { X, Download, ExternalLink, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { downloadFromSignedUrl } from "@/lib/safe-download";

export type VaultItem = {
  id: string;
  name: string;
  mime_type: string | null;
  file_type: string | null;
  file_size: number | null;
  storage_object_id: string | null;
  view_count?: number;
};

export function VaultPreviewModal({
  item,
  workspaceId,
  onClose,
}: {
  item: VaultItem;
  workspaceId: string;
  onClose: () => void;
}) {
  const isImage = item.file_type === "image";
  const isVideo = item.file_type === "video";
  const isAudio = item.file_type === "audio";
  const isPdf = item.file_type === "pdf" || item.mime_type === "application/pdf";
  const isCode = item.file_type === "code";

  const streamUrl = `/api/workspace/vault/stream/${item.id}`;
  const [downloading, setDownloading] = React.useState(false);

  // The preview uses our own /api/workspace/vault/stream/[id] route which
  // streams via the service role. For downloads, we go through the sign
  // endpoint and fetch the file as a blob so the signed URL never leaks
  // into the browser address bar.
  async function safeDownload() {
    setDownloading(true);
    try {
      const r = await fetch("/api/workspace/vault/sign", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ vaultId: item.id }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) return;
      await downloadFromSignedUrl(d.url, item.name);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        className="relative flex h-full max-h-[90vh] w-full max-w-5xl flex-col rounded-lg bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b bg-card px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{item.name}</p>
            <p className="text-[10px] text-muted-foreground">
              {item.file_type} · {item.file_size ? `${(item.file_size / 1024).toFixed(1)} KB` : ""} · viewed {item.view_count ?? 0} time{(item.view_count ?? 0) === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={safeDownload} disabled={downloading}>
              {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto bg-zinc-950">
          {isImage && (
            <div className="flex h-full items-center justify-center p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={streamUrl}
                alt={item.name}
                className="max-h-full max-w-full rounded object-contain"
                loading="lazy"
              />
            </div>
          )}

          {isVideo && (
            <div className="flex h-full items-center justify-center p-4">
              <video
                key={item.id}
                controls
                autoPlay
                playsInline
                preload="metadata"
                className="max-h-full max-w-full rounded shadow-2xl"
                src={streamUrl}
                style={{ maxHeight: "calc(90vh - 80px)" }}
              >
                Your browser does not support video playback.
              </video>
            </div>
          )}

          {isAudio && (
            <div className="flex h-full items-center justify-center p-8">
              <div className="w-full max-w-md rounded-lg bg-zinc-900 p-6 text-center">
                <Play className="mx-auto h-10 w-10 text-zinc-400" />
                <p className="mt-2 text-sm text-zinc-200">{item.name}</p>
                <audio controls autoPlay className="mt-4 w-full" src={streamUrl}>
                  Your browser does not support audio playback.
                </audio>
              </div>
            </div>
          )}

          {isPdf && (
            <iframe
              src={streamUrl}
              title={item.name}
              className="h-full w-full border-0"
            />
          )}

          {isCode && (
            <CodePreview item={item} streamUrl={streamUrl} />
          )}

          {!isImage && !isVideo && !isAudio && !isPdf && !isCode && (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-zinc-400">
              <p className="text-sm">No inline preview for this file type.</p>
              <Button size="sm" variant="outline" onClick={safeDownload} disabled={downloading}>
                {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                Download to view
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CodePreview({ item, streamUrl }: { item: VaultItem; streamUrl: string }) {
  const [text, setText] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    setLoading(true);
    setText(null);
    fetch(streamUrl)
      .then((r) => r.text())
      .then((t) => {
        // Truncate huge files for display
        if (t.length > 200_000) {
          setText(t.slice(0, 200_000) + "\n\n… (truncated — download for full file)");
        } else {
          setText(t);
        }
      })
      .catch(() => setText("// Could not load file contents"))
      .finally(() => setLoading(false));
  }, [streamUrl]);
  return (
    <pre className="h-full overflow-auto p-4 text-[12px] leading-relaxed text-zinc-200">
      {loading ? (
        <div className="flex h-full items-center justify-center text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : (
        <code>{text}</code>
      )}
    </pre>
  );
}
