import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { timingSafeEqual } from "@/lib/security";
import { sendWebPushToUser } from "@/lib/web-push";

/**
 * Cron job: auto-expire stale Instant Hire offers + cascade to the
 * next-best available candidate.
 *
 * Flow (run every minute via vercel.json cron, or more frequently via
 * an external scheduler if you need sub-minute response):
 *
 *   1. Find all `instant_hire_offers` with status='offered' and
 *      expires_at < now(). These are handshakes where the candidate
 *      didn't accept / decline / counter in time.
 *
 *   2. For each expired offer, call `expire_instant_hire_offer` to
 *      release the 'busy' lock on the candidate (so they show as
 *      available again in future Smart Match queries).
 *
 *   3. Find the next-best available candidate via
 *      `get_instant_hire_candidates` (with the contract's category and
 *      budget). Filter out:
 *        - the just-expired candidate
 *        - every candidate that has already been offered for this
 *          contract (cascade_position 1..N) in any state
 *        - candidates at capacity (3+ active contracts)
 *        - candidates who declined this same contract
 *      Then take the top of the remaining list and call
 *      `initiate_instant_hire_offer` with cascade_position = previous + 1.
 *
 *   4. Cap the cascade at CASCADE_MAX (default 3). When the
 *      cascade is exhausted, notify the buyer that no top candidate
 *      is available right now.
 *
 * Auth: requires the `Authorization: Bearer ${CRON_SECRET}` header.
 *
 * Schedule: every minute (Vercel cron min). The 60-second offer TTL
 * means this will typically fire 1-2 times per offer (once at 60s
 * past, occasionally a second time at 120s past if the cascade's
 * first round also times out). For sub-minute cascade, replace the
 * cron with a real worker process or use an external scheduler
 * (GitHub Actions, Railway cron, etc.) at 10-15s intervals.
 */

