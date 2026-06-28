import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWebPushToUser } from "@/lib/web-push";

/**
 * POST /api/contracts/[id]/instant-hire/initiate
 * Body: { candidate_id?: string, urgency?: 'normal'|'urgent'|'critical' }
 *
 * Either:
 *   - pass candidate_id explicitly (the buyer picked this person on the Smart Match page), OR
 *   - omit it and the system picks the top available candidate via Smart Match.
 *
 * Returns { offer_id, candidate_id, rate_paise, expires_at }.
 * The offer has a 60-second TTL by default.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const candidateId = body?.candidate_id ? String(body.candidate_id) : null;
  const urgency = body?.urgency ? String(body.urgency) : "normal";

  // If no candidate supplied, pick the top one via Smart Match.
  let resolvedCandidate = candidateId;
  if (!resolvedCandidate) {
    const { data: contract } = await sb
      .from("contracts")
      .select("category_id, budget_max, agreed_price")
      .eq("id", params.id)
      .maybeSingle();
    if (!contract) return NextResponse.json({ ok: false, error: "Contract not found" }, { status: 404 });

    const { data: matchData } = await sb.rpc("get_instant_hire_candidates" as any, {
      p_category_id: (contract as any).category_id,
      p_budget_max: (contract as any).agreed_price ?? (contract as any).budget_max,
      p_urgency: urgency,
      p_limit: 1,
    });
    const top = ((matchData as any)?.candidates ?? [])[0];
    if (!top) return NextResponse.json({ ok: false, error: "No available candidates right now" }, { status: 404 });
    resolvedCandidate = top.user_id;
  }

  const { data, error } = await sb.rpc("initiate_instant_hire_offer" as any, {
    p_contract_id: params.id,
    p_candidate_id: resolvedCandidate,
    p_urgency: urgency,
    p_expires_in_seconds: 60,
  } as any);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  // Fire a web push to the candidate so they get the offer even if
  // the tab is closed. Fire-and-forget — failures here are silent.
  if (data && (data as any).ok && (data as any).offer_id) {
    try {
      const admin = createAdminClient();
      const offerId = (data as any).offer_id;
      const ratePaise = (data as any).rate_paise ?? 0;
      const inr = Math.round(ratePaise / 100).toLocaleString("en-IN");
      const urgencyLabel = urgency === "critical" ? "Critical"
        : urgency === "urgent" ? "Urgent" : "Instant";
      void sendWebPushToUser(admin, resolvedCandidate, {
        title: `HiVR · ${urgencyLabel} Hire offer`,
        body: `A buyer wants to hire you for ₹${inr}. You have 60 seconds to accept.`,
        url: `/dashboard/instant-hire/offer/${offerId}`,
        tag: "instant-hire-offer",
        ttl: 120,
        requireInteraction: true,
      }).catch((e) => {
        // eslint-disable-next-line no-console
        console.error("[instant-hire/initiate] web push failed:", e);
      });
    } catch { /* ignore — web push is best-effort */ }
  }

  return NextResponse.json(data);
}
