"use client";

import * as React from "react";
import { X, Bell, CheckCircle2, Users, Handshake, Zap, Sparkles, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  new_application: Users,
  hired: CheckCircle2,
  hire_offer: Handshake,
  instant_hire_offer: Handshake,
  hiring_stage: Sparkles,
  kyc_verified: ShieldCheck,
  default: Bell,
};

const TYPE_COLOR: Record<string, string> = {
  new_application: "text-blue-600 bg-blue-500/10",
  hired: "text-emerald-600 bg-emerald-500/10",
  hire_offer: "text-amber-600 bg-amber-500/10",
  instant_hire_offer: "text-amber-600 bg-amber-500/10",
  hiring_stage: "text-violet-600 bg-violet-500/10",
  kyc_verified: "text-emerald-600 bg-emerald-500/10",
  default: "text-muted-foreground bg-muted",
};

type PopupNotif = {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
};

export function LiveNotificationPopup() {
  const [queue, setQueue] = React.useState<PopupNotif[]>([]);
  const [userId, setUserId] = React.useState<string | null>(null);
  const router = useRouter();

  React.useEffect(() => {
    const sb = createClient();
    sb.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });
  }, []);

  React.useEffect(() => {
    if (!userId) return;
    const sb = createClient();

    const channel = sb
      .channel("notif-popup")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        async (payload) => {
          const n = payload.new as any;
          if (n.user_id !== userId) return;

          const notif: PopupNotif = {
            id: n.id,
            type: n.type ?? "default",
            title: n.title ?? "",
            body: n.body ?? "",
            link: n.link ?? null,
          };

          setQueue((prev) => {
            if (prev.some((x) => x.id === notif.id)) return prev;
            return [...prev, notif];
          });

          setTimeout(() => {
            setQueue((prev) => prev.filter((x) => x.id !== notif.id));
          }, 8000);
        },
      )
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [userId]);

  const dismiss = (id: string) => {
    setQueue((prev) => prev.filter((x) => x.id !== id));
  };

  const handleClick = (n: PopupNotif) => {
    dismiss(n.id);
    if (n.link) router.push(n.link);
  };

  if (queue.length === 0) return null;

  return (
    <div className="fixed right-4 top-20 z-[200] flex w-[360px] flex-col gap-2" style={{ maxHeight: "calc(100vh - 100px)", overflowY: "auto" }}>
      {queue.map((n) => {
        const Icon = TYPE_ICON[n.type] ?? TYPE_ICON.default;
        const colorClass = TYPE_COLOR[n.type] ?? TYPE_COLOR.default;
        return (
          <div
            key={n.id}
            className="animate-in slide-in-from-right-8 fade-in zoom-in-95 relative flex cursor-pointer items-start gap-3 rounded-xl border bg-card p-4 shadow-xl transition-all hover:shadow-2xl hover:scale-[1.02]"
            onClick={() => handleClick(n)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter") handleClick(n); }}
          >
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); dismiss(n.id); }}
              className="absolute right-2 top-2 rounded-full p-0.5 text-muted-foreground/60 hover:bg-muted hover:text-foreground"
              aria-label="Dismiss"
            >
              <X className="h-3 w-3" />
            </button>
            <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${colorClass}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1 pr-4">
              <p className="text-sm font-semibold leading-tight">{n.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{n.body}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}