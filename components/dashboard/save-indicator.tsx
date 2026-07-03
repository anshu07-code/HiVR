"use client";

import * as React from "react";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Inline save-status pill. Shows one of: "Unsaved", "Saving…", "Saved", "Failed".
 */
export function SaveIndicator({ status }: { status: "idle" | "saving" | "saved" | "failed" }) {
  if (status === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-[10px] font-medium text-sky-700">
        <Loader2 className="h-3 w-3 animate-spin" />
        Saving…
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-700">
        <CheckCircle2 className="h-3 w-3" />
        Saved
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[10px] font-medium text-rose-700">
        <AlertCircle className="h-3 w-3" />
        Save failed
      </span>
    );
  }
  return null;
}
