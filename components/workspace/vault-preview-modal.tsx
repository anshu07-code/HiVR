"use client";

import * as React from "react";
import { X, Download, ExternalLink, Loader2, Play, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
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

/** Detect Office Open XML formats (xlsx, docx, pptx) by their MIME type. */
const OFFICE_XML_MIMES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];
const EXCEL_MIMES = [
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
const CSV_MIMES = ["text/csv", "application/csv"];

export function VaultPreviewModal({
  item,
  workspaceId,
  onClose,
}: {
  item: VaultItem;
  workspaceId: string;
  onClose: () => void;
}) {
  const ext = (item.name.split(".").pop() ?? "").toLowerCase();
  const mime = (item.mime_type ?? "").toLowerCase();

  const isImage = item.file_type === "image";
  const isVideo = item.file_type === "video";
  const isAudio = item.file_type === "audio";
  const isPdf = item.file_type === "pdf" || mime === "application/pdf";
  const isCode = item.file_type === "code";
  const isCsv = item.file_type === "csv" || CSV_MIMES.includes(mime) || ext === "csv";
  const isExcel = (item.file_type === "document" || item.file_type === "spreadsheet") && (EXCEL_MIMES.includes(mime) || ext === "xlsx" || ext === "xls");
  const isOfficeXml = OFFICE_XML_MIMES.includes(mime) || ["docx", "pptx"].includes(ext);
  const isZip = ext === "zip" || ext === "rar" || ext === "7z";
  const isText = ext === "txt" || ext === "md" || ext === "json" || ext === "rtf" || ext === "yaml" || ext === "yml" || ext === "toml" || ext === "xml" || ext === "log" || ext === "env" || ext === "cfg" || ext === "ini";

  const streamUrl = `/api/workspace/vault/stream/${item.id}`;
  const [downloading, setDownloading] = React.useState(false);

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

  const previewAvailable = isImage || isVideo || isAudio || isPdf || isCode || isCsv || isExcel || isText || isOfficeXml;

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
              {item.file_type ?? ext} {item.file_size ? `· ${(item.file_size / 1024).toFixed(1)} KB` : ""} · viewed {item.view_count ?? 0} time{(item.view_count ?? 0) === 1 ? "" : "s"}
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
        <div className={`flex-1 overflow-auto ${isImage || isVideo || isAudio || isPdf ? "bg-zinc-950" : "bg-background"}`}>
          {isImage && (
            <div className="flex h-full items-center justify-center p-4">
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

          {isText && (
            <CodePreview item={item} streamUrl={streamUrl} />
          )}

          {isCsv && (
            <CsvPreview item={item} streamUrl={streamUrl} />
          )}

          {isExcel && (
            <ExcelPreview item={item} streamUrl={streamUrl} />
          )}

          {isOfficeXml && !isExcel && (
            <OfficeXmlPreview item={item} streamUrl={streamUrl} />
          )}

          {!previewAvailable && (
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

/* ────── Code / Text preview ────── */

function CodePreview({ item, streamUrl }: { item: VaultItem; streamUrl: string }) {
  const [text, setText] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    setLoading(true);
    setText(null);
    fetch(streamUrl)
      .then((r) => r.text())
      .then((t) => {
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

/* ────── CSV preview ────── */

function CsvPreview({ item, streamUrl }: { item: VaultItem; streamUrl: string }) {
  const [rows, setRows] = React.useState<string[][]>([]);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    setLoading(true);
    fetch(streamUrl)
      .then((r) => r.text())
      .then((t) => {
        const lines = t.split("\n").filter((l) => l.trim());
        const parsed = lines.map((l) => {
          const result: string[] = [];
          let current = "";
          let inQuotes = false;
          for (let i = 0; i < l.length; i++) {
            const ch = l[i];
            if (ch === '"') { inQuotes = !inQuotes; continue; }
            if (ch === "," && !inQuotes) { result.push(current.trim()); current = ""; continue; }
            current += ch;
          }
          result.push(current.trim());
          return result;
        });
        setRows(parsed);
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [streamUrl]);
  if (loading) return <div className="flex h-full items-center justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (rows.length === 0) return <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">Empty or unreadable CSV.</div>;
  return (
    <div className="h-full overflow-auto p-4">
      <table className="w-full text-left text-xs border-collapse">
        <thead>
          <tr className="border-b bg-muted/50">
            {rows[0].map((h, i) => (
              <th key={i} className="px-3 py-2 font-semibold text-foreground whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(1).map((row, ri) => (
            <tr key={ri} className="border-b border-border/40 hover:bg-muted/20">
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-1.5 text-muted-foreground whitespace-nowrap max-w-[200px] truncate">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ────── Excel preview (xlsx/xls) ────── */

function ExcelPreview({ item, streamUrl }: { item: VaultItem; streamUrl: string }) {
  const [html, setHtml] = React.useState<string | null>(null);
  const [error, setError] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    setLoading(true);
    setError(false);
    setHtml(null);

    (async () => {
      try {
        const r = await fetch(streamUrl);
        const blob = await r.blob();

        // Dynamically load the xlsx library (SheetJS)
        const XLSX = await import("xlsx");

        const buf = await blob.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });

        // Render each sheet as an HTML table
        let out = "";
        for (const name of wb.SheetNames) {
          const ws = wb.Sheets[name];
          const sheetHtml = XLSX.utils.sheet_to_html(ws, { id: `sheet-${name}` });
          out += `<div class="sheet-wrap">`;
          out += `<div class="sheet-name">${escapeHtml(name)}</div>`;
          out += sheetHtml;
          out += `</div>`;
        }
        setHtml(out);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [streamUrl]);

  if (loading) return <div className="flex h-full items-center justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (error) return <FallbackPreview item={item} />;

  return (
    <div className="h-full overflow-auto p-4">
      <style>{`
        .sheet-wrap { margin-bottom: 1.5rem; }
        .sheet-name { font-size: 13px; font-weight: 600; margin-bottom: 0.5rem; color: hsl(var(--foreground)); }
        .sheet-wrap table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .sheet-wrap td, .sheet-wrap th { border: 1px solid hsl(var(--border)); padding: 4px 8px; text-align: left; white-space: nowrap; }
        .sheet-wrap th { background: hsl(var(--muted)); font-weight: 600; }
      `}</style>
      <div dangerouslySetInnerHTML={{ __html: html ?? "" }} />
    </div>
  );
}

/* ────── Office XML preview (docx/pptx) — Google Docs Viewer ────── */

function OfficeXmlPreview({ item, streamUrl }: { item: VaultItem; streamUrl: string }) {
  // Use Microsoft Office Online viewer if available, otherwise show fallback
  const [useIframe, setUseIframe] = React.useState(false);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <FileText className="h-12 w-12 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        Preview not available inline. Download to view.
      </p>
      <Button size="sm" variant="outline" onClick={() => {
        fetch("/api/workspace/vault/sign", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ vaultId: item.id }),
        }).then(r => r.json()).then(d => {
          if (d.ok && d.url) window.open(d.url, "_blank");
        });
      }}>
        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
        Open in new tab
      </Button>
    </div>
  );
}

/* ────── Fallback ────── */

function FallbackPreview({ item }: { item: VaultItem }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-zinc-400">
      <p className="text-sm">Could not render preview for this file.</p>
    </div>
  );
}

/* ────── Helpers ────── */

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
