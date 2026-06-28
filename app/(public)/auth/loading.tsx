import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";

export default function AuthLoading() {
  return (
    <div className="container flex min-h-[80vh] items-center justify-center py-12" aria-busy="true" aria-live="polite">
      <div className="w-full max-w-sm space-y-4 rounded-lg border bg-card p-6">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-56" />
        <div className="space-y-3 pt-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
        <Skeleton className="h-3 w-40" />
      </div>
    </div>
  );
}
