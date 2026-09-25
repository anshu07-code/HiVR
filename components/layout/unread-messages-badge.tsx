"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { usePathname } from "next/navigation";

export function UnreadMessagesBadge() {
  const [count, setCount] = React.useState(0);
  const pathname = usePathname();

  React.useEffect(() => {
    let cancelled = false;
    async function fetchCount() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user || cancelled) return;

      const { count: dmCount } = await sb
        .from("direct_messages")
        .select("id", { count: "exact", head: true })
        .eq("receiver_id", user.id)
        .is("read_at", null)
        .limit(100);

      if (!cancelled) setCount(dmCount ?? 0);
    }
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [pathname]);

  if (count === 0) return null;

  return (
    <span className="ml-auto flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
      {count > 99 ? "99+" : count}
    </span>
  );
}
