import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="flex min-h-screen" aria-busy="true" aria-live="polite">
      <aside className="hidden h-screen w-[248px] shrink-0 border-r bg-card md:block">
        <div className="flex h-[72px] items-center gap-2 border-b px-4">
          <Skeleton className="h-7 w-7 rounded" />
          <Skeleton className="h-5 w-24" />
        </div>
        <div className="space-y-1 p-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-md px-2.5 py-2">
              <Skeleton className="h-[18px] w-[18px] rounded" />
              <Skeleton className="h-3.5 flex-1" />
            </div>
          ))}
        </div>
      </aside>
      <main className="flex-1 p-6 md:p-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-lg border bg-card p-5 space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-7 w-16" />
              </div>
            ))}
          </div>
          <div className="rounded-lg border bg-card p-5 space-y-3">
            <Skeleton className="h-4 w-32" />
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
