"use client";

import * as React from "react";
import Link from "next/link";
import { MessageSquare, Loader2, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { timeAgo } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

type PreHiringMsg = {
  id: string;
  task_id: string;
  sender_id: string;
  receiver_id: string;
  body: string;
  created_at: string;
  sender?: { full_name: string | null } | null;
  receiver?: { full_name: string | null } | null;
};

export function RealtimePreHiringChats({ initialData }: { initialData?: PreHiringMsg[] }) {
  const sbRef = React.useRef<ReturnType<typeof createClient> | null>(null);
  const [messages, setMessages] = React.useState<PreHiringMsg[]>(initialData ?? []);
  const [connection, setConnection] = React.useState<"online" | "offline" | "connecting">("connecting");

  React.useEffect(() => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const channel = sb
      .channel("prehiring-realtime")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "task_messages" },
        async () => {
          const { data } = await sb
            .from("task_messages")
            .select("id, task_id, sender_id, receiver_id, body, created_at, sender:users!task_messages_sender_id_fkey(full_name), receiver:users!task_messages_receiver_id_fkey(full_name)")
            .order("created_at", { ascending: false })
            .limit(20) as any;
          if (data) setMessages(data);
        })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setConnection("online");
        if (status === "CLOSED" || status === "CHANNEL_ERROR") setConnection("offline");
      });
    return () => { sb.removeChannel(channel); };
  }, []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-amber-600">
            <MessageSquare className="h-4 w-4" />Pre-hiring chats
          </CardTitle>
          <CardDescription className="text-[11px]">
            Buyer↔applicant direct messages before hiring. Updates in real time.
          </CardDescription>
        </div>
        <Badge variant={connection === "online" ? "success" : connection === "offline" ? "destructive" : "secondary"} className="gap-1 text-[10px]">
          {connection === "online" && <><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Live</>}
          {connection === "connecting" && <><Loader2 className="h-3 w-3 animate-spin" />Connecting…</>}
          {connection === "offline" && <><X className="h-3 w-3" />Reconnecting…</>}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {messages.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No pre-hiring chat activity.</p>
        ) : messages.map((m) => (
          <Link
            key={m.id}
            href={`/admin/tech/chat/${m.task_id}`}
            className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
          >
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-500/10 text-amber-600">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {m.sender?.full_name ?? "?"} → {m.receiver?.full_name ?? "?"}
              </p>
              <p className="truncate text-xs text-muted-foreground">{m.body}</p>
            </div>
            <span className="whitespace-nowrap text-[10px] text-muted-foreground">{timeAgo(m.created_at)}</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
