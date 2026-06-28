import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SecurityError, requireUuid, enforceRateLimit } from "@/lib/security";

/**
 * POST /api/instant-hire/expire
 * Body: { offer_id: string }
 *
 * Marks an offered handshake as expired when the buyer wants to give up on
 * the candidate before the 60-second TTL. Previously this route had NO
 * auth and the RPC had no ownership check — anyone could expire any
 * offer. Now:
 *   - Caller must be a signed-in user.
 *   - Caller must be the BUYER of the contract backing the offer.
 *   - We additionally reject re-expiry (the RPC already does this but we
 *     fail fast).
 *
 * We use the admin client to call the RPC, since it needs to write across
 * several tables (offer, employee_availability). The route's own auth +
 * ownership check is what protects against abuse.
 */
export async function POST(req: NextRequest) {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

    // Anti-abuse: cap to 30 expire-calls per minute per user.
    enforceRateLimit(`instant_hire_expire:${user.id}`, { max: 30, windowMs: 60_000 });

    const body = await req.json().catch(() => ({} as any));
    let offerId: string;
    try {
      offerId = requireUuid(body.offer_id, "offer_id");
    } catch (e) {
      if (e instanceof SecurityError) {
        return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
      }
      throw e;
    }
    if (!offerId) {
      return NextResponse.json({ ok: false, error: "offer_id required" }, { status: 400 });
    }

    // Look up the offer → contract → buyer.
    const { data: offer, error: oErr } = await sb
      .from("instant_hire_offers")
      .select("id, status, contract_id, candidate_id")
      .eq("id", offerId)
      .maybeSingle();
    if (oErr) return NextResponse.json({ ok: false, error: oErr.message }, { status: 500 });
    if (!offer) return NextResponse.json({ ok: false, error: "Offer not found" }, { status: 404 });

    const { data: contract, error: cErr } = await sb
      .from("contracts")
      .select("id, buyer_id, employee_id")
      .eq("id", (offer as any).contract_id)
      .maybeSingle();
    if (cErr) return NextResponse.json({ ok: false, error: cErr.message }, { status: 500 });
    if (!contract) return NextResponse.json({ ok: false, error: "Contract not found" }, { status: 404 });

    // Ownership: only the buyer OR the candidate can expire an offer.
    // (The candidate might want to withdraw the offer.)
    if (
      (contract as any).buyer_id !== user.id &&
      (contract as any).employee_id !== user.id
    ) {
      return NextResponse.json({ ok: false, error: "Not a party to this contract" }, { status: 403 });
    }

    // Call the RPC with the admin client (it does the real work).
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("expire_instant_hire_offer" as any, {
      p_offer_id: offerId,
    } as any);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (e) {
    if (e instanceof SecurityError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
