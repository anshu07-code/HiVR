"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { usePathname } from "next/navigation";

async function fetchUnseenCount(userId: string): Promise<number> {
  const sb = createClient();
  const { data } = await sb
    .from("negotiation_offers")
    .select("employee_id, employee_seen_at, buyer_seen_at")
    .or(`employee_id.eq.${userId},buyer_id.eq.${userId}`)
    .in("status", ["pending", "countered"]);
  if (!data) return 0;
  return data.filter((o: any) =>
    o.employee_id === userId ? !o.employee_seen_at : !o.buyer_seen_at
  ).length;
}

export function PendingOfferBadge() {
  const [count, setCount] = React.useState<number | null>(null);
  const pathname = usePathname();

  React.useEffect(() => {
    let cancelled = false;
    let userId: string | null = null;

    async function init() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user || cancelled) return;
      userId = user.id;

      const c = await fetchUnseenCount(userId);
      if (!cancelled) setCount(c);

      const channel = sb
        .channel("pending-offer-count")
        .on("postgres_changes",
          { event: "*", schema: "public", table: "negotiation_offers" },
          async () => {
            if (!userId || cancelled) return;
            const c2 = await fetchUnseenCount(userId);
            if (!cancelled) setCount(c2);
          }
        )
        .subscribe();

      return channel;
    }

    const channelPromise = init();

    return () => {
      cancelled = true;
      channelPromise.then(ch => { if (ch) { const sb = createClient(); sb.removeChannel(ch); } });
    };
  }, [pathname]);

  if (count === null || count === 0) return null;

  return (
    <span className="ml-auto flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
      {count > 99 ? "99+" : count}
    </span>
  );
}
