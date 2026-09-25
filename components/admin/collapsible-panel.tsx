"use client";

import * as React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export function CollapsiblePanel({
  title, icon, color, defaultOpen = false, children,
}: {
  title: string;
  icon: React.ReactNode;
  color: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <div className="rounded-lg border bg-card">
      <button
        onClick={() => setOpen(!open)}
        className={`flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/30 ${open ? "border-b" : ""}`}
      >
        <span className={`flex items-center gap-2 text-sm font-semibold ${color}`}>
          {icon}
          {title}
        </span>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  );
}
