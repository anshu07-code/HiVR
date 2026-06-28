import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Animated skeleton block. Pure CSS shimmer — no JS, no extra dependencies.
 * Use one or several together to suggest the shape of the content that's
 * about to load. The browser handles the rest.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-md bg-muted/60 skeleton", className)}
      {...props}
    />
  );
}
