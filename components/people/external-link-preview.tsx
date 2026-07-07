"use client";

import { useState, useEffect } from "react";
import { X, ExternalLink, AlertTriangle, ShieldAlert } from "lucide-react";
import { goUrl } from "@/lib/go";

export function ExternalLinkPreview({
  url,
  title,
  children,
}: {
  url: string;
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!url) return <>{children}</>;

  const proxyUrl = goUrl(url);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="w-full text-left">
        {children}
      </button>
      {mounted && open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative z-10 flex w-full max-w-4xl flex-col rounded-lg border bg-background shadow-lg mx-4 h-[80vh]">
            <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate text-sm font-medium">{title}</span>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-sm opacity-70 hover:opacity-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-1.5 border-b bg-amber-500/5 px-4 py-1.5 text-[11px] text-amber-700">
              <ShieldAlert className="h-3 w-3 shrink-0" />
              External site — contact info may be visible. Do not share personal contact details.
            </div>
            <div className="relative flex-1">
              {!iframeError && (
                <iframe
                  src={proxyUrl}
                  className="absolute inset-0 h-full w-full border-0 bg-white"
                  sandbox="allow-scripts"
                  title={title}
                  onError={() => setIframeError(true)}
                />
              )}
              {iframeError && (
                <div className="flex h-full items-center justify-center p-8 text-center">
                  <div className="max-w-sm space-y-3">
                    <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
                    <p className="text-sm text-muted-foreground">
                      This site doesn&apos;t allow inline preview.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