const CASCADE_MAX = 3;

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || cronSecret.length < 16) {
    // eslint-disable-next-line no-console
    console.error("[instant-hire-cascade] CRON_SECRET missing or too short; refusing to run");
    return NextResponse.json({ ok: false, error: "server misconfigured" }, { status: 503 });
  }
  const headerSecret = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!headerSecret || !timingSafeEqual(headerSecret, cronSecret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  // 1) Find all expired offers
  const { data: expiredOffers, error: expErr } = await admin
    .from("instant_hire_offers")
    .select("id, contract_id, candidate_id, buyer_id, category_id, urgency, cascade_position, rate_paise, expires_at")
    .eq("status", "offered")
    .lt("expires_at", now)
    .order("expires_at", { ascending: true })
    .limit(50); // batch size

  if (expErr) {
    return NextResponse.json({ ok: false, error: expErr.message }, { status: 500 });
  }

  const summary = {
    expired: 0,
    cascaded: 0,
    exhausted: 0,
    no_match: 0,
  };
  const debugLog: any[] = [];

  for (const offer of (expiredOffers ?? []) as any[]) {
    // 2) Mark expired and release the busy lock on the candidate
    const { data: expResult } = await admin.rpc("expire_instant_hire_offer" as any, { p_offer_id: offer.id } as any);
    if (!expResult || (expResult as any).ok === false) {
      debugLog.push({ offer_id: offer.id, error: (expResult as any)?.error ?? "expire failed" });
      continue;
    }
    summary.expired++;

    // 3) If the cascade is at the cap, notify the buyer that no top
    //    candidate is available. The contract stays active so the
    //    buyer can pick manually from the applicant pool.
    if ((offer.cascade_position ?? 1) >= CASCADE_MAX) {
      summary.exhausted++;
      await admin.rpc("create_notification" as any, {
        p_user_id: offer.buyer_id,
        p_kind: "instant_hire_cascade_exhausted",
        p_title: "No top candidates available right now",
        p_body: `We tried ${CASCADE_MAX} top-rated pros for "${offer.contract_id}" but none responded in time. Open the contract to browse the full applicant list and pick manually, or wait a few minutes and try again.`,
        p_link: `/dashboard/contracts/${offer.contract_id}`,
      } as any);
      debugLog.push({ offer_id: offer.id, status: "cascade_exhausted", position: offer.cascade_position });
      continue;
    }

    // 4) Find the candidates that have already been offered for this
    //    contract (so we don't offer them again).
    const { data: priorOffers } = await admin
      .from("instant_hire_offers")
      .select("candidate_id, status")
      .eq("contract_id", offer.contract_id);

    const excluded = new Set<string>([offer.candidate_id]);
    for (const po of (priorOffers ?? []) as any[]) {
      excluded.add(po.candidate_id);
    }

    // 5) Find the next best candidate
    const { data: contractRow } = await admin
      .from("contracts")
      .select("id, category_id, agreed_price, buyer_id")
      .eq("id", offer.contract_id)
      .maybeSingle();
    if (!contractRow) {
      debugLog.push({ offer_id: offer.id, error: "contract not found" });
      continue;
    }

    const { data: matchData, error: matchErr } = await admin.rpc(
      "get_instant_hire_candidates" as any,
      {
        p_category_id: (contractRow as any).category_id,
        p_budget_max: (contractRow as any).agreed_price,
        p_urgency: offer.urgency ?? "normal",
        p_limit: 10,
      } as any
    );

    if (matchErr) {
      debugLog.push({ offer_id: offer.id, error: "match fetch failed: " + matchErr.message });
      continue;
    }

    const candidates = ((matchData as any)?.candidates ?? []) as any[];
    const next = candidates.find(c => !excluded.has(c.user_id) && c.can_hire_instantly !== false);

    if (!next) {
      summary.no_match++;
      await admin.rpc("create_notification" as any, {
        p_user_id: offer.buyer_id,
        p_kind: "instant_hire_cascade_exhausted",
        p_title: "No more top candidates available",
        p_body: `We tried ${(offer.cascade_position ?? 1) + 1} top-rated pros for your contract but none are available right now. Open the contract to pick manually from the full applicant list.`,
        p_link: `/dashboard/contracts/${offer.contract_id}`,
      } as any);
      debugLog.push({ offer_id: offer.id, status: "no_more_candidates", position: offer.cascade_position });
      continue;
    }

    // 6) Initiate the next round of the cascade. We use the
    //    service-role-targeted variant `initiate_instant_hire_cascade`
    //    (defined in 0095) because the original
    //    `initiate_instant_hire_offer` requires auth.uid() to match
    //    the contract's buyer — but the cron is acting on behalf of
    //    the buyer via the service role, where auth.uid() is null.
    const { data: initResult, error: initErr } = await admin.rpc(
      "initiate_instant_hire_cascade" as any,
      {
        p_contract_id: offer.contract_id,
        p_candidate_id: next.user_id,
        p_urgency: offer.urgency ?? "normal",
        p_expires_in_seconds: 60,
      } as any
    );

    if (initErr || !(initResult as any)?.ok) {
      debugLog.push({
        offer_id: offer.id,
        error: "initiate failed: " + (initErr?.message ?? (initResult as any)?.error ?? "?"),
      });
      continue;
    }

    summary.cascaded++;
    debugLog.push({
      offer_id: offer.id,
      new_offer_id: (initResult as any).offer_id,
      new_candidate: next.user_id,
      new_position: (offer.cascade_position ?? 1) + 1,
    });

    // Web push to the new candidate so they get the cascaded offer
    // even if the tab is closed. Best-effort.
    try {
      const offerId = (initResult as any).offer_id;
      const ratePaise = (initResult as any).rate_paise ?? 0;
      const inr = Math.round(ratePaise / 100).toLocaleString("en-IN");
      const urgencyLabel = offer.urgency === "critical" ? "Critical"
        : offer.urgency === "urgent" ? "Urgent" : "Instant";
      void sendWebPushToUser(admin, next.user_id, {
        title: `HiVR · ${urgencyLabel} Hire (cascade)`,
        body: `A buyer wants to hire you for ₹${inr}. You have 60 seconds to accept.`,
        url: `/dashboard/instant-hire/offer/${offerId}`,
        tag: "instant-hire-offer",
        ttl: 120,
        requireInteraction: true,
      }).catch(() => { /* silent */ });
    } catch { /* ignore */ }
  }

  return NextResponse.json({
    ok: true,
    ...summary,
    log: debugLog,
    ran_at: now,
  });
}
