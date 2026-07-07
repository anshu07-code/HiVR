"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { AvailabilityStatus } from "@/lib/supabase/types";

const STATUS_CONFIG: Record<AvailabilityStatus, { label: string; dot: string; desc: string }> = {
  online:  { label: "Online",  dot: "bg-emerald-500", desc: "Ready to take on new work" },
  offline: { label: "Offline", dot: "bg-gray-500",     desc: "Not available right now" },
  away:    { label: "Away",    dot: "bg-red-500",      desc: "Will respond when back" },
  busy:    { label: "Busy",    dot: "bg-yellow-500",   desc: "Managing existing contracts" },
};

export function AvailabilitySwitcher({ userId, current }: { userId: string; current: AvailabilityStatus }) {
  const [open, setOpen] = React.useState(false);
  const [status, setStatus] = React.useState<AvailabilityStatus>(current);
  const [saving, setSaving] = React.useState(false);
  const router = useRouter();
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const updateStatus = async (s: AvailabilityStatus) => {
    if (s === status) { setOpen(false); return; }
    setSaving(true);
    try {
      const sb = createClient();
      const { error } = await sb
        .from("employee_profiles")
        .update({ availability_status: s })
        .eq("user_id", userId);
      if (error) throw error;
      setStatus(s);
      router.refresh();
    } catch { }
    setSaving(false);
    setOpen(false);
  };

  const cfg = STATUS_CONFIG[status];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={saving}
        className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted/50 transition-colors disabled:opacity-50"
      >
        <span className={cn("h-2 w-2 rounded-full shrink-0", cfg.dot)} />
        {cfg.label}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-56 rounded-xl border bg-background shadow-xl animate-in slide-in-from-top-2 fade-in duration-150">
          <div className="p-2 space-y-0.5">
            {(Object.entries(STATUS_CONFIG) as [AvailabilityStatus, typeof cfg][]).map(([key, c]) => (
              <button
                key={key}
                onClick={() => updateStatus(key)}
                disabled={saving}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs transition-colors",
                  key === status ? "bg-primary/10 font-semibold" : "hover:bg-muted/50"
                )}
              >
                <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", c.dot)} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{c.label}</p>
                  <p className="text-[11px] text-muted-foreground">{c.desc}</p>
                </div>
                {key === status && <span className="text-[10px] text-primary font-semibold">Active</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
