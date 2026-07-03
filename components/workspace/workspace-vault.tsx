"use client";

import * as React from "react";
import {
  Folder, FileText, ChevronRight, ChevronDown, Plus, Upload, Download, Loader2,
  Share2, Trash2, Edit2, Search, LayoutGrid,
  FileImage, Film, Music, FileCode, FileArchive, FileText as FileTextIcon,
  FolderPlus, X, RefreshCw, Lock, FilePlus, Flame, Wallet,
  Sparkles, User, Users, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, formatPaise } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { DeleteVaultItemDialog, type DeletePreview } from "./delete-vault-item-dialog";
import { VaultPreviewModal, type VaultItem as PreviewItem } from "./vault-preview-modal";
import { downloadFromSignedUrl } from "@/lib/safe-download";

type VaultItem = {
  id: string;
  workspace_id: string;
  parent_id: string | null;
  is_folder: boolean;
  name: string;
  original_name: string | null;
  storage_object_id: string | null;
  file_size: number | null;
  mime_type: string | null;
  file_type: string | null;
  uploaded_by: string;
  view_count: number;
  created_at: string;
};

const FILE_ICON: Record<string, any> = {
  image: FileImage,
  video: Film,
  audio: Music,
  pdf: FileTextIcon,
  document: FileTextIcon,
  code: FileCode,
  archive: FileArchive,
  folder: Folder,
  other: FileText,
};

const FILE_COLOR: Record<string, string> = {
  image: "text-pink-500",
  video: "text-violet-500",
  audio: "text-emerald-500",
  pdf: "text-rose-500",
  document: "text-sky-500",
  code: "text-amber-500",
  archive: "text-zinc-500",
  folder: "text-amber-500",
  other: "text-muted-foreground",
};

