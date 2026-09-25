"use client";

import { useState, useEffect } from "react";
import { Clock } from "lucide-react";

function timeUntil(iso: string): string {
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return "—";
  const ms = target - Date.now();
  if (ms < 0) {
    const ago = Math.abs(ms);
    const d = Math.floor(ago / 86400000);
    if (d >= 1) return `${d}d ago`;
    const h = Math.floor(ago / 3600000);
    if (h >= 1) return `${h}h ago`;
    return "just now";
  }
  const d = Math.floor(ms / 86400000);
  if (d >= 7) return `in ${Math.floor(d / 7)}w`;
  if (d >= 1) return `in ${d}d`;
  const h = Math.floor(ms / 3600000);
  if (h >= 1) return `in ${h}h`;
  const m = Math.floor(ms / 60000);
  if (m >= 1) return `in ${m}m`;
  return "now";
}

function formatIST(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return new Date(iso).toLocaleString("en-IN", {
      day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
    });
  }
}

export function DeadlineDisplay({ deadline, status }: { deadline: string; status?: string }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const deadlinePassed = new Date(deadline).getTime() <= now;
  const isClosed = status && status !== "open";
  const showClosed = isClosed || deadlinePassed;

  return (
    <div className={`mt-3 rounded-md border p-2 text-xs ${showClosed ? "border-muted bg-muted/30" : "bg-amber-500/5"}`}>
      <div className={`flex items-center gap-1.5 ${showClosed ? "text-muted-foreground" : "text-amber-700 dark:text-amber-400"}`}>
        <Clock className="h-3 w-3" />
        <span className="font-medium">
          {showClosed ? "Closed" : "Closes"}{!showClosed && <> {timeUntil(deadline)}</>}
        </span>
      </div>
      <p className="mt-0.5 text-[10px] text-muted-foreground">
        {formatIST(deadline)}
      </p>
    </div>
  );
}
