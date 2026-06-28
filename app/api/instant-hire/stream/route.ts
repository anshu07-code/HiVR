import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/instant-hire/stream
 *
 * Server-Sent Events for the employee dashboard. Streams:
 *   - "ping" every 25s (keep-alive)
 *   - "offer" event whenever a new instant-hire offer is made for
 *     this user (picked up via the notifications table INSERT)
 *   - "offer-updated" event when one of their offers changes status
 *
 * Auth: requires a signed-in user. Stream is closed when the client
 * disconnects.
 *
 * SSE wire format:
 *   event: <type>\n
 *   data: <json>\n
 *   \n
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const userId = user.id;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Initial comment line so the client knows the stream is open
      controller.enqueue(encoder.encode(`: connected ${userId} ${Date.now()}\n\n`));

      // 1) Subscribe to NEW instant-hire offers for this user.
      //    We poll because Supabase Realtime on RLS-restricted tables
      //    can be flaky; a lightweight poll is reliable and cheap
      //    for the volumes we expect (<= 1 offer per second per user).
      const seenOfferIds = new Set<string>();

      const fetchNew = async () => {
        try {
          const { data } = await sb
            .from("instant_hire_offers")
            .select("id, contract_id, buyer_id, category_id, urgency, rate_paise, status, counter_round, max_rounds, cascade_position, offered_at, expires_at")
            .eq("candidate_id", userId)
            .eq("status", "offered")
            .gt("expires_at", new Date().toISOString())
            .order("offered_at", { ascending: false })
            .limit(5);
          for (const o of (data ?? []) as any[]) {
            if (seenOfferIds.has(o.id)) continue;
            seenOfferIds.add(o.id);
            try {
              controller.enqueue(encoder.encode(
                `event: offer\ndata: ${JSON.stringify(o)}\n\n`
              ));
            } catch { /* stream closed */ }
          }
        } catch { /* ignore poll failures */ }
      };

      // 2) Heartbeat
      const ping = () => {
        try { controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`)); } catch {}
      };

      // Run an initial fetch then start the poll
      await fetchNew();
      const pollInterval = setInterval(fetchNew, 4_000);
      const pingInterval = setInterval(ping, 25_000);

      // 3) Watch the notifications table for instant-hire events too
      //    (so in-app toasts also trigger on the bell counter)
      const channel = sb
        .channel(`instant-hire-${userId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
          (payload) => {
            const kind = (payload.new as any)?.kind;
            if (typeof kind === "string" && kind.startsWith("instant_hire")) {
              try { controller.enqueue(encoder.encode(
                `event: notification\ndata: ${JSON.stringify(payload.new)}\n\n`
              )); } catch {}
            }
          }
        )
        .subscribe();

      // 4) Cleanup when the client disconnects
      const cleanup = () => {
        clearInterval(pollInterval);
        clearInterval(pingInterval);
        try { sb.removeChannel(channel); } catch {}
        try { controller.close(); } catch {}
      };

      req.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