export function WorkspaceVault({
  workspaceId, currentUserId, isLocked, escrowFunded, incentiveAmountPaise,
  ownerFilter, onOwnerFilterChange, onUploadClick, onFundClick,
  isBuyer,
}: {
  workspaceId: string;
  currentUserId: string;
  isLocked: boolean;
  escrowFunded: boolean;
  incentiveAmountPaise: number | null;
  ownerFilter: "all" | "mine" | "theirs";
  onOwnerFilterChange: (v: "all" | "mine" | "theirs") => void;
  onUploadClick?: (opts: { target: "current-folder" | "root" }) => void;
  onFundClick?: () => void;
  isBuyer?: boolean;
}) {
  const [items, setItems] = React.useState<VaultItem[]>([]);
  const [currentFolder, setCurrentFolder] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [renaming, setRenaming] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null);
  const [sharingId, setSharingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [viewMode, setViewMode] = React.useState<"folder" | "all">("folder");
  const [search, setSearch] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState<string>("all");
  const [sortBy, setSortBy] = React.useState<"name" | "date" | "size" | "type">("date");
  const [uploaderNames, setUploaderNames] = React.useState<Record<string, string>>({});

  const [newFolderName, setNewFolderName] = React.useState("");
  const [showNewFolder, setShowNewFolder] = React.useState(false);
  const [newSubfolderParentId, setNewSubfolderParentId] = React.useState<string | null>(null);
  const [newFileName, setNewFileName] = React.useState("");
  const [showNewFile, setShowNewFile] = React.useState(false);
  const [newFileParentId, setNewFileParentId] = React.useState<string | null>(null);

  const [isDragging, setIsDragging] = React.useState(false);
  const [dropTargetFolderId, setDropTargetFolderId] = React.useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = React.useState<VaultItem | null>(null);
  const [deletePreview, setDeletePreview] = React.useState<DeletePreview | null>(null);
  const [deleteLoading, setDeleteLoading] = React.useState(false);

  const [previewItem, setPreviewItem] = React.useState<PreviewItem | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const dirInputRef = React.useRef<HTMLInputElement>(null);
  const sbRef = React.useRef<ReturnType<typeof createClient> | null>(null);

  // Listen for a custom event the parent can dispatch to trigger
  // uploads from a header button. Detail:
  //   { kind: 'files' | 'folder' | 'new-file' | 'new-folder' }
  React.useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<{ kind?: "files" | "folder" | "new-file" | "new-folder" }>).detail;
      const kind = detail?.kind ?? "files";
      if (kind === "folder") {
        dirInputRef.current?.click();
        onUploadClick?.({ target: "current-folder" });
        return;
      }
      if (kind === "files") {
        fileInputRef.current?.click();
        onUploadClick?.({ target: "current-folder" });
        return;
      }
      if (kind === "new-file") {
        setNewFileParentId(currentFolder);
        setNewFileName("");
        setShowNewFile(true);
        setTimeout(() => {
          const id = currentFolder ? `vault-new-file-${currentFolder}` : "vault-new-file-root";
          const el = document.getElementById(id) as HTMLInputElement | null;
          el?.focus();
        }, 50);
        return;
      }
      if (kind === "new-folder") {
        if (currentFolder) {
          setNewSubfolderParentId(currentFolder);
          setNewFolderName("");
        } else {
          setShowNewFolder(true);
          setNewFolderName("");
          setTimeout(() => {
            const el = document.getElementById("vault-new-folder-root") as HTMLInputElement | null;
            el?.focus();
          }, 50);
        }
        return;
      }
    }
    window.addEventListener("hivr:vault:upload", handler);
    return () => window.removeEventListener("hivr:vault:upload", handler);
  }, [onUploadClick, currentFolder]);

  const load = React.useCallback(async () => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const { data, error: err } = await sb
      .from("workspace_vault")
      .select("id, workspace_id, parent_id, is_folder, name, original_name, storage_object_id, file_size, mime_type, file_type, uploaded_by, view_count, created_at")
      .eq("workspace_id", workspaceId)
      .order("is_folder", { ascending: false })
      .order("name");
    if (err) { setError(err.message); return; }
    setItems((data ?? []) as VaultItem[]);
  }, [workspaceId]);

  React.useEffect(() => {
    load();
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    // Subscribe to BOTH the vault table (for INSERT/UPDATE) and the
    // event log (for DELETE, which doesn't always propagate via the
    // workspace_vault row filter since Supabase Realtime applies the
    // filter to the new record which is empty on DELETE). The
    // event-log channel has no row filter so DELETE events fire
    // immediately.
    const channel = sb
      .channel(`ws-vault-${workspaceId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "workspace_vault" },
        (payload: any) => {
          // Client-side filter: only react to events for this workspace
          const wsId = (payload.new?.workspace_id ?? payload.old?.workspace_id) as string | undefined;
          if (wsId === workspaceId) load();
        })
      .on("postgres_changes",
        { event: "*", schema: "public", table: "vault_event_log" },
        (payload: any) => {
          const wsId = payload.new?.workspace_id as string | undefined;
          if (wsId === workspaceId) load();
        })
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [workspaceId, load]);

  // Tell the parent (workspace-shell) what the current folder is so the
  // header upload menu can show the right "uploading to …" hint.
  React.useEffect(() => {
    const name = currentFolder
      ? items.find((i) => i.id === currentFolder)?.name ?? "Folder"
      : "Root";
    const map: Record<string, string> = {};
    for (const i of items.filter((i) => i.is_folder)) map[i.id] = i.name;
    window.dispatchEvent(new CustomEvent("hivr:vault:current-folder", {
      detail: { id: currentFolder, name, map },
    }));
  }, [currentFolder, items]);

  React.useEffect(() => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const ids = Array.from(new Set(items.map((i) => i.uploaded_by))).filter((id) => id && !uploaderNames[id]);
    if (ids.length === 0) return;
    sb.from("users").select("id, full_name").in("id", ids).then(({ data }) => {
      if (!data) return;
      const next: Record<string, string> = {};
      for (const u of data as any[]) next[u.id] = u.full_name ?? "Someone";
      setUploaderNames((prev) => ({ ...prev, ...next }));
    });
  }, [items, uploaderNames]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = items;
    if (q) list = list.filter((i) => i.name.toLowerCase().includes(q));
    if (typeFilter !== "all") list = list.filter((i) => i.file_type === typeFilter);
    if (viewMode === "folder") {
      list = list.filter((i) => (i.parent_id ?? null) === currentFolder);
    } else {
      list = list.filter((i) => !i.is_folder);
    }
    if (ownerFilter === "mine") list = list.filter((i) => i.uploaded_by === currentUserId);
    if (ownerFilter === "theirs") list = list.filter((i) => i.uploaded_by !== currentUserId);
    const sorted = [...list].sort((a, b) => {
      if (a.is_folder !== b.is_folder) return a.is_folder ? -1 : 1;
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "size") return (b.file_size ?? 0) - (a.file_size ?? 0);
      if (sortBy === "type") return (a.file_type ?? "").localeCompare(b.file_type ?? "");
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return sorted;
  }, [items, search, typeFilter, sortBy, viewMode, currentFolder, ownerFilter, currentUserId]);

  const folders = items.filter((i) => i.is_folder);
  const rootFolders = folders.filter((f) => f.parent_id === null);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const expandAll = React.useCallback(() => {
    setExpanded(new Set(folders.map((f) => f.id)));
  }, [folders]);
  const collapseAll = React.useCallback(() => {
    setExpanded(new Set());
  }, []);

  const countInFolder = (folderId: string): { files: number; folders: number } => {
    let files = 0;
    let fldrs = 0;
    const queue: string[] = [folderId];
    const seen = new Set<string>();
    while (queue.length) {
      const fid = queue.shift()!;
      if (seen.has(fid)) continue;
      seen.add(fid);
      for (const f of items) {
        if (f.is_folder) {
          if (f.parent_id === fid) { fldrs++; queue.push(f.id); }
        } else {
          if (f.parent_id === fid) files++;
        }
      }
    }
    return { files, folders: fldrs };
  };

  // Recursive walker for the FileSystem API.
  const walkFileSystemEntry = async (entry: any, basePath: string, out: { file: File; relativePath: string }[]): Promise<void> => {
    if (entry.isFile) {
      const file: File = await new Promise((resolve, reject) => entry.file(resolve, reject));
      const fullPath = entry.fullPath || `/${file.name}`;
      let relative: string;
      if (fullPath.startsWith(basePath)) {
        // Keep the top-level folder name so the vault tree shows the
        // actual folder uploaded, not a generic "folder".
        const topLevel = basePath.replace(/^\//, "");
        const rest = fullPath.slice(basePath.length);
        relative = topLevel + rest;
      } else {
        relative = file.name;
      }
      out.push({ file, relativePath: relative || file.name });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const readBatch = (): Promise<void> => new Promise((resolve, reject) => {
        reader.readEntries((entries: any[]) => {
          if (!entries.length) return resolve();
          Promise.all(entries.map((e) => walkFileSystemEntry(e, basePath, out)))
            .then(() => readBatch())
            .catch(reject);
        }, reject);
      });
      await readBatch();
    }
  };

  // ---- Folder operations ----
  const newFolder = async () => {
    const name = newFolderName.trim() || "New folder";
    if (isLocked) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/workspace/vault/folder", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, name, parentId: currentFolder }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) { setError(d?.error ?? "Failed"); return; }
      setNewFolderName("");
      setShowNewFolder(false);
      if (d.folder?.id) setExpanded((p) => new Set(p).add(d.folder.id));
    } finally {
      setBusy(false);
    }
  };

  const createSubfolder = async () => {
    const name = newFolderName.trim() || "New folder";
    if (isLocked) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/workspace/vault/folder", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, name, parentId: newSubfolderParentId }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) { setError(d?.error ?? "Failed"); return; }
      setNewFolderName("");
      setNewSubfolderParentId(null);
      if (d.folder?.id) {
        setExpanded((p) => new Set(p).add(d.folder.id));
        if (newSubfolderParentId) setExpanded((p) => new Set(p).add(newSubfolderParentId));
      }
    } finally {
      setBusy(false);
    }
  };

  const createNewFile = async (parentFolderId: string | null) => {
    const name = newFileName.trim() || "untitled.md";
    if (isLocked) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/workspace/vault/file", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, name, parentId: parentFolderId }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) { setError(d?.error ?? "Failed"); return; }
      setNewFileName("");
      setShowNewFile(false);
      setNewFileParentId(null);
      if (d.file?.parent_id) {
        setExpanded((p) => new Set(p).add(d.file.parent_id));
        setCurrentFolder(d.file.parent_id);
      }
    } finally {
      setBusy(false);
    }
  };

  // ---- Drop into specific folder ----
  const handleDropIntoFolder = async (e: React.DragEvent, folderId: string) => {
    const dataTransfer = e.dataTransfer as any;
    if (!dataTransfer.items?.length) return;
    const entries: any[] = [];
    for (const item of dataTransfer.items) {
      if (item.kind === "file") {
        const entry = item.webkitGetAsEntry?.();
        if (entry) entries.push(entry);
      }
    }
    const isDir = entries.some((e) => e?.isDirectory);
    if (isDir) {
      const out: { file: File; relativePath: string }[] = [];
      for (const entry of entries) {
        const base = entry.fullPath || "/";
        await walkFileSystemEntry(entry, base, out);
      }
      await uploadFilesWithPathsToFolder(out, folderId || null);
      return;
    }
    const files: File[] = [];
    for (const item of dataTransfer.items) {
      if (item.kind === "file") {
        const f = item.getAsFile();
        if (f) files.push(f as File);
      }
    }
    await uploadFilesToFolder(files, folderId || null);
  };

  // ---- Upload ----
  const uploadFilesToFolder = async (files: File[], folderId: string | null) => {
    if (isLocked || files.length === 0) return;
    setBusy(true); setError(null);
    try {
      for (const f of files) {
        const fd = new FormData();
        fd.set("file", f);
        fd.set("workspaceId", workspaceId);
        if (folderId) fd.set("parentId", folderId);
        const r = await fetch("/api/workspace/vault/upload", { method: "POST", body: fd });
        const text = await r.text();
        let d: any = {};
        try { d = text ? JSON.parse(text) : {}; } catch { d = { error: text }; }
        if (!r.ok || d.ok === false) { setError(d?.error ?? "Upload failed"); }
      }
    } finally {
      setBusy(false);
    }
  };

  const uploadFilesWithPaths = async (items: { file: File; relativePath: string }[]) => {
    if (isLocked || items.length === 0) return;
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.set("workspaceId", workspaceId);
      if (currentFolder) fd.set("parentId", currentFolder);
      for (const { file, relativePath } of items) {
        fd.append("files[]", file, file.name);
        fd.append("paths[]", relativePath);
      }
      const r = await fetch("/api/workspace/vault/auto-structure", { method: "POST", body: fd });
      const text = await r.text();
      let d: any = {};
      try { d = text ? JSON.parse(text) : {}; } catch { d = { error: text }; }
      if (!r.ok || !d.ok) {
        setError(d?.error ?? "Upload failed");
        return;
      }
      if (d.created?.folders > 0) {
        for (const f of d.folders ?? []) {
          if (!f.path.includes("/")) setExpanded((p) => new Set(p).add(f.id));
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const uploadFilesWithPathsToFolder = async (
    items: { file: File; relativePath: string }[],
    folderId: string | null,
  ) => {
    if (isLocked || items.length === 0) return;
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.set("workspaceId", workspaceId);
      if (folderId) fd.set("parentId", folderId);
      for (const { file, relativePath } of items) {
        fd.append("files[]", file, file.name);
        fd.append("paths[]", relativePath);
      }
      const r = await fetch("/api/workspace/vault/auto-structure", { method: "POST", body: fd });
      const text = await r.text();
      let d: any = {};
      try { d = text ? JSON.parse(text) : {}; } catch { d = { error: text }; }
      if (!r.ok || !d.ok) { setError(d?.error ?? "Upload failed"); return; }
    } finally {
      setBusy(false);
    }
  };

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list) return;
    const arr = Array.from(list);
    e.target.value = "";
    await uploadFilesToFolder(arr, currentFolder);
  };

  const onDir = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list) return;
    const arr = Array.from(list);
    e.target.value = "";
    // KEEP the top-level folder name so the vault tree shows the
    // actual folder the user dropped.
    const withPaths = arr.map((f) => ({
      file: f,
      relativePath: (f as any).webkitRelativePath || f.name,
    }));
    await uploadFilesWithPaths(withPaths);
  };

  // ---- Drag and drop ----
  const onDragOver = (e: React.DragEvent) => {
    if (isLocked) return;
    e.preventDefault();
    setIsDragging(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget === e.target) setIsDragging(false);
  };
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isLocked) return;
    const dataTransfer = e.dataTransfer as any;
    if (dataTransfer.items && dataTransfer.items.length) {
      const entries: any[] = [];
      for (const item of dataTransfer.items) {
        if (item.kind === "file") {
          const entry = item.webkitGetAsEntry?.();
          if (entry) entries.push(entry);
        }
      }
      const isDir = entries.some((e) => e?.isDirectory);
      if (isDir) {
        const out: { file: File; relativePath: string }[] = [];
        for (const entry of entries) {
          const base = entry.fullPath || "/";
          await walkFileSystemEntry(entry, base, out);
        }
        await uploadFilesWithPaths(out);
        return;
      }
      const files: File[] = [];
      for (const item of dataTransfer.items) {
        if (item.kind === "file") {
          const f = item.getAsFile();
          if (f) files.push(f as File);
        }
      }
      await uploadFilesToFolder(files, currentFolder);
      return;
    }
    const files: File[] = [];
    for (const f of Array.from(dataTransfer.files || [])) files.push(f as File);
    await uploadFilesToFolder(files, currentFolder);
  };

  // ---- File operations ----
  const startRename = (item: VaultItem) => {
    setRenaming(item.id);
    setRenameValue(item.name);
  };
  const commitRename = async (id: string) => {
    const newName = renameValue.trim();
    setRenaming(null);
    if (!newName) return;
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current as any;
    await sb.from("workspace_vault").update({ name: newName }).eq("id", id);
    load();
  };

  const openDelete = async (item: VaultItem) => {
    setDeleteTarget(item);
    setDeletePreview(null);
    setDeleteLoading(true);
    try {
      if (item.is_folder) {
        const r = await fetch(`/api/workspace/vault/${item.id}?cascade=true&dryRun=1`, { method: "DELETE" });
        const d = await r.json();
        if (r.ok && d.preview) setDeletePreview(d);
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const r = await fetch(`/api/workspace/vault/${deleteTarget.id}?cascade=true`, { method: "DELETE" });
      const d = await r.json();
      if (!r.ok || !d.ok) { setError(d?.error ?? "Delete failed"); return; }
      if (deleteTarget.is_folder && expanded.has(deleteTarget.id)) {
        setExpanded((p) => { const n = new Set(p); n.delete(deleteTarget.id); return n; });
      }
      setDeleteTarget(null);
      setDeletePreview(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const download = async (id: string) => {
    setDownloadingId(id);
    try {
      const r = await fetch("/api/workspace/vault/sign", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ vaultId: id }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) { setError(data?.error ?? "Failed"); return; }
      const item = items.find((i) => i.id === id);
      const filename = item?.original_name ?? item?.name ?? "download";
      // Fetch as blob and download via a hidden anchor — keeps the
      // signed URL out of the browser address bar / history.
      await downloadFromSignedUrl(data.url, filename);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDownloadingId(null);
    }
  };

  const openPreview = (item: VaultItem) => {
    if (item.is_folder) {
      setCurrentFolder(item.id);
      setExpanded((p) => new Set(p).add(item.id));
      return;
    }
    setPreviewItem({
      id: item.id,
      name: item.original_name ?? item.name,
      mime_type: item.mime_type,
      file_type: item.file_type,
      file_size: item.file_size,
      storage_object_id: item.storage_object_id,
      view_count: item.view_count,
    });
  };

  const share = async (item: VaultItem) => {
    if (item.is_folder) return;
    setSharingId(item.id);
    try {
      const note = `Shared a file: ${item.original_name ?? item.name}`;
      const r = await fetch("/api/workspace/send-message", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, body: note, vaultResourceId: item.id }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) setError(data?.error ?? "Failed");
    } finally {
      setSharingId(null);
    }
  };

  // ---- Folder tree (renders files within folders, accepts owner filter) ----
  const renderFolderTree = (
    parentId: string | null,
    depth: number,
    filterFn: (item: VaultItem) => boolean,
    editable: boolean,
  ) => {
    const folderList = folders.filter(
      (f) => (f.parent_id ?? null) === parentId && filterFn(f),
    );
    const fileList = items.filter(
      (i) => !i.is_folder && (i.parent_id ?? null) === parentId && filterFn(i),
    );
    const combined = [...folderList, ...fileList];
    return combined.map((item) => {
      if (item.is_folder) {
        const f = item;
        const isOpen = expanded.has(f.id);
        const isCurrent = currentFolder === f.id;
        const counts = countInFolder(f.id);
        const isDropTarget = dropTargetFolderId === f.id;
        return (
          <div key={f.id}>
            <div
              className={cn(
                "group flex items-center gap-1 rounded px-1 py-1 text-sm transition-colors",
                isCurrent ? "bg-muted font-medium" : "hover:bg-muted/60",
                isDropTarget && "ring-2 ring-primary bg-primary/10",
              )}
              style={{ paddingLeft: depth * 14 + 4 }}
              onDragOver={(e) => {
                if (!editable || isLocked) return;
                e.preventDefault();
                e.stopPropagation();
                setDropTargetFolderId(f.id);
              }}
              onDragLeave={(e) => {
                if (e.currentTarget === e.target) setDropTargetFolderId(null);
              }}
              onDrop={(e) => {
                if (!editable || isLocked) return;
                e.preventDefault();
                e.stopPropagation();
                setDropTargetFolderId(null);
                handleDropIntoFolder(e, f.id);
              }}
            >
              <button
                type="button"
                onClick={() => toggleExpand(f.id)}
                className="grid h-4 w-4 shrink-0 place-items-center text-muted-foreground"
              >
                {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
              <button
                type="button"
                onClick={() => setCurrentFolder(f.id)}
                className="flex flex-1 items-center gap-1.5 truncate text-left"
              >
                <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                {renaming === f.id ? (
                  <Input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => commitRename(f.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename(f.id);
                      if (e.key === "Escape") setRenaming(null);
                    }}
                    className="h-6 text-xs"
                  />
                ) : (
                  <>
                    <span className="truncate text-xs">{f.name}</span>
                    {(counts.files > 0 || counts.folders > 0) && (
                      <span className="shrink-0 rounded bg-muted/60 px-1 text-[9px] text-muted-foreground">
                        {counts.files > 0 && `${counts.files} file${counts.files === 1 ? "" : "s"}`}
                        {counts.files > 0 && counts.folders > 0 && " · "}
                        {counts.folders > 0 && `${counts.folders} folder${counts.folders === 1 ? "" : "s"}`}
                      </span>
                    )}
                  </>
                )}
              </button>
              {editable && !isLocked && (
                <div className="hidden items-center gap-0.5 group-hover:flex">
                  <button
                    type="button"
                    onClick={() => setNewSubfolderParentId(f.id)}
                    className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-background"
                    title="New subfolder here"
                  >
                    <FolderPlus className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewFileParentId(f.id);
                      setNewFileName("");
                      setTimeout(() => {
                        const el = document.getElementById(`vault-new-file-${f.id}`) as HTMLInputElement | null;
                        el?.focus();
                      }, 50);
                    }}
                    className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-background"
                    title="New file here"
                  >
                    <FilePlus className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => startRename(f)}
                    className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-background"
                    title="Rename"
                  >
                    <Edit2 className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openDelete(f)}
                    className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-background hover:text-destructive"
                    title="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
            {newSubfolderParentId === f.id && editable && !isLocked && (
              <div className="mt-0.5 mb-0.5 flex items-center gap-1" style={{ paddingLeft: (depth + 1) * 14 + 4 }}>
                <FolderPlus className="h-3 w-3 text-muted-foreground" />
                <Input
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") createSubfolder();
                    if (e.key === "Escape") { setNewSubfolderParentId(null); setNewFolderName(""); }
                  }}
                  placeholder="Subfolder name"
                  className="h-6 text-xs"
                />
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={createSubfolder} disabled={busy}><Plus className="h-3 w-3" /></Button>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => { setNewSubfolderParentId(null); setNewFolderName(""); }}><X className="h-3 w-3" /></Button>
              </div>
            )}
            {newFileParentId === f.id && editable && !isLocked && (
              <div className="mt-0.5 mb-0.5 flex items-center gap-1" style={{ paddingLeft: (depth + 1) * 14 + 4 }}>
                <FilePlus className="h-3 w-3 text-muted-foreground" />
                <Input
                  id={`vault-new-file-${f.id}`}
                  autoFocus
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") createNewFile(f.id);
                    if (e.key === "Escape") { setNewFileParentId(null); setNewFileName(""); }
                  }}
                  placeholder="filename.md"
                  className="h-6 text-xs"
                />
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => createNewFile(f.id)} disabled={busy}><Plus className="h-3 w-3" /></Button>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => { setNewFileParentId(null); setNewFileName(""); }}><X className="h-3 w-3" /></Button>
              </div>
            )}
            {isOpen && (
              <>
                {renderFolderTree(f.id, depth + 1, filterFn, editable)}
              </>
            )}
          </div>
        );
      } else {
        const file = item;
        const FileIcon = FILE_ICON[file.file_type ?? "other"] ?? FileText;
        const color = FILE_COLOR[file.file_type ?? "other"] ?? "text-muted-foreground";
        return (
          <div
            key={file.id}
            style={{ paddingLeft: depth * 14 + 4 + 16 }}
          >
            <button
              type="button"
              onClick={() => openPreview(file)}
              className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs hover:bg-muted/50"
            >
              <FileIcon className={cn("h-3 w-3 shrink-0", color)} />
              <span className="truncate text-muted-foreground">{file.original_name ?? file.name}</span>
            </button>
          </div>
        );
      }
    });
  };

  // ---- File card render ----
  const renderItem = (item: VaultItem) => {
    const Icon = FILE_ICON[item.file_type ?? "other"] ?? FileText;
    const color = FILE_COLOR[item.file_type ?? "other"] ?? "text-muted-foreground";
    const isMine = item.uploaded_by === currentUserId;
    const uploaderName = uploaderNames[item.uploaded_by] ?? (isMine ? "You" : "Counterparty");
    return (
      <div
        key={item.id}
        className={cn(
          "group relative flex flex-col rounded-md border bg-background p-2 transition-colors hover:border-primary/50",
          isMine ? "border-l-2 border-l-emerald-500/40" : "border-l-2 border-l-sky-500/40",
        )}
      >
        <button
          type="button"
          onClick={() => openPreview(item)}
          className="flex flex-col items-stretch text-left"
        >
          <div className="grid h-20 place-items-center rounded bg-muted/30">
            <Icon className={cn("h-8 w-8", color)} />
          </div>
          <p className="mt-1.5 line-clamp-2 text-xs font-medium" title={item.original_name ?? item.name}>
            {item.original_name ?? item.name}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {item.file_size ? `${(item.file_size / 1024).toFixed(0)} KB` : "—"}
            {item.view_count > 0 && <> · 👁 {item.view_count}</>}
          </p>
          <p className="mt-0.5 inline-flex items-center gap-0.5 text-[9px] text-muted-foreground">
            <User className="h-2.5 w-2.5" />
            <span className="truncate">{uploaderName}</span>
          </p>
        </button>
        {!isLocked && (
          <div className="mt-1.5 flex gap-1">
            <Button size="sm" variant="outline" className="h-6 flex-1 text-[10px]"
              disabled={downloadingId === item.id}
              onClick={() => download(item.id)}
            >
              {downloadingId === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
            </Button>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]"
              disabled={sharingId === item.id}
              onClick={() => share(item)}
              title="Share to chat"
            >
              {sharingId === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Share2 className="h-3 w-3" />}
            </Button>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] hover:text-destructive"
              onClick={() => openDelete(item)}
              title="Delete"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
    );
  };

  // Build the file grid (with empty-state support and floating +)
  const fileGrid = (
    <div
      className={cn(
        "rounded-md border bg-card p-2 transition-colors",
        dropTargetFolderId === currentFolder && "ring-2 ring-primary",
      )}
      onDragOver={(e) => {
        if (isLocked) return;
        e.preventDefault();
        setDropTargetFolderId(currentFolder);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDropTargetFolderId(null);
      }}
      onDrop={(e) => {
        if (isLocked) return;
        e.preventDefault();
        setDropTargetFolderId(null);
        handleDropIntoFolder(e, currentFolder ?? "");
      }}
    >
      {viewMode === "folder" && currentFolder !== null && (
        <Breadcrumb currentFolder={currentFolder} folders={folders} onNavigate={setCurrentFolder} />
      )}
      {filtered.length === 0 ? (
        <DropZone
          currentFolder={currentFolder}
          onPickFile={() => fileInputRef.current?.click()}
          onPickFolder={() => dirInputRef.current?.click()}
          onCreateNewFile={() => {
            setShowNewFile(true);
            setNewFileParentId(currentFolder);
            setNewFileName("");
            setTimeout(() => {
              const id = currentFolder ? `vault-new-file-${currentFolder}` : "vault-new-file-root";
              const el = document.getElementById(id) as HTMLInputElement | null;
              el?.focus();
            }, 50);
          }}
          onCreateNewFolder={() => {
            if (currentFolder) {
              setNewSubfolderParentId(currentFolder);
              setNewFolderName("");
            } else {
              setShowNewFolder(true);
              setNewFolderName("");
            }
          }}
          isDragging={isDragging}
          searchActive={!!search.trim() || typeFilter !== "all"}
          viewMode={viewMode}
          ownerFilter={ownerFilter}
          isLocked={isLocked}
        />
      ) : (
        <div className="relative">
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map(renderItem)}
          </div>
        </div>
      )}
    </div>
  );

  // Build the explorer sidebar (filtered by ownerFilter)
  const explorer = viewMode === "folder" ? (
    <div className="flex max-h-[520px] flex-col rounded-md border bg-card p-2">
      <div className="flex items-center justify-between border-b pb-1.5">
        <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Folder className="h-3 w-3" />Explorer
          {ownerFilter !== "all" && (
            <span className="rounded bg-muted px-1 text-[9px] text-muted-foreground">{ownerFilter}</span>
          )}
        </p>
        <div className="flex items-center gap-0.5">
          {folders.length > 0 && (
            <>
              <button
                type="button"
                onClick={expandAll}
                className="grid h-5 px-1.5 place-items-center rounded text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Expand all folders"
              >
                <ChevronDown className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={collapseAll}
                className="grid h-5 px-1.5 place-items-center rounded text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Collapse all folders"
              >
                <ChevronRight className="h-3 w-3" />
              </button>
            </>
          )}
          {!isLocked && ownerFilter !== "theirs" && (
            <>
              <button
                type="button"
                onClick={() => {
                  setShowNewFile(true);
                  setNewFileParentId(null);
                  setNewFileName("");
                  setTimeout(() => {
                    const el = document.getElementById("vault-new-file-root") as HTMLInputElement | null;
                    el?.focus();
                  }, 50);
                }}
                className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-muted"
                title="New file at root"
              >
                <FilePlus className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowNewFolder(true);
                  setNewFolderName("");
                  setTimeout(() => {
                    const el = document.getElementById("vault-new-folder-root") as HTMLInputElement | null;
                    el?.focus();
                  }, 50);
                }}
                className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-muted"
                title="New folder at root"
              >
                <FolderPlus className="h-3 w-3" />
              </button>
            </>
          )}
        </div>
      </div>
      {showNewFolder && (
        <div className="mt-1 flex items-center gap-1 pl-1.5">
          <FolderPlus className="h-3 w-3 text-muted-foreground" />
          <Input
            id="vault-new-folder-root"
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") newFolder();
              if (e.key === "Escape") { setShowNewFolder(false); setNewFolderName(""); }
            }}
            placeholder="Folder name"
            className="h-6 text-[11px]"
          />
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={newFolder} disabled={busy}><Plus className="h-3 w-3" /></Button>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => { setShowNewFolder(false); setNewFolderName(""); }}><X className="h-3 w-3" /></Button>
        </div>
      )}
      {showNewFile && newFileParentId === null && (
        <div className="mt-1 flex items-center gap-1 pl-1.5">
          <FilePlus className="h-3 w-3 text-muted-foreground" />
          <Input
            id="vault-new-file-root"
            autoFocus
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") createNewFile(null);
              if (e.key === "Escape") { setShowNewFile(false); setNewFileName(""); setNewFileParentId(null); }
            }}
            placeholder="filename.md"
            className="h-6 text-[11px]"
          />
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => createNewFile(null)} disabled={busy}><Plus className="h-3 w-3" /></Button>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => { setShowNewFile(false); setNewFileName(""); setNewFileParentId(null); }}><X className="h-3 w-3" /></Button>
        </div>
      )}
      <div className="mt-1 flex-1 overflow-y-auto">
        {renderFolderTree(null, 0, (i) => {
          if (ownerFilter === "mine") return i.uploaded_by === currentUserId;
          if (ownerFilter === "theirs") return i.uploaded_by !== currentUserId;
          return true;
        }, !isLocked && ownerFilter !== "theirs")}
      </div>
    </div>
  ) : null;

  return (
    <>
      <input ref={fileInputRef} type="file" multiple hidden onChange={onFiles} />
      <input
        ref={dirInputRef}
        type="file"
        multiple
        hidden
        // @ts-ignore
        webkitdirectory=""
        directory=""
        onChange={onDir}
      />

      {/* Compact toolbar (view mode + search + sort only — owner filter moved to header) */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border bg-muted/30 p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => setViewMode("folder")}
            className={cn("rounded px-2 py-1", viewMode === "folder" ? "bg-background shadow-sm" : "text-muted-foreground")}
          >
            <Folder className="mr-1 inline h-3 w-3" />Folders
          </button>
          <button
            type="button"
            onClick={() => setViewMode("all")}
            className={cn("rounded px-2 py-1", viewMode === "all" ? "bg-background shadow-sm" : "text-muted-foreground")}
          >
            <LayoutGrid className="mr-1 inline h-3 w-3" />All files
          </button>
        </div>
        {viewMode === "folder" && folders.length > 0 && (
          <div className="inline-flex rounded-md border bg-muted/30 text-[10px]">
            <button
              type="button"
              onClick={expandAll}
              className="rounded px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Expand all folders"
            >
              <ChevronDown className="mr-0.5 inline h-3 w-3" />Expand all
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="rounded px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Collapse all folders"
            >
              <ChevronRight className="mr-0.5 inline h-3 w-3" />Collapse all
            </button>
          </div>
        )}
        {viewMode === "all" && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search files…"
              className="h-7 w-44 pl-7 text-xs"
            />
          </div>
        )}
        {viewMode === "all" && (
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="h-7 rounded-md border bg-background px-2 text-xs">
            <option value="all">All types</option>
            <option value="image">Images</option>
            <option value="video">Videos</option>
            <option value="audio">Audio</option>
            <option value="pdf">PDFs</option>
            <option value="document">Documents</option>
            <option value="code">Code</option>
            <option value="archive">Archives</option>
            <option value="other">Other</option>
          </select>
        )}
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="h-7 rounded-md border bg-background px-2 text-xs" title="Sort by">
          <option value="date">Newest first</option>
          <option value="name">Name (A→Z)</option>
          <option value="size">Largest first</option>
          <option value="type">By type</option>
        </select>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">{error}</div>
      )}

      <div className="flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-1.5 text-[10px] text-emerald-700">
        <ShieldCheck className="h-3 w-3 shrink-0" />
        <span>Workspace vault is being monitored. All uploads, downloads, and file operations are recorded.</span>
      </div>

      {/* Fire vault OR working area */}
      {isLocked && !escrowFunded ? (
        <FireVaultLock
          incentiveAmountPaise={incentiveAmountPaise}
          isBuyer={!!isBuyer}
          onFundClick={onFundClick}
        />
      ) : (
        <div
          className={cn("space-y-3", isDragging && "ring-2 ring-primary ring-offset-2 ring-offset-background rounded-lg")}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {viewMode === "folder" ? (
            <div className="grid gap-3 md:grid-cols-[200px_1fr]">
              {explorer}
              {fileGrid}
            </div>
          ) : (
            fileGrid
          )}
        </div>
      )}

      <DeleteVaultItemDialog
        open={!!deleteTarget}
        onClose={() => { setDeleteTarget(null); setDeletePreview(null); }}
        onConfirm={confirmDelete}
        item={deleteTarget}
        preview={deletePreview}
        previewLoading={deleteLoading}
      />

      {previewItem && (
        <VaultPreviewModal
          item={previewItem}
          workspaceId={workspaceId}
          onClose={() => setPreviewItem(null)}
        />
      )}
    </>
  );
}

function Breadcrumb({
  currentFolder, folders, onNavigate,
}: {
  currentFolder: string;
  folders: VaultItem[];
  onNavigate: (id: string | null) => void;
}) {
  const chain: VaultItem[] = [];
  let cur = folders.find((f) => f.id === currentFolder);
  while (cur) {
    chain.unshift(cur);
    cur = cur.parent_id ? folders.find((f) => f.id === cur!.parent_id) : undefined;
  }
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1 rounded-md border bg-muted/20 px-2 py-1.5 text-xs">
      <button
        type="button"
        onClick={() => onNavigate(null)}
        className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
      >
        <Folder className="mr-1 inline h-3 w-3" />Root
      </button>
      {chain.map((f, i) => (
        <React.Fragment key={f.id}>
          <ChevronRight className="h-3 w-3 text-muted-foreground/60" />
          <button
            type="button"
            onClick={() => onNavigate(f.id)}
            className={cn(
              "rounded px-1.5 py-0.5 hover:bg-background",
              i === chain.length - 1 ? "bg-background font-semibold text-foreground" : "text-muted-foreground",
            )}
          >
            {f.name}
          </button>
        </React.Fragment>
      ))}
      <span className="ml-auto text-[10px] text-muted-foreground">
        Drop files here → goes into <strong className="text-foreground">{chain[chain.length - 1]?.name ?? "Root"}</strong>
      </span>
    </div>
  );
}

function DropZone({
  currentFolder, onPickFile, onPickFolder, onCreateNewFile, onCreateNewFolder,
  isDragging, searchActive, viewMode, ownerFilter, isLocked,
}: {
  currentFolder: string | null;
  onPickFile: () => void;
  onPickFolder: () => void;
  onCreateNewFile: () => void;
  onCreateNewFolder: () => void;
  isDragging: boolean;
  searchActive: boolean;
  viewMode: "folder" | "all";
  ownerFilter: "all" | "mine" | "theirs";
  isLocked: boolean;
}) {
  if (searchActive || ownerFilter !== "all" || viewMode === "all") {
    return (
      <p className="rounded-md border border-dashed bg-muted/20 py-12 text-center text-xs text-muted-foreground">
        No files match your filter. Try clearing search or owner filter.
      </p>
    );
  }
  return (
    <div
      className={cn(
        "relative min-h-[280px] rounded-md border-2 border-dashed bg-muted/20 p-8 text-center transition-colors",
        isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/30",
        isLocked && "opacity-60",
      )}
    >
      <Upload className="mx-auto h-10 w-10 text-muted-foreground/60" />
      <p className="mt-3 text-sm font-medium text-foreground">
        {currentFolder ? "Drop files here or use the + button" : "Drop files or folders here to upload"}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        PDFs, images, videos, code — all preserved with full folder structure
      </p>
      {!isLocked && (
        <button
          type="button"
          onClick={onPickFile}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
        >
          <Upload className="h-3 w-3" />Browse files
        </button>
      )}
    </div>
  );
}

function FireVaultLock({
  incentiveAmountPaise, isBuyer, onFundClick,
}: {
  incentiveAmountPaise: number | null;
  isBuyer: boolean;
  onFundClick?: () => void;
}) {
  return (
    <div className="relative min-h-[300px] overflow-hidden rounded-lg border-2 border-dashed border-rose-300/60 bg-gradient-to-br from-rose-50 via-amber-50 to-rose-50 p-8 text-center">
      <div className="pointer-events-none absolute inset-0 opacity-30">
        <div className="absolute -top-6 left-1/2 h-12 w-12 -translate-x-1/2 rounded-full bg-rose-400 blur-2xl" />
        <div className="absolute bottom-2 right-1/4 h-8 w-8 rounded-full bg-amber-400 blur-2xl" />
        <div className="absolute top-1/3 left-1/4 h-10 w-10 rounded-full bg-orange-400 blur-2xl" />
      </div>
      <div className="relative">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-rose-100 text-rose-600">
          <Flame className="h-8 w-8" />
        </div>
        <h3 className="mt-3 font-display text-lg font-semibold text-rose-900">Vault is fire-locked</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-rose-800/80">
          {isBuyer
            ? "Fund the escrow to open the chat panel and the workspace vault. Until then, the employee cannot start work."
            : "Waiting for the buyer to fund the escrow. Once funded you'll be able to share files and start the work."}
        </p>
        {incentiveAmountPaise && incentiveAmountPaise > 0 && (
          <div className="mx-auto mt-3 inline-flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-100/60 px-3 py-2 text-left text-[11px] text-amber-900">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>
              <strong>Tip / incentive:</strong> once escrow is funded, a bonus of{" "}
              <strong>{formatPaise(incentiveAmountPaise)}</strong> will be credited to the
              employee&apos;s wallet if the agreed criteria are fulfilled.
            </div>
          </div>
        )}
        <div className="mx-auto mt-5 flex flex-wrap items-center justify-center gap-2">
          {isBuyer && onFundClick ? (
            <>
              <Button size="sm" variant="gradient" onClick={onFundClick}>
                <Wallet className="h-3.5 w-3.5" />Add funds from wallet
              </Button>
              <Button size="sm" variant="outline" onClick={onFundClick}>
                <ShieldCheck className="h-3.5 w-3.5" />Pay with Razorpay
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" disabled>
              <Lock className="h-3.5 w-3.5" />Waiting for buyer to fund
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
