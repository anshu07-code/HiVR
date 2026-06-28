import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Root loading UI. Shown by Next.js automatically for any route segment
 * that doesn't have its own loading.tsx. Without this, the user sees a
 * blank page during navigation in dev mode (where every server component
 * has to compile on first hit).
 */
export default function RootLoading() {
  return (
    <div className="container min-h-[60vh] py-12" aria-busy="true" aria-live="polite">
      <div className="mx-auto max-w-2xl space-y-6 text-center">
        <Skeleton className="mx-auto h-8 w-48" />
        <Skeleton className="mx-auto h-4 w-80" />
      </div>
      <div className="mx-auto mt-10 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-4 space-y-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
            <div className="flex gap-2 pt-2">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
