"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { usePathname } from "next/navigation";

export function MarkOffersSeen() {
  const pathname = usePathname();

  React.useEffect(() => {
    const sb = createClient();
    sb.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      const now = new Date().toISOString();
      // Mark offers where user is employee
      sb.from("negotiation_offers")
        .update({ employee_seen_at: now })
        .eq("employee_id", user.id)
        .in("status", ["pending", "countered"])
        .then(({ error }) => { if (error) console.error("mark employee seen:", error); });
      // Mark offers where user is buyer
      sb.from("negotiation_offers")
        .update({ buyer_seen_at: now })
        .eq("buyer_id", user.id)
        .in("status", ["pending", "countered"])
        .then(({ error }) => { if (error) console.error("mark buyer seen:", error); });
    });
  }, [pathname]);

  return null;
}
