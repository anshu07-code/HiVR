"use client";

import * as React from "react";
import { Share2, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Share button. Uses the Web Share API where available, falls back to
 * copying the URL to the clipboard. Always succeeds from the user's POV
 * (a toast-like inline state confirms the copy).
 */
export function ShareButton({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  async function share() {
    const fullUrl = url.startsWith("http") ? url : (typeof window !== "undefined" ? window.location.origin + url : url);
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({ title, url: fullUrl });
        return;
      } catch { /* user cancelled or not supported */ }
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(fullUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      } catch { /* fall through to manual prompt */ }
    }
    // Last resort: open a window so the user can copy manually
    if (typeof window !== "undefined") {
      window.prompt("Copy this link:", fullUrl);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={share}
      aria-label="Share task"
      title="Share"
    >
      {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Share2 className="h-4 w-4" />}
      {copied ? "Copied" : "Share"}
    </Button>
  );
}
