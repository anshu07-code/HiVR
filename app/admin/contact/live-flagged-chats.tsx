"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Eye, Loader2, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

type Flagged = {
  id: number;
  workspace_id: string;
  sender_id: string;
  body: string | null;
  is_flagged: boolean;
  is_ghosted: boolean;
  flag_reason: string | null;
  created_at: string;
  sender_name?: string | null;
  workspace_label?: string | null;
};

export function LiveFlaggedChats() {
  const [items, setItems] = React.useState<Flagged[]>([]);
  const [freezing, setFreezing] = React.useState<string | null>(null);
  const sbRef = React.useRef<ReturnType<typeof createClient> | null>(null);

  const load = React.useCallback(async () => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const { data, error } = await sb
      .from("workspace_messages")
      .select("id, workspace_id, sender_id, body, is_flagged, is_ghosted, flag_reason, created_at, sender:users!workspace_messages_sender_id_fkey(full_name)")
      .eq("is_flagged", true)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return;
    const list = (data ?? []) as any[];
    setItems(list.map((m) => ({
      ...m,
      sender_name: m.sender?.full_name ?? null,
    })));
  }, []);

  React.useEffect(() => {
    load();
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const channel = sb
      .channel("admin-live-flagged")
      .on("postgres_changes", { event: "*", schema: "public", table: "workspace_messages" }, () => load())
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [load]);

  const freeze = async (workspaceId: string, reason: string) => {
    setFreezing(workspaceId);
    try {
      if (!sbRef.current) sbRef.current = createClient();
      const sb = sbRef.current;
      const r = await sb.rpc("freeze_workspace" as any, {
        p_workspace_id: workspaceId,
        p_reason: reason,
      } as any);
      const data = r as any;
      if (!r.error && (!data || data.ok !== false)) {
        setItems((prev) => prev.filter((i) => i.workspace_id !== workspaceId));
      } else {
        alert(data?.error ?? r.error?.message ?? "Failed");
      }
    } finally {
      setFreezing(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-rose-600">
          <AlertTriangle className="h-4 w-4" />Live flagged chats
        </CardTitle>
        <CardDescription>Real-time feed of messages blocked by the ghost-block detector. Click to freeze the workspace.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No flagged messages. 🎉</p>
        ) : (
          items.map((m) => (
            <div key={m.id} className="rounded-lg border border-rose-200 bg-rose-50/50 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-semibold">{m.sender_name ?? "Anonymous"}</span>
                    <Badge variant="outline" className="text-[10px]">Workspace chat</Badge>
                    {m.is_ghosted && <Badge variant="destructive" className="text-[10px]">ghosted</Badge>}
                    <span className="text-[10px] text-muted-foreground">{timeAgo(m.created_at)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 rounded bg-background/60 px-2 py-1 text-xs text-muted-foreground">{m.body ?? "(no body)"}</p>
                  {m.flag_reason && (
                    <p className="mt-1 text-[10px] text-rose-700">Pattern: {m.flag_reason}</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/dashboard/workspaces/${m.workspace_id}`}>
                      <Eye className="h-3 w-3" />View
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={freezing === m.workspace_id}
                    onClick={() => {
                      const reason = window.prompt("Reason to freeze this workspace:", m.flag_reason ?? "Suspicious content");
                      if (reason) freeze(m.workspace_id, reason);
                    }}
                  >
                    {freezing === m.workspace_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Lock className="h-3 w-3" />}
                    Freeze
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
