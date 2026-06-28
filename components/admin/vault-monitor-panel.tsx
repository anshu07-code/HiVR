"use client";

import * as React from "react";
import Link from "next/link";
import { Eye, Upload, Download, FolderInput, Trash2, Share2, Star, Edit, Loader2, X, Folder, FileText } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { timeAgo } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Event = {
  id: string;
  workspace_id: string;
  vault_item_id: string | null;
  actor_id: string | null;
  actor_name: string | null;
  event: string;
  file_name: string | null;
  file_size: number | null;
  metadata: any;
  created_at: string;
};

const EVENT_META: Record<string, { icon: any; label: string; tone: string }> = {
  upload:            { icon: Upload,    label: "uploaded",    tone: "text-emerald-600" },
  download:          { icon: Download,  label: "downloaded",  tone: "text-sky-600" },
  view:              { icon: Eye,       label: "viewed",      tone: "text-muted-foreground" },
  delete:            { icon: Trash2,    label: "deleted",     tone: "text-rose-600" },
  restore:           { icon: FolderInput, label: "restored", tone: "text-emerald-600" },
  folder_create:     { icon: FolderInput, label: "created folder", tone: "text-violet-600" },
  folder_rename:     { icon: Edit,     label: "renamed",     tone: "text-amber-600" },
  folder_delete:     { icon: Trash2,   label: "deleted folder", tone: "text-rose-600" },
  share_create:      { icon: Share2,    label: "shared",      tone: "text-sky-600" },
  share_revoke:      { icon: Share2,    label: "revoked share", tone: "text-muted-foreground" },
  star:              { icon: Star,      label: "starred",     tone: "text-amber-500" },
  unstar:            { icon: Star,      label: "unstarred",   tone: "text-muted-foreground" },
  rename:            { icon: Edit,     label: "renamed",     tone: "text-amber-600" },
};

export function VaultMonitorPanel() {
  const sbRef = React.useRef<ReturnType<typeof createClient> | null>(null);
  const [events, setEvents] = React.useState<Event[]>([]);
  const [tick, setTick] = React.useState(0);
  const [filter, setFilter] = React.useState<"all" | "upload" | "download" | "delete" | "share">("all");
  const [connection, setConnection] = React.useState<"online" | "offline" | "connecting">("connecting");

  React.useEffect(() => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const load = async () => {
      let q = sb
        .from("vault_event_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (filter !== "all") {
        if (filter === "share") q = q.in("event", ["share_create", "share_revoke"]);
        else q = q.eq("event", filter);
      }
      const { data } = await q;
      setEvents((data ?? []) as Event[]);
    };
    load();
    const channel = sb
      .channel("vault-events-monitor")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "vault_event_log" },
        () => load())
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setConnection("online");
        if (status === "CLOSED" || status === "CHANNEL_ERROR") setConnection("offline");
      });
    return () => { sb.removeChannel(channel); };
  }, [filter]);

  // Re-render every 30s for "X seconds ago" freshness
  React.useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  void tick;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Eye className="h-4 w-4 text-primary" />Vault activity monitor
          </CardTitle>
          <CardDescription className="text-[11px]">
            Every upload, download, view, delete, share, and folder action across all workspace vaults.
            Updates in real time.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={connection === "online" ? "success" : connection === "offline" ? "destructive" : "secondary"} className="gap-1 text-[10px]">
            {connection === "online" && <><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Live</>}
            {connection === "connecting" && <><Loader2 className="h-3 w-3 animate-spin" />Connecting…</>}
            {connection === "offline" && <><X className="h-3 w-3" />Reconnecting</>}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Filter chips */}
        <div className="flex flex-wrap gap-1 text-[10px]">
          {(["all", "upload", "download", "delete", "share"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full border px-2.5 py-1 capitalize transition-colors",
                filter === f ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/30"
              )}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Event list */}
        {events.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            No vault activity yet.
          </p>
        ) : (
          <div className="max-h-[60vh] space-y-1 overflow-y-auto rounded-md border bg-muted/10 p-1.5">
            {events.map((e) => {
              const meta = EVENT_META[e.event] ?? EVENT_META.view;
              const Icon = meta.icon;
              return (
                <Link
                  key={e.id}
                  href={`/admin/monitor/${e.workspace_id}`}
                  className="flex items-center gap-2 rounded-md border bg-background p-2 transition-colors hover:bg-muted/40"
                >
                  <Icon className={cn("h-3.5 w-3.5 shrink-0", meta.tone)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px]">
                      <span className="font-semibold">{e.actor_name ?? e.actor_id?.slice(0, 6) ?? "Someone"}</span>{" "}
                      <span className="text-muted-foreground">{meta.label}</span>{" "}
                      <span className="font-medium">{e.file_name ?? "—"}</span>
                    </p>
                    <p className="text-[9px] text-muted-foreground">
                      {timeAgo(e.created_at)} · {e.file_size ? `${(e.file_size / 1024).toFixed(1)} KB` : ""}
                      {e.metadata?.file_count ? ` · ${e.metadata.file_count} files` : ""}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
