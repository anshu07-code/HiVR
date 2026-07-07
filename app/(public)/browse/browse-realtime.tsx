"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function BrowseRealtime() {
  const router = useRouter();
  React.useEffect(() => {
    const sb = createClient();
    const channel = sb
      .channel("browse-rt")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "task_posts" },
        () => router.refresh(),
      )
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [router]);
  return null;
}
