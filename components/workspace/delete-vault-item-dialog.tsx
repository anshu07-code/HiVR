"use client";

import * as React from "react";
import { AlertTriangle, Loader2, Folder, FileText, Trash2, FolderInput } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export type DeletePreview = {
  file_count: number;
  folder_count: number;
  names: string[];
};

export function DeleteVaultItemDialog({
  open,
  onClose,
  onConfirm,
  item,
  preview,
  previewLoading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  item: { id: string; name: string; is_folder: boolean } | null;
  preview: DeletePreview | null;
  previewLoading: boolean;
}) {
  const [confirming, setConfirming] = React.useState(false);
  const [typed, setTyped] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setConfirming(false);
      setTyped("");
    }
  }, [open]);

  if (!open || !item) return null;

  const totalCount = preview ? preview.file_count + preview.folder_count : 0;
  const needsTyping = item.is_folder && (preview?.folder_count ?? 0) > 0;
  const canConfirm = !needsTyping || typed === item.name;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border bg-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-rose-100 text-rose-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="font-display text-lg font-semibold">
              Delete {item.is_folder ? "folder" : "file"}?
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {item.is_folder ? (
                <>All items inside <strong className="text-foreground">&quot;{item.name}&quot;</strong> will also be deleted.</>
              ) : (
                <>The file <strong className="text-foreground">&quot;{item.name}&quot;</strong> will be permanently removed from the vault.</>
              )}
            </p>
          </div>
        </div>

        {previewLoading ? (
          <div className="mt-4 flex items-center gap-2 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Counting contents…
          </div>
        ) : preview && totalCount > 0 ? (
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2">
              {preview.folder_count > 0 && (
                <Badge variant="outline" className="gap-1 border-rose-300 bg-rose-50 text-rose-700">
                  <Folder className="h-3 w-3" />
                  {preview.folder_count} folder{preview.folder_count === 1 ? "" : "s"}
                </Badge>
              )}
              {preview.file_count > 0 && (
                <Badge variant="outline" className="gap-1 border-rose-300 bg-rose-50 text-rose-700">
                  <FileText className="h-3 w-3" />
                  {preview.file_count} file{preview.file_count === 1 ? "" : "s"}
                </Badge>
              )}
            </div>
            <div className="max-h-32 overflow-y-auto rounded-md border bg-muted/20 p-2 text-[11px]">
              {preview.names.slice(0, 20).map((n, i) => (
                <div key={i} className="flex items-center gap-1.5 py-0.5">
                  {n.endsWith("/") || (!n.includes(".") && !preview.names[i + 1]?.startsWith(n)) ? (
                    <FolderInput className="h-3 w-3 text-muted-foreground" />
                  ) : (
                    <FileText className="h-3 w-3 text-muted-foreground" />
                  )}
                  <span className="truncate text-foreground">{n}</span>
                </div>
              ))}
              {preview.names.length > 20 && (
                <div className="mt-1 text-muted-foreground">
                  … and {preview.names.length - 20} more
                </div>
              )}
            </div>
          </div>
        ) : null}

        {needsTyping && (
          <div className="mt-4 space-y-1.5">
            <p className="text-xs text-muted-foreground">
              Type <span className="rounded bg-muted px-1 font-mono">{item.name}</span> to confirm.
            </p>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={item.name}
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            />
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={confirming}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={previewLoading || !canConfirm || confirming}
            onClick={async () => {
              setConfirming(true);
              await onConfirm();
              setConfirming(false);
            }}
          >
            {confirming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Delete {totalCount > 1 ? `${totalCount} items` : item.is_folder ? "folder" : "file"}
          </Button>
        </div>
      </div>
    </div>
  );
}
