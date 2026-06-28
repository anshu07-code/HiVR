import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";

export default function PricingLoading() {
  return (
    <div className="container min-h-[60vh] py-16" aria-busy="true" aria-live="polite">
      <div className="mx-auto mb-12 max-w-2xl space-y-3 text-center">
        <Skeleton className="mx-auto h-5 w-16" />
        <Skeleton className="mx-auto h-9 w-80" />
        <Skeleton className="mx-auto h-4 w-96" />
      </div>
      <div className="mb-12 grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-5 space-y-3">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </div>
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
