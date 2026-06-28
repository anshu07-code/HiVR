"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * HiVR brand logo. The mark is an "H" with a small accent dot — visual
 * shorthand for "human + verified". The wordmark uses a gradient sweep
 * on "Hi" and a solid weight on "VR" for a confident, professional look
 * that reads cleanly at any size.
 */
export function Logo({ className, withWordmark = true }: { className?: string; withWordmark?: boolean }) {
  return (
    <Link href="/" className={cn("inline-flex items-center gap-2 group", className)}>
      <span
        aria-hidden
        className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-sm ring-1 ring-primary/20 transition-transform group-hover:scale-105"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 5v14M4 12h10M20 5v14" />
          <circle cx="20" cy="5" r="1.6" fill="currentColor" />
        </svg>
      </span>
      {withWordmark && (
        <span className="font-display text-[1.15rem] font-bold tracking-tight leading-none select-none">
          <span className="gradient-text">Hi</span>
          <span className="text-foreground">VR</span>
        </span>
      )}
    </Link>
  );
}
