"use client";

import * as React from "react";
import Link from "next/link";
import {
  Eye, Upload, Download, FolderInput, Trash2, Share2, Star, Edit2,
  Loader2, X, Folder, FileText, Wallet, CheckCircle2, AlertTriangle,
  RefreshCw, Lock, Play, ChevronRight, ChevronDown, FileImage, Film,
  Music, FileCode, FileArchive, User, ExternalLink, Search, LayoutGrid,
  Handshake, Activity,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { timeAgo, cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

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
  file_type: string;
  uploaded_by: string;
  view_count: number;
  review_status: string;
  created_at: string;
};

type WorkspaceInfo = {
  id: string;
  status: string;
  buyer_name: string | null;
  employee_name: string | null;
  file_count: number;
  folder_count: number;
};

type SharedFile = {
  vault_resource_id: string;
  count: number;
};

const FILE_ICON: Record<string, any> = {
  image: FileImage, video: Film, audio: Music,
  pdf: FileText, document: FileText, code: FileCode,
  archive: FileArchive, folder: Folder, other: FileText,
};

const FILE_COLOR: Record<string, string> = {
  image: "text-pink-500", video: "text-violet-500", audio: "text-emerald-500",
  pdf: "text-rose-500", document: "text-sky-500", code: "text-amber-500",
  archive: "text-zinc-500", folder: "text-amber-500", other: "text-muted-foreground",
};

const VIEW_MODE_KEY = "admin-vault-view-mode";
const ACTIVE_WS_KEY = "admin-vault-active-ws";

export function VaultMonitorPanel() {
  const sbRef = React.useRef<ReturnType<typeof createClient> | null>(null);
  const [workspaces, setWorkspaces] = React.useState<WorkspaceInfo[]>([]);
  const [activeWsId, setActiveWsId] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<VaultItem[]>([]);
  const [sharedIds, setSharedIds] = React.useState<Set<string>>(new Set());
  const [loading, setLoading] = React.useState(true);
  const [currentFolder, setCurrentFolder] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [search, setSearch] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState<string>("all");
  const [viewMode, setViewMode] = React.useState<"folder" | "grid">(
    () => (typeof window !== "undefined" && (localStorage.getItem(VIEW_MODE_KEY) as "folder" | "grid")) || "grid"
  );
  const [activeTab, setActiveTab] = React.useState<"vault" | "activity">("vault");
  const [connection, setConnection] = React.useState<"online" | "offline" | "connecting">("connecting");
  const [uploaderNames, setUploaderNames] = React.useState<Record<string, string>>({});
  const [previewItem, setPreviewItem] = React.useState<VaultItem | null>(null);

  // Load workspaces with vault items on mount
  React.useEffect(() => {
    const saved = localStorage.getItem(ACTIVE_WS_KEY);
    loadWorkspaces().then(() => {
      if (saved) setActiveWsId(saved);
    });
  }, []);

  const loadWorkspaces = async () => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const { data: wsData } = await sb
      .from("workspaces")
      .select(`id, status,
        buyer:users!workspaces_buyer_id_fkey(full_name),
        employee:users!workspaces_employee_id_fkey(full_name)`)
      .order("created_at", { ascending: false })
      .limit(200) as any;

    const wsList = (wsData ?? []) as any[];
    const wsWithVault: WorkspaceInfo[] = [];

    for (const w of wsList) {
      const { count } = await sb
        .from("workspace_vault")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", w.id)
        .is("is_folder", false) as any;
      const { count: folderCount } = await sb
        .from("workspace_vault")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", w.id)
        .eq("is_folder", true) as any;
      if ((count ?? 0) > 0 || (folderCount ?? 0) > 0) {
        wsWithVault.push({
          id: w.id,
          status: w.status,
          buyer_name: w.buyer?.full_name ?? "?",
          employee_name: w.employee?.full_name ?? "?",
          file_count: count ?? 0,
          folder_count: folderCount ?? 0,
        });
      }
    }
    setWorkspaces(wsWithVault);
    setLoading(false);
    if (!activeWsId && wsWithVault.length > 0) {
      setActiveWsId(wsWithVault[0].id);
    }
  };

  // Load vault items when active workspace changes
  React.useEffect(() => {
    if (!activeWsId) return;
    localStorage.setItem(ACTIVE_WS_KEY, activeWsId);
    setCurrentFolder(null);
    setExpanded(new Set());
    loadItems(activeWsId);
    loadSharedFiles(activeWsId);
  }, [activeWsId]);

  const loadItems = async (wsId: string) => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const { data } = await sb
      .from("workspace_vault")
      .select("*")
      .eq("workspace_id", wsId)
      .order("is_folder", { ascending: false })
      .order("name", { ascending: true }) as any;
    setItems(data ?? []);
  };

  const loadSharedFiles = async (wsId: string) => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const { data: msgs } = await sb
      .from("workspace_messages")
      .select("vault_resource_id")
      .eq("workspace_id", wsId)
      .not("vault_resource_id", "is", null) as any;
    const ids = new Set<string>((msgs ?? []).map((m: any) => m.vault_resource_id).filter(Boolean));
    setSharedIds(ids);
  };

  // Load uploader names
  React.useEffect(() => {
    const ids = Array.from(new Set(items.map(i => i.uploaded_by).filter(Boolean)));
    if (ids.length === 0) return;
    const missing = ids.filter(id => !uploaderNames[id]);
    if (missing.length === 0) return;
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    sb.from("users").select("id, full_name").in("id", missing).then(({ data }: any) => {
      const next: Record<string, string> = {};
      for (const u of data ?? []) next[u.id] = u.full_name ?? "Unknown";
      setUploaderNames(prev => ({ ...prev, ...next }));
    });
  }, [items]);

  const folders = React.useMemo(() => items.filter(i => i.is_folder), [items]);
  const files = React.useMemo(() => items.filter(i => !i.is_folder), [items]);

  const countInFolder = (folderId: string) => {
    const childFolders = folders.filter(f => (f.parent_id ?? null) === folderId).length;
    const childFiles = files.filter(f => (f.parent_id ?? null) === folderId).length;
    return { folders: childFolders, files: childFiles };
  };

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set<string>(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const filtered = React.useMemo(() => {
    let list = currentFolder
      ? items.filter(i => (i.parent_id ?? null) === currentFolder)
      : items.filter(i => i.parent_id === null);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i => (i.original_name ?? i.name).toLowerCase().includes(q));
    }
    if (typeFilter !== "all") {
      list = list.filter(i => i.is_folder || i.file_type === typeFilter);
    }
    return list;
  }, [items, currentFolder, search, typeFilter]);

  const breadcrumbs = React.useMemo(() => {
    const crumbs: { id: string | null; name: string }[] = [];
    crumbs.push({ id: null, name: "Root" });
    if (currentFolder) {
      const chain: VaultItem[] = [];
      let cursor = folders.find(f => f.id === currentFolder);
      while (cursor) {
        chain.unshift(cursor);
        cursor = cursor.parent_id ? folders.find(f => f.id === cursor!.parent_id) : undefined;
      }
      for (const f of chain) crumbs.push({ id: f.id, name: f.original_name ?? f.name });
    }
    return crumbs;
  }, [currentFolder, folders]);

  // Render folder tree (recursive)
  const renderFolderTree = (parentId: string | null, depth: number) => {
    const childFolders = folders.filter(f => (f.parent_id ?? null) === parentId);
    const childFiles = files.filter(f => (f.parent_id ?? null) === parentId);
    const combined = [...childFolders, ...childFiles];
    if (combined.length === 0) return null;
    return combined.map(item => {
      if (item.is_folder) {
        const isOpen = expanded.has(item.id);
        const isCurrent = currentFolder === item.id;
        const counts = countInFolder(item.id);
        return (
          <div key={item.id}>
            <div
              className={cn(
                "group flex items-center gap-1 rounded px-1 py-1 text-sm transition-colors",
                isCurrent ? "bg-muted font-medium" : "hover:bg-muted/60",
              )}
              style={{ paddingLeft: depth * 14 + 4 }}
            >
              <button type="button" onClick={() => toggleExpand(item.id)}
                className="grid h-4 w-4 shrink-0 place-items-center text-muted-foreground"
              >
                {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
              <button type="button" onClick={() => { setCurrentFolder(item.id); setExpanded(prev => new Set<string>(prev).add(item.id)); }}
                className="flex flex-1 items-center gap-1.5 truncate text-left"
              >
                <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                <span className="truncate text-xs">{item.original_name ?? item.name}</span>
                {(counts.files > 0 || counts.folders > 0) && (
                  <span className="shrink-0 rounded bg-muted/60 px-1 text-[9px] text-muted-foreground">
                    {counts.files > 0 && `${counts.files} file${counts.files === 1 ? "" : "s"}`}
                    {counts.files > 0 && counts.folders > 0 && " · "}
                    {counts.folders > 0 && `${counts.folders} folder${counts.folders === 1 ? "" : "s"}`}
                  </span>
                )}
              </button>
            </div>
            {isOpen && renderFolderTree(item.id, depth + 1)}
          </div>
        );
      }
      const FileIcon = FILE_ICON[item.file_type ?? "other"] ?? FileText;
      const color = FILE_COLOR[item.file_type ?? "other"] ?? "text-muted-foreground";
      const isShared = sharedIds.has(item.id);
      return (
        <div key={item.id} style={{ paddingLeft: depth * 14 + 4 + 16 }}>
          <button type="button" onClick={() => setPreviewItem(item)}
            className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs hover:bg-muted/50 group/file"
          >
            <FileIcon className={cn("h-3 w-3 shrink-0", color)} />
            <span className="truncate text-muted-foreground group-hover/file:text-foreground">
              {item.original_name ?? item.name}
            </span>
            {isShared && <Share2 className="ml-auto h-2.5 w-2.5 shrink-0 text-sky-500" />}
          </button>
        </div>
      );
    });
  };

  // Render file card (grid mode)
  const renderItem = (item: VaultItem) => {
    const Icon = FILE_ICON[item.file_type ?? "other"] ?? FileText;
    const color = FILE_COLOR[item.file_type ?? "other"] ?? "text-muted-foreground";
    const uploaderName = uploaderNames[item.uploaded_by] ?? "—";
    const isShared = sharedIds.has(item.id);
    return (
      <div key={item.id} className={cn(
        "group relative flex flex-col rounded-md border bg-background p-2 transition-colors hover:border-primary/50",
        isShared && "border-sky-300",
      )}>
        {isShared && (
          <div className="absolute right-1.5 top-1.5 z-10 rounded-full bg-sky-500 p-0.5 text-white shadow">
            <Share2 className="h-2.5 w-2.5" />
          </div>
        )}
        <button type="button" onClick={() => {
          if (item.is_folder) { setCurrentFolder(item.id); return; }
          setPreviewItem(item);
        }} className="flex flex-col items-stretch text-left">
          <div className="grid h-20 place-items-center rounded bg-muted/30">
            {item.is_folder
              ? <Folder className={cn("h-8 w-8", color)} />
              : <Icon className={cn("h-8 w-8", color)} />
            }
          </div>
          <p className="mt-1.5 line-clamp-2 text-xs font-medium" title={item.original_name ?? item.name}>
            {item.original_name ?? item.name}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {item.file_size ? `${(item.file_size / 1024).toFixed(0)} KB` : item.is_folder ? "folder" : "—"}
            {item.view_count > 0 && <> · {item.view_count} views</>}
          </p>
          <p className="mt-0.5 inline-flex items-center gap-0.5 text-[9px] text-muted-foreground">
            <User className="h-2.5 w-2.5" />
            <span className="truncate">{uploaderName}</span>
          </p>
        </button>
        <div className="mt-1.5">
          {item.review_status && item.review_status !== "pending" && (
            <Badge variant={item.review_status === "approved" ? "success" : "destructive"} className="w-full text-[9px]">
              {item.review_status}
            </Badge>
          )}
        </div>
      </div>
    );
  };

  const activeWs = workspaces.find(w => w.id === activeWsId);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Folder className="h-4 w-4 text-primary" />Vault monitor
          </CardTitle>
          <CardDescription className="text-[11px]">
            Browse all workspace vault files and folders. <span className="font-semibold text-sky-600">Blue </span>
            <Share2 className="inline h-2.5 w-2.5 text-sky-500" /> = shared via chat.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {/* Tab toggle */}
          <div className="flex items-center rounded-md border bg-muted/30 p-0.5 text-[10px]">
            <button
              type="button"
              onClick={() => setActiveTab("vault")}
              className={cn("flex items-center gap-1 rounded px-2 py-1", activeTab === "vault" && "bg-background shadow-sm")}
            >
              <Folder className="h-3 w-3" />Vault
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("activity")}
              className={cn("flex items-center gap-1 rounded px-2 py-1", activeTab === "activity" && "bg-background shadow-sm")}
            >
              <Activity className="h-3 w-3" />Activity
            </button>
          </div>
          <Badge variant={connection === "online" ? "success" : connection === "offline" ? "destructive" : "secondary"} className="gap-1 text-[10px]">
            {connection === "online" && <><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Live</>}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        {activeTab === "activity" ? (
          /* ── Activity view ── */
          <ActivityView />
        ) : loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : workspaces.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            No workspaces with vault files found.
          </p>
        ) : (
          /* ── Vault browser ── */
          <>
            {/* Workspace selector */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-medium text-muted-foreground">Workspace:</span>
              <select
                value={activeWsId ?? ""}
                onChange={(e) => { setActiveWsId(e.target.value || null); }}
                className="h-7 rounded-md border bg-background px-2 text-xs outline-none"
              >
                {workspaces.map(w => (
                  <option key={w.id} value={w.id}>
                    {w.buyer_name} ↔ {w.employee_name} ({w.file_count} files, {w.folder_count} folders)
                  </option>
                ))}
              </select>
              {activeWs && (
                <>
                  <Badge variant="outline" className="text-[9px]">{activeWs.status}</Badge>
                  <Link href={`/admin/monitor/${activeWs.id}`} className="ml-auto">
                    <Button size="sm" variant="ghost" className="h-6 text-[10px]">
                      <ExternalLink className="h-3 w-3" />Chat
                    </Button>
                  </Link>
                </>
              )}
            </div>

            {activeWsId && items.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">This workspace vault is empty.</p>
            ) : activeWsId ? (
              <div className="flex gap-3">
                {/* Explorer sidebar */}
                <div className="hidden w-56 shrink-0 flex-col rounded-md border bg-card p-2 md:flex">
                  <div className="flex items-center justify-between border-b pb-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <Folder className="mr-1 inline h-3 w-3" />Explorer
                    </p>
                    <button type="button" onClick={() => setCurrentFolder(null)}
                      className="text-[9px] text-muted-foreground hover:text-foreground"
                    >
                      Root
                    </button>
                  </div>
                  <div className="mt-1 max-h-[400px] overflow-y-auto">
                    {renderFolderTree(null, 0)}
                  </div>
                </div>

                {/* Main area */}
                <div className="min-w-0 flex-1">
                  {/* Breadcrumb + toolbar */}
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    {breadcrumbs.map((crumb, i) => (
                      <React.Fragment key={crumb.id ?? "root"}>
                        {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                        <button
                          type="button"
                          onClick={() => { setCurrentFolder(crumb.id); }}
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[10px] transition-colors",
                            i === breadcrumbs.length - 1 ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted"
                          )}
                        >
                          {crumb.name}
                        </button>
                      </React.Fragment>
                    ))}
                    <div className="ml-auto flex items-center gap-1">
                      <div className="relative">
                        <Search className="absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Filter…"
                          className="h-6 w-24 pl-5 text-[10px]"
                        />
                      </div>
                      <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                        className="h-6 rounded border bg-background px-1 text-[10px] outline-none"
                      >
                        <option value="all">All</option>
                        {["image", "video", "audio", "pdf", "document", "code", "archive"].map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setViewMode(prev => prev === "grid" ? "folder" : "grid")}
                        className="rounded border p-1 text-muted-foreground hover:bg-muted"
                        title={viewMode === "grid" ? "Tree view" : "Grid view"}
                      >
                        <LayoutGrid className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  {/* File grid/tree */}
                  {filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-12 text-xs text-muted-foreground">
                      <Folder className="mb-2 h-8 w-8 text-muted-foreground/40" />
                      {search || typeFilter !== "all" ? "No matching files." : "This folder is empty."}
                    </div>
                  ) : viewMode === "grid" ? (
                    <div className="max-h-[500px] overflow-y-auto rounded-md border bg-card p-2">
                      <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                        {filtered.map(renderItem)}
                      </div>
                    </div>
                  ) : (
                    <div className="max-h-[500px] overflow-y-auto rounded-md border bg-card p-2">
                      {renderFolderTree(currentFolder, 0)}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </>
        )}
      </CardContent>

      {/* Preview modal */}
      {previewItem && !previewItem.is_folder && (
        <VaultPreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />
      )}
    </Card>
  );
}

