"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { usePathname } from "next/navigation";

export function MarkMessagesRead() {
  const pathname = usePathname();

  React.useEffect(() => {
    const sb = createClient();
    sb.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      sb.from("direct_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("receiver_id", user.id)
        .is("read_at", null)
        .then(({ error }) => {
          if (error) console.error("mark messages read error:", error);
        });
    });
  }, [pathname]);

  return null;
}
