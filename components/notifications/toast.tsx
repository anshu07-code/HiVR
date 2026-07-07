"use client";

import * as React from "react";
import { X, Bell, Mail, Users, ShieldCheck, CheckCircle2, Sparkles } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  new_application: Users,
  hired: CheckCircle2,
  kyc_verified: ShieldCheck,
  hiring_stage: Sparkles,
  new_message: Mail,
  default: Bell,
};

type Toast = {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
};

export function NotificationToast() {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const pathRef = React.useRef(typeof window !== "undefined" ? window.location.pathname : "");

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const updatePath = () => { pathRef.current = window.location.pathname; };
    updatePath();
    window.addEventListener("popstate", updatePath);
    window.addEventListener("click", () => setTimeout(updatePath, 100));
    return () => {
      window.removeEventListener("popstate", updatePath);
      window.removeEventListener("click", updatePath);
    };
  }, []);

  React.useEffect(() => {
    const sb = createClient();
    const channel = sb
      .channel("notif-toast")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => {
          const n = payload.new as any;
          if (n.user_id !== (sb.auth as any).currentUser?.id) return; // only show own notifications

          // Skip if user is already viewing the page the notification links to
          const link = n.link ?? "";
          if (link && pathRef.current.startsWith(link)) return;

          const toast: Toast = {
            id: n.id,
            type: n.type,
            title: n.title,
            body: n.body,
            link: n.link,
          };
          setToasts((prev) => [toast, ...prev].slice(0, 3));
          setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== n.id));
          }, 5000);
        })
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-2">
      {toasts.map((t) => {
        const Icon = TYPE_ICON[t.type] ?? TYPE_ICON.default;
        const Wrapper = t.link ? Link : "div";
        const wrapperProps = t.link
          ? { href: t.link, className: "flex items-start gap-3 rounded-xl border bg-background shadow-2xl px-4 py-3 backdrop-blur-md min-w-[300px] max-w-[400px] animate-in slide-in-from-bottom-4 fade-in duration-300 hover:bg-muted/50 transition-colors" }
          : { className: "flex items-start gap-3 rounded-xl border bg-background shadow-2xl px-4 py-3 backdrop-blur-md min-w-[300px] max-w-[400px] animate-in slide-in-from-bottom-4 fade-in duration-300" };
        return (
          <div key={t.id} className="relative">
            <Wrapper {...(wrapperProps as any)}>
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{t.title}</p>
                <p className="line-clamp-2 text-xs text-muted-foreground">{t.body}</p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setToasts((prev) => prev.filter((x) => x.id !== t.id));
                }}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </Wrapper>
          </div>
        );
      })}
    </div>
  );
}
