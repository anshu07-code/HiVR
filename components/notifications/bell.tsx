"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, CheckCircle2, Users, ShieldCheck, Sparkles, Mail, Handshake, XCircle, Zap, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

type Notif = {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  new_application: Users,
  hired: CheckCircle2,
  kyc_verified: ShieldCheck,
  hiring_stage: Sparkles,
  new_message: Mail,
  offer: Handshake,
  offer_declined: XCircle,
  hire_offer: Handshake,
  instant_hire_offer: Zap,
  task_recommendation: Star,
  default: Bell,
};

const TYPE_TONE: Record<string, string> = {
  new_application: "text-primary",
  hired: "text-emerald-600",
  kyc_verified: "text-emerald-600",
  hiring_stage: "text-amber-600",
  new_message: "text-blue-600",
  offer: "text-amber-600",
  offer_declined: "text-rose-600",
  hire_offer: "text-amber-600",
  instant_hire_offer: "text-amber-600",
  task_recommendation: "text-indigo-600",
  default: "text-muted-foreground",
};

export function NotificationBell({ userId, initialUnread, initialRecent }: { userId: string; initialUnread: number; initialRecent: Notif[] }) {
  const [open, setOpen] = React.useState(false);
  const [unread, setUnread] = React.useState(initialUnread);
  const [recent, setRecent] = React.useState<Notif[]>(initialRecent);
  const router = useRouter();

  // NOTE: The navbar already fetches `initialUnread` and `initialRecent`
  // in its own useEffect and passes them down as props. We do NOT fetch
  // again on mount — that was duplicating the request on every page.
  // The realtime subscription below is the only source of live updates.

  // Subscribe to realtime (INSERT / UPDATE / DELETE)
  React.useEffect(() => {
    if (!userId) return;
    const sb = createClient();
    // Subscribe without a row filter — Supabase Realtime applies the
    // filter to the NEW payload which is empty for DELETE events.
    // Filtering client-side is the only reliable way. RLS on the
    // notifications table ensures we only receive events for the
    // current user's notifications anyway.
    const channel = sb
      .channel("notif-bell")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        async (payload) => {
          const n = payload.new as any;
          if (n.user_id !== userId) return; // client-side filter
          setRecent((prev) => prev.some((x) => x.id === n.id) ? prev : [n, ...prev].slice(0, 15));
          setUnread((c) => c + 1);
        })
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications" },
        async (payload) => {
          const n = payload.new as any;
          if (n.user_id !== userId) return;
          setRecent((prev) => prev.map((x) => (x.id === n.id ? n : x)));
          if (n.read_at) setUnread((c) => Math.max(0, c - 1));
        })
      .on("postgres_changes",
        { event: "DELETE", schema: "public", table: "notifications" },
        async (payload) => {
          const old = payload.old as any;
          if (old?.user_id !== userId) return;
          setRecent((prev) => prev.filter((x) => x.id !== old.id));
          // Unread delta: only decrement if the deleted notif was unread
          if (!old?.read_at) setUnread((c) => Math.max(0, c - 1));
        })
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [userId]);

  async function openNotif(n: Notif) {
    if (!n.read_at) {
      const sb = createClient();
      await (sb.from("notifications") as any).update({ read_at: new Date().toISOString() }).eq("id", n.id);
      setUnread((c) => Math.max(0, c - 1));
    }
    setOpen(false);

    const target = n.link;
    if (!target) return;

    try {
      const url = new URL(target, window.location.origin);
      const settleAppId = url.searchParams.get("settleAppId");
      const sb = createClient();

      // — Settlement: resolve to current state —
      if (settleAppId) {
        const { data: rounds } = await sb
          .from("settlement_rounds")
          .select("id, round_number, offered_by, amount_paise, time_minutes, message, status, parent_round_id, created_at")
          .eq("application_id", settleAppId)
          .order("round_number", { ascending: false })
          .limit(3);

        const allRounds = (rounds ?? []) as any[];
        const lastRound = allRounds[0];

        if (lastRound?.status === "accepted") {
          // Find the contract created by this settlement
          const { data: app } = await sb
            .from("task_applications")
            .select("task_id, employee_id")
            .eq("id", settleAppId)
            .maybeSingle();
          if (app) {
            const { data: contract } = await sb
              .from("contracts")
              .select("id")
              .eq("task_post_id", (app as any).task_id)
              .eq("employee_id", (app as any).employee_id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (contract) {
              router.push(`/dashboard/contracts/${(contract as any).id}`);
              return;
            }
          }
        }

        if (lastRound?.status === "declined") {
          router.push(`/dashboard/applications?settleAppId=${settleAppId}&declined=1`);
          return;
        }
      }

      // — hire_offer / hiring_stage: check for existing contracts —
      if (n.type === "hire_offer" || n.type === "hiring_stage") {
        const { data: contracts } = await sb
          .from("contracts")
          .select("id, created_at")
          .eq("employee_id", userId)
          .in("status", ["active", "pending_acceptance", "completed", "delivered", "disputed"])
          .order("created_at", { ascending: false })
          .limit(1);
        if (contracts && contracts.length > 0) {
          const latest = (contracts as any[])[0];
          if (new Date(latest.created_at) > new Date(n.created_at)) {
            router.push(`/dashboard/contracts/${latest.id}`);
            return;
          }
        }
      }
    } catch {
      // If parsing fails, fall through to default navigation
    }

    // Default: navigate to original link
    router.push(target);
  }

  async function markAllRead() {
    const sb = createClient();
    await (sb.from("notifications") as any).update({ read_at: new Date().toISOString() }).is("read_at", null);
    setUnread(0);
    setRecent((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={markAllRead}>
              <CheckCircle2 className="h-3 w-3" />Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto scrollbar-thin">
          {recent.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              <Bell className="mx-auto h-8 w-8 opacity-30" />
              <p className="mt-2">No notifications yet</p>
            </div>
          )}
          {recent.map((n) => {
            const Icon = TYPE_ICON[n.type] ?? TYPE_ICON.default;
            const tone = TYPE_TONE[n.type] ?? TYPE_TONE.default;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => openNotif(n)}
                className={`flex w-full items-start gap-2 border-b px-3 py-2.5 text-left transition-colors hover:bg-muted/50 ${!n.read_at ? "bg-primary/5" : ""}`}
              >
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{n.title}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{timeAgo(n.created_at)}</p>
                </div>
                {!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
              </button>
            );
          })}
        </div>
        <div className="border-t p-2">
          <Button asChild variant="ghost" size="sm" className="w-full justify-center text-xs">
            <Link href="/dashboard/notifications">View all</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
