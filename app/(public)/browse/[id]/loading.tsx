import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="min-h-screen bg-muted/30">
      <div className="border-b bg-background">
        <div className="container py-8">
          <Skeleton className="mb-2 h-6 w-32" />
          <Skeleton className="h-10 w-3/4" />
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </div>
      </div>
      <div className="container py-8">
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  );
}