/* ── Inline vault preview modal ── */
function VaultPreviewModal({ item, onClose }: { item: VaultItem; onClose: () => void }) {
  const [signedUrl, setSignedUrl] = React.useState<string | null>(null);
  const [loadState, setLoadState] = React.useState<"loading" | "ready" | "missing" | "error">("loading");

  React.useEffect(() => {
    if (!item.storage_object_id) {
      setLoadState("missing");
      return;
    }
    fetch("/api/workspace/vault/sign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vaultId: item.id }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.ok && d.url) { setSignedUrl(d.url); setLoadState("ready"); }
        else setLoadState("error");
      })
      .catch(() => setLoadState("error"));
  }, [item.id, item.storage_object_id]);

  const isImage = item.file_type === "image";
  const isVideo = item.file_type === "video";
  const isAudio = item.file_type === "audio";
  const isPdf = item.file_type === "pdf";
  const isText = ["code", "document"].includes(item.file_type ?? "");

  let preview: React.ReactNode = null;

  if (loadState === "loading") {
    preview = (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  } else if (loadState === "missing") {
    preview = (
      <div className="flex flex-col items-center gap-2 py-16">
        <FileText className="h-12 w-12 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">Placeholder file — no content uploaded yet</p>
      </div>
    );
  } else if (loadState === "error") {
    preview = (
      <div className="flex flex-col items-center gap-2 py-16">
        <FileText className="h-12 w-12 text-rose-300" />
        <p className="text-sm text-muted-foreground">Could not load file preview</p>
      </div>
    );
  } else if (signedUrl) {
    if (isImage) {
      preview = <img src={signedUrl} alt={item.name} className="max-h-[70vh] rounded object-contain" />;
    } else if (isVideo) {
      preview = <video src={signedUrl} controls className="max-h-[70vh] max-w-full rounded" />;
    } else if (isAudio) {
      preview = <audio src={signedUrl} controls className="w-full" />;
    } else if (isPdf) {
      preview = (
        <iframe src={`${signedUrl}#view=FitH`} className="h-[70vh] w-full rounded" title={item.name} />
      );
    } else if (isText) {
      preview = <TextPreview url={signedUrl} />;
    } else {
      preview = (
        <div className="flex flex-col items-center gap-2 py-8">
          <FileText className="h-10 w-10 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Preview not available for this file type.</p>
        </div>
      );
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="relative max-h-[90vh] max-w-[90vw] overflow-auto rounded-lg bg-background p-4 shadow-xl" onClick={e => e.stopPropagation()}>
        <button type="button" onClick={onClose}
          className="absolute right-2 top-2 rounded-full bg-muted p-1 hover:bg-muted-foreground/20"
        >
          <X className="h-4 w-4" />
        </button>
        <p className="mb-2 pr-8 text-xs font-semibold">{item.original_name ?? item.name}</p>
        {preview}
        <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
          <span>{item.file_size ? `${(item.file_size / 1024).toFixed(0)} KB` : "—"}</span>
          <span>{item.mime_type ?? item.file_type}</span>
        </div>
      </div>
    </div>
  );
}

function TextPreview({ url }: { url: string }) {
  const [text, setText] = React.useState<string | null>(null);
  const [error, setError] = React.useState(false);
  React.useEffect(() => {
    fetch(url)
      .then(r => {
        const ct = r.headers.get("content-type") || "";
        if (!ct.startsWith("text/") && !ct.includes("json") && !ct.includes("octet-stream")) {
          setError(true);
          return "";
        }
        return r.text();
      })
      .then(t => setText(t ? t.slice(0, 100_000) : "(empty)"))
      .catch(() => setError(true));
  }, [url]);
  if (error) return <p className="py-8 text-center text-xs text-muted-foreground">Could not load text preview.</p>;
  return (
    <pre className="max-h-[60vh] overflow-auto rounded bg-muted p-3 text-[11px]">
      {text ?? "Loading…"}
    </pre>
  );
}

/* ── Activity view (replaces the old vault_event_log + workspace_events timeline) ── */
function ActivityView() {
  const sbRef = React.useRef<ReturnType<typeof createClient> | null>(null);
  const [events, setEvents] = React.useState<any[]>([]);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const load = React.useCallback(async () => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;

    const [vaultRes, wsEventRes] = await Promise.all([
      sb.from("vault_event_log").select("*").order("created_at", { ascending: false }).limit(50) as any,
      sb.from("workspace_events").select("*").order("created_at", { ascending: false }).limit(50) as any,
    ]);

    const vaultEvents = ((vaultRes.data ?? []) as any[]).map((e: any) => ({
      uid: `v-${e.id}`, workspace_id: e.workspace_id, event_type: e.event,
      label: e.event, file_name: e.file_name, file_size: e.file_size,
      metadata: e.metadata, created_at: e.created_at, source: "vault" as const,
    }));

    const wsEvents = ((wsEventRes.data ?? []) as any[]).map((e: any) => ({
      uid: `ws-${e.id}`, workspace_id: e.workspace_id, event_type: e.kind,
      label: e.kind, file_name: null, file_size: null,
      metadata: e.payload, created_at: e.created_at, source: "workspace" as const,
    }));

    const merged = [...vaultEvents, ...wsEvents];
    merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setEvents(merged.slice(0, 100));
  }, []);

  React.useEffect(() => {
    load();
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const channel = sb
      .channel("vault-activity-tab")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "vault_event_log" }, () => load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "workspace_events" }, () => load())
      .subscribe(() => {});
    return () => { sb.removeChannel(channel); };
  }, [load]);

  void tick;

  if (events.length === 0) {
    return (
      <p className="py-8 text-center text-xs text-muted-foreground">
        No activity yet. Vault file operations and workspace events will appear here.
      </p>
    );
  }

  return (
    <div className="max-h-[60vh] space-y-1 overflow-y-auto rounded-md border bg-muted/10 p-1.5">
      {events.map((e) => (
        <Link
          key={e.uid}
          href={`/admin/monitor/${e.workspace_id}`}
          className="flex items-center gap-2 rounded-md border bg-background p-2 transition-colors hover:bg-muted/40"
        >
          {e.source === "workspace" && (
            <span className="mr-1 rounded bg-muted px-1 text-[8px] uppercase text-muted-foreground">WS</span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px]">
              <span className="font-semibold capitalize">{e.label}</span>
              {e.file_name && <span className="text-muted-foreground"> — {e.file_name}</span>}
              {e.event_type === "escrow_funded" && e.metadata?.amount_paise && (
                <span className="text-muted-foreground"> — ₹{((e.metadata.amount_paise as number) / 100).toLocaleString()}</span>
              )}
            </p>
            <p className="text-[9px] text-muted-foreground">
              {timeAgo(e.created_at)}
              {e.file_size ? ` · ${(e.file_size / 1024).toFixed(1)} KB` : ""}
              {e.metadata?.file_count ? ` · ${e.metadata.file_count} files` : ""}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
