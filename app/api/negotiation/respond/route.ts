import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  SecurityError,
  requireUuid,
  requirePaiseAmount,
  MAX_CONTRACT_AMOUNT_PAISE,
  enforceRateLimit,
} from "@/lib/security";

const MAX_COMMENT_LEN = 1000;

/**
 * POST /api/negotiation/respond
 *   body: { negotiationOfferId, response: "accept" | "decline" | "counter" | "pushback", comment?, revisedPricePaise? }
 *
 * Routes to the right RPC based on the offer_type + the current user's role.
 */
export async function POST(req: NextRequest) {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    enforceRateLimit(`negotiation_respond:${user.id}`, { max: 30, windowMs: 60_000 });

    const body = await req.json().catch(() => ({}));
    let negotiationOfferId: string;
    try {
      negotiationOfferId = requireUuid(body.negotiationOfferId, "negotiationOfferId");
    } catch (e) {
      if (e instanceof SecurityError) {
        return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
      }
      throw e;
    }
    const response = String(body.response ?? "");
    if (!response) {
      return NextResponse.json({ ok: false, error: "response required" }, { status: 400 });
    }
    const comment = body.comment ? String(body.comment) : null;
    if (comment && comment.length > MAX_COMMENT_LEN) {
      return NextResponse.json({ ok: false, error: `comment too long (max ${MAX_COMMENT_LEN} chars)` }, { status: 400 });
    }
    let revisedPricePaise: number | null = null;
    if (body.revisedPricePaise != null && body.revisedPricePaise !== "") {
      try {
        revisedPricePaise = requirePaiseAmount(body.revisedPricePaise, "revisedPricePaise");
      } catch (e) {
        if (e instanceof SecurityError) {
          return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
        }
        throw e;
      }
      if (revisedPricePaise > MAX_CONTRACT_AMOUNT_PAISE) {
        return NextResponse.json({ ok: false, error: `revisedPricePaise exceeds max (${MAX_CONTRACT_AMOUNT_PAISE})` }, { status: 400 });
      }
    }

    const { data: offer } = await sb
      .from("negotiation_offers")
      .select("id, offer_type, buyer_id, employee_id, status")
      .eq("id", negotiationOfferId)
      .maybeSingle();
    if (!offer) return NextResponse.json({ ok: false, error: "Offer not found" }, { status: 404 });
    const o = offer as any;
    const isBuyer = o.buyer_id === user.id;
    const isEmployee = o.employee_id === user.id;
    if (!isBuyer && !isEmployee) {
      return NextResponse.json({ ok: false, error: "Not your offer" }, { status: 403 });
    }

    if (o.offer_type === "instant_hire_pushback") {
      if (isEmployee) {
        const r = String(response).toLowerCase();
        const normalized = r === "counter" ? "pushback" : r;
        const { data, error } = await (sb.rpc as any)("respond_instant_hire_offer", {
          p_negotiation_offer_id: negotiationOfferId,
          p_response: normalized,
          p_comment: comment,
          p_revised_price_paise: revisedPricePaise,
        });
        if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        if (!data || data.ok === false) return NextResponse.json({ ok: false, error: data?.error ?? "Failed" }, { status: 400 });
        return NextResponse.json(data);
      }
      const r = String(response).toLowerCase();
      const normalized = r === "counter" ? "accept" : r;
      const { data, error } = await (sb.rpc as any)("respond_buyer_pushback", {
        p_negotiation_offer_id: negotiationOfferId,
        p_response: normalized,
        p_comment: comment,
      });
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      if (!data || data.ok === false) return NextResponse.json({ ok: false, error: data?.error ?? "Failed" }, { status: 400 });
      return NextResponse.json(data);
    }

    if (o.offer_type === "custom_scope_negotiation") {
      if (isEmployee) {
        const { data, error } = await (sb.rpc as any)("counter_custom_offer", {
          p_negotiation_offer_id: negotiationOfferId,
          p_response: response,
          p_counter_price: revisedPricePaise,
          p_comment: comment,
        });
        if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        if (!data || data.ok === false) return NextResponse.json({ ok: false, error: data?.error ?? "Failed" }, { status: 400 });
        return NextResponse.json(data);
      }
      const r = String(response).toLowerCase();
      const normalized = r === "counter" ? "accept" : r;
      const { data, error } = await (sb.rpc as any)("respond_buyer_pushback", {
        p_negotiation_offer_id: negotiationOfferId,
        p_response: normalized,
        p_comment: comment,
      });
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      if (!data || data.ok === false) return NextResponse.json({ ok: false, error: data?.error ?? "Failed" }, { status: 400 });
      return NextResponse.json(data);
    }

    return NextResponse.json({ ok: false, error: "Unknown offer type" }, { status: 400 });
  } catch (e) {
    if (e instanceof SecurityError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
