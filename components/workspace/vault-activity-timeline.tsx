"use client";

import * as React from "react";
import {
  Upload, Download, Eye, Trash2, FolderPlus, FilePlus,
  Share2, Star, Edit2, FolderX, FileX, Link2Off, Loader2, Activity, Filter,
  ShieldAlert, Send, RefreshCw, CheckCircle2, Lock, Gift, FileText, MessageSquare, History,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

/**
 * Unified activity timeline for the workspace.
 *
 * Merges two event sources:
 *   1. vault_event_log  — file/folder activity (upload, download, delete…)
 *   2. workspace_events — workspace-level events (escrow_funded, delivered,
 *                          completed, frozen, ghost_block, incentive_earned…)
 *
 * Both feeds come in via Supabase Realtime; the merged list is sorted by
 * created_at desc. Items from the same row across both tables can co-exist.
 */

type VaultEvent = {
  id: string;
  workspace_id: string;
  vault_item_id: string | null;
  actor_id: string | null;
  actor_name: string | null;
  event: "upload" | "download" | "view" | "delete" | "restore"
       | "folder_create" | "folder_rename" | "folder_delete"
       | "share_create" | "share_revoke" | "star" | "unstar" | "rename";
  file_name: string | null;
  file_size: number | null;
  metadata: any;
  created_at: string;
  source: "vault";
};

type WorkspaceEvent = {
  id: string;
  workspace_id: string;
  actor_id: string | null;
  kind: string;
  payload: any;
  created_at: string;
  source: "workspace";
};

type TimelineItem = VaultEvent | WorkspaceEvent;

const VAULT_META: Record<string, { icon: any; tone: string; verb: (n: string | null) => string }> = {
  upload:        { icon: Upload,      tone: "text-sky-600 bg-sky-500/10",     verb: (n) => `uploaded ${n ?? "a file"}` },
  download:      { icon: Download,    tone: "text-emerald-600 bg-emerald-500/10", verb: (n) => `downloaded ${n ?? "a file"}` },
  view:          { icon: Eye,         tone: "text-violet-600 bg-violet-500/10",   verb: (n) => `previewed ${n ?? "a file"}` },
  delete:        { icon: FileX,       tone: "text-rose-600 bg-rose-500/10",     verb: (n) => `deleted ${n ?? "a file"}` },
  restore:       { icon: Upload,      tone: "text-emerald-600 bg-emerald-500/10", verb: (n) => `restored ${n ?? "a file"}` },
  folder_create: { icon: FolderPlus,  tone: "text-amber-600 bg-amber-500/10",   verb: (n) => `created folder ${n ?? ""}` },
  folder_rename: { icon: Edit2,       tone: "text-amber-600 bg-amber-500/10",   verb: (n) => `renamed folder to ${n ?? ""}` },
  folder_delete: { icon: FolderX,     tone: "text-rose-600 bg-rose-500/10",     verb: (n) => `deleted folder ${n ?? ""}` },
  share_create:  { icon: Share2,      tone: "text-violet-600 bg-violet-500/10", verb: (n) => `shared ${n ?? "a file"}` },
  share_revoke:  { icon: Link2Off,    tone: "text-muted-foreground bg-muted",   verb: (n) => `revoked share for ${n ?? "a file"}` },
  star:          { icon: Star,        tone: "text-amber-600 bg-amber-500/10",   verb: (n) => `starred ${n ?? "a file"}` },
  unstar:        { icon: Star,        tone: "text-muted-foreground bg-muted",   verb: (n) => `unstarred ${n ?? "a file"}` },
  rename:        { icon: Edit2,       tone: "text-sky-600 bg-sky-500/10",       verb: (n) => `renamed to ${n ?? ""}` },
};

const WS_META: Record<string, { icon: any; tone: string; label: string }> = {
  escrow_funded:       { icon: ShieldAlert, tone: "text-sky-700 bg-sky-500/10",     label: "funded the escrow" },
  delivered:           { icon: Send,        tone: "text-violet-700 bg-violet-500/10", label: "submitted the delivery" },
  revision_requested:  { icon: RefreshCw,   tone: "text-amber-700 bg-amber-500/10",  label: "requested revisions" },
  completed:           { icon: CheckCircle2, tone: "text-emerald-700 bg-emerald-500/10", label: "marked the contract as done" },
  frozen:              { icon: Lock,        tone: "text-rose-700 bg-rose-500/10",     label: "froze the workspace" },
  reopened:            { icon: RefreshCw,   tone: "text-sky-700 bg-sky-500/10",      label: "reopened the workspace" },
  ghost_block:         { icon: ShieldAlert, tone: "text-rose-700 bg-rose-500/10",     label: "auto-blocked a message" },
  incentive_earned:    { icon: Gift,        tone: "text-emerald-700 bg-emerald-500/10", label: "earned an incentive" },
  chat_locked:         { icon: Lock,        tone: "text-rose-700 bg-rose-500/10",     label: "locked the chat" },
  item_reviewed:       { icon: CheckCircle2, tone: "text-emerald-700 bg-emerald-500/10", label: "reviewed a delivery item" },
  item_disputed:       { icon: ShieldAlert, tone: "text-rose-700 bg-rose-500/10",     label: "disputed a delivery item" },
  file_shared:         { icon: Share2,      tone: "text-violet-700 bg-violet-500/10", label: "shared a file" },
};

type FilterKind = "all" | "vault" | "uploads" | "downloads" | "deletes" | "folders" | "shares" | "workspace";

const FILTER_KIND_MAP: Record<FilterKind, (it: TimelineItem) => boolean> = {
  all: () => true,
  vault: (it) => it.source === "vault",
  uploads: (it) => it.source === "vault" && (it as VaultEvent).event === "upload",
  downloads: (it) => it.source === "vault" && ((it as VaultEvent).event === "download" || (it as VaultEvent).event === "view"),
  deletes: (it) => it.source === "vault" && ((it as VaultEvent).event === "delete" || (it as VaultEvent).event === "folder_delete"),
  folders: (it) => it.source === "vault" && ((it as VaultEvent).event === "folder_create" || (it as VaultEvent).event === "folder_rename" || (it as VaultEvent).event === "folder_delete"),
  shares: (it) => it.source === "vault" && ((it as VaultEvent).event === "share_create" || (it as VaultEvent).event === "share_revoke"),
  workspace: (it) => it.source === "workspace",
};

function formatBytes(n: number | null): string {
  if (n === null || n === undefined) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function VaultActivityTimeline({
  workspaceId, currentUserId,
}: {
  workspaceId: string;
  currentUserId: string;
}) {
  const sbRef = React.useRef<ReturnType<typeof createClient> | null>(null);
  const [items, setItems] = React.useState<TimelineItem[]>([]);
  const [actorNames, setActorNames] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<FilterKind>("all");
  const [expanded, setExpanded] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const [vaultRes, wsRes] = await Promise.all([
      sb
        .from("vault_event_log")
        .select("id, workspace_id, vault_item_id, actor_id, actor_name, event, file_name, file_size, metadata, created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(100),
      sb
        .from("workspace_events")
        .select("id, workspace_id, actor_id, kind, payload, created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    const merged: TimelineItem[] = [
      ...((vaultRes.data ?? []) as VaultEvent[]).map((v) => ({ ...v, source: "vault" as const })),
      ...((wsRes.data ?? []) as WorkspaceEvent[]).map((w) => ({ ...w, source: "workspace" as const })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setItems(merged);
    setLoading(false);
  }, [workspaceId]);

  React.useEffect(() => {
    load();
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    // Subscribe to THREE sources in real-time so the timeline updates
    // instantly whenever any event lands:
    //   1. vault_event_log  — file/folder actions (upload, download,
    //                          view, delete, share, star, etc.)
    //   2. workspace_events — workspace-level events (escrow_funded,
    //                          delivered, completed, frozen, etc.)
    //   3. workspaces        — the workspace status itself. When
    //                          status flips to 'delivered' the
    //                          review panel appears; when it flips
    //                          to 'completed' the vault locks. The
    //                          client needs to know.
    // No row filter — client-side filter instead (avoids the
    // Supabase Realtime DELETE-event quirk where the row filter is
    // applied to the empty new record).
    const ch = sb
      .channel(`ws-activity-${workspaceId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "vault_event_log" },
        (payload: any) => {
          if (payload.new?.workspace_id === workspaceId) load();
        })
      .on("postgres_changes",
        { event: "*", schema: "public", table: "workspace_events" },
        (payload: any) => {
          if (payload.new?.workspace_id === workspaceId) load();
        })
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "workspaces" },
        (payload: any) => {
          if (payload.new?.id === workspaceId || payload.old?.id === workspaceId) load();
        })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [workspaceId, load]);

  // Resolve actor names for any item with an actor_id we haven't seen yet
  React.useEffect(() => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const needIds = new Set<string>();
    for (const it of items) {
      const id = (it as any).actor_id as string | null;
      const denorm = (it as any).actor_name as string | null;
      if (!id || actorNames[id] || denorm) continue;
      needIds.add(id);
    }
    if (needIds.size === 0) return;
    sb.from("users").select("id, full_name").in("id", Array.from(needIds)).then(({ data }) => {
      if (!data) return;
      const next: Record<string, string> = {};
      for (const u of data as any[]) next[u.id] = u.full_name ?? "Someone";
      setActorNames((p) => ({ ...p, ...next }));
    });
  }, [items, actorNames]);

  const filtered = React.useMemo(() => items.filter(FILTER_KIND_MAP[filter]), [items, filter]);
  const visible = expanded ? filtered : filtered.slice(0, 12);

  function actorName(it: TimelineItem): string {
    const id = (it as any).actor_id as string | null;
    const denorm = (it as any).actor_name as string | null;
    if (denorm) return denorm;
    if (id === currentUserId) return "You";
    if (id && actorNames[id]) return actorNames[id]!;
    return "Someone";
  }

  return (
    <div className="rounded-md border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-2.5">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-primary" />
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Activity timeline</p>
          <span className="rounded-full bg-muted px-1.5 text-[9px] text-muted-foreground">
            {filtered.length}
          </span>
        </div>
        <div className="inline-flex flex-wrap rounded-md border bg-muted/30 p-0.5 text-[10px]">
          {(["all", "vault", "workspace", "uploads", "downloads", "folders", "deletes"] as FilterKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={cn(
                "rounded px-1.5 py-0.5 capitalize",
                filter === k ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {k}
            </button>
          ))}
        </div>
      </div>
      <div className="max-h-[460px] overflow-y-auto p-2">
        {loading ? (
          <div className="grid place-items-center py-6 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="rounded-md border border-dashed bg-muted/20 py-8 text-center text-[11px] text-muted-foreground">
            <Filter className="mx-auto mb-1.5 h-4 w-4" />
            No activity yet. Uploads, downloads, deliveries, and other events will show up here in real time.
          </p>
        ) : (
          <ol className="relative space-y-1.5 pl-5 before:absolute before:left-1.5 before:top-1 before:bottom-1 before:w-px before:bg-border">
            {visible.map((it) => {
              if (it.source === "vault") {
                const v = it as VaultEvent;
                const meta = VAULT_META[v.event] ?? VAULT_META.upload;
                const Icon = meta.icon;
                return (
                  <li key={`v-${v.id}`} className="relative">
                    <span className={cn(
                      "absolute -left-5 top-1.5 grid h-4 w-4 place-items-center rounded-full ring-2 ring-card",
                      meta.tone
                    )}>
                      <Icon className="h-2.5 w-2.5" />
                    </span>
                    <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[11px]">
                      <span className={cn(
                        "font-semibold",
                        v.actor_id === currentUserId ? "text-emerald-700 dark:text-emerald-400" : "text-foreground"
                      )}>
                        {actorName(v)}
                      </span>
                      <span className="text-muted-foreground">{meta.verb(v.file_name)}</span>
                      {v.file_size !== null && v.file_size > 0 && (
                        <span className="rounded bg-muted px-1 text-[9px] font-mono text-muted-foreground">
                          {formatBytes(v.file_size)}
                        </span>
                      )}
                      {v.metadata?.batch && (
                        <span className="rounded bg-sky-500/10 px-1 text-[9px] text-sky-700">
                          batch · {v.metadata.folders ?? 0} folders · {v.metadata.files ?? 0} files
                        </span>
                      )}
                      <span className="ml-auto text-[9px] text-muted-foreground" title={new Date(v.created_at).toLocaleString()}>
                        {timeAgo(v.created_at)}
                      </span>
                    </div>
                  </li>
                );
              } else {
                const w = it as WorkspaceEvent;
                const meta = WS_META[w.kind] ?? { icon: History, tone: "text-muted-foreground bg-muted", label: w.kind };
                const Icon = meta.icon;
                return (
                  <li key={`w-${w.id}`} className="relative">
                    <span className={cn(
                      "absolute -left-5 top-1.5 grid h-4 w-4 place-items-center rounded-full ring-2 ring-card",
                      meta.tone
                    )}>
                      <Icon className="h-2.5 w-2.5" />
                    </span>
                    <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[11px]">
                      <span className={cn(
                        "font-semibold",
                        w.actor_id === currentUserId ? "text-emerald-700 dark:text-emerald-400" : "text-foreground"
                      )}>
                        {actorName(w)}
                      </span>
                      <span className="text-muted-foreground">{meta.label}</span>
                      {w.kind === "incentive_earned" && w.payload?.amount_paise && (
                        <span className="rounded bg-amber-500/10 px-1 text-[9px] text-amber-700">
                          {formatPaise(w.payload.amount_paise)}
                        </span>
                      )}
                      {w.kind === "ghost_block" && w.payload?.reason && (
                        <span className="rounded bg-rose-500/10 px-1 text-[9px] text-rose-700">
                          {String(w.payload.reason).slice(0, 40)}
                        </span>
                      )}
                      <span className="ml-auto text-[9px] text-muted-foreground" title={new Date(w.created_at).toLocaleString()}>
                        {timeAgo(w.created_at)}
                      </span>
                    </div>
                  </li>
                );
              }
            })}
          </ol>
        )}
      </div>
      {filtered.length > 12 && (
        <div className="border-t p-1.5 text-center">
          <Button size="sm" variant="ghost" className="h-6 w-full text-[10px]" onClick={() => setExpanded((e) => !e)}>
            {expanded ? "Show less" : `Show all ${filtered.length} events`}
          </Button>
        </div>
      )}
    </div>
  );
}
