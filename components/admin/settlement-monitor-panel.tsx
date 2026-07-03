"use client";

import * as React from "react";
import Link from "next/link";
import { Handshake, Loader2, X, ExternalLink, User, DollarSign, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { timeAgo, formatPaise } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

type Round = {
  id: string;
  application_id: string;
  round_number: number;
  offered_by: "buyer" | "employee";
  amount_paise: number;
  time_minutes: number | null;
  message: string | null;
  status: string;
  created_at: string;
  application?: {
    id: string;
    employee_id: string;
    task_id: string;
    task_posts?: {
      id: string;
      title: string;
      buyer_id: string;
    } | null;
    employee?: {
      full_name: string | null;
    } | null;
    buyer?: {
      full_name: string | null;
    } | null;
  } | null;
};

export function SettlementMonitorPanel() {
  const sbRef = React.useRef<ReturnType<typeof createClient> | null>(null);
  const [rounds, setRounds] = React.useState<Round[]>([]);
  const [tick, setTick] = React.useState(0);
  const [connection, setConnection] = React.useState<"online" | "offline" | "connecting">("connecting");

  React.useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const load = React.useCallback(async () => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const { data } = await sb
      .from("settlement_rounds")
      .select(`
        id, application_id, round_number, offered_by, amount_paise,
        time_minutes, message, status, created_at,
        application:task_applications!inner(
          id, employee_id, task_id,
          task_posts:task_posts!inner(id, title, buyer_id),
          employee:users!task_applications_employee_id_fkey(full_name)
        )
      `)
      .order("created_at", { ascending: false })
      .limit(30) as any;
    setRounds(data ?? []);
  }, []);

  React.useEffect(() => {
    load();
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const channel = sb
      .channel("settlement-monitor")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "settlement_rounds" },
        () => load())
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setConnection("online");
        if (status === "CLOSED" || status === "CHANNEL_ERROR") setConnection("offline");
      });
    return () => { sb.removeChannel(channel); };
  }, [load]);

  void tick;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Handshake className="h-4 w-4 text-purple-600" />Settlement negotiations
          </CardTitle>
          <CardDescription className="text-[11px]">
            Real-time settlement rounds between buyers and employees. Updates as negotiations happen.
          </CardDescription>
        </div>
        <Badge variant={connection === "online" ? "success" : connection === "offline" ? "destructive" : "secondary"} className="gap-1 text-[10px]">
          {connection === "online" && <><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Live</>}
          {connection === "connecting" && <><Loader2 className="h-3 w-3 animate-spin" />Connecting…</>}
          {connection === "offline" && <><X className="h-3 w-3" />Reconnecting…</>}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {rounds.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            No settlement activity yet.
          </p>
        ) : (
          rounds.map((r) => {
            const app = (r as any).application ?? r.application;
            const task = app?.task_posts ?? (r as any).task_posts;
            const employee = app?.employee;
            const isFromBuyer = r.offered_by === "buyer";
            const isAccepted = r.status === "accepted";
            const acceptedBy = isAccepted ? (isFromBuyer ? "Employee" : "Buyer") : null;
            return (
              <div
                key={r.id}
                className={`flex items-center gap-2 rounded-md border p-2 transition-colors ${
                  isAccepted ? "border-emerald-300 bg-emerald-50/50" :
                  r.status === "declined" ? "border-rose-200 bg-rose-50/40" :
                  "border-muted bg-background"
                }`}
              >
                <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                  isAccepted ? "bg-emerald-100 text-emerald-700" : "bg-purple-100 text-purple-700"
                }`}>
                  {isAccepted ? <CheckCircle2 className="h-4 w-4" /> : <Handshake className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold">
                    {isAccepted ? (
                      <span className="text-base font-bold text-emerald-700">{formatPaise(r.amount_paise)}</span>
                    ) : (
                      <>{formatPaise(r.amount_paise)}</>
                    )}
                    {r.time_minutes != null && <span className="ml-1 font-normal text-muted-foreground"> · {r.time_minutes} min</span>}
                    <Badge variant={isFromBuyer ? "outline" : "secondary"} className="ml-1 text-[9px]">
                      {isFromBuyer ? "buyer" : "employee"}
                    </Badge>
                    <Badge variant={isAccepted ? "success" : r.status === "declined" ? "destructive" : "outline"} className="ml-1 text-[9px]">
                      {r.status}
                    </Badge>
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    Round {r.round_number} · {task?.title ?? "—"} · {employee?.full_name ?? "?"} · {timeAgo(r.created_at)}
                    {isAccepted && acceptedBy && (
                      <span className="ml-1 font-semibold text-emerald-600">· Accepted by {acceptedBy}</span>
                    )}
                  </p>
                  {r.message && (
                    <p className="mt-0.5 truncate text-[9px] italic text-muted-foreground">
                      "{r.message}"
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Link
                    href={app?.task_id ? `/admin/tech/chat/${app.task_id}` : "#"}
                    className="rounded border px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted"
                  >
                    <ExternalLink className="mr-0.5 inline h-2.5 w-2.5" />View task
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
