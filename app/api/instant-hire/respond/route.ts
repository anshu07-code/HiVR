import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  SecurityError,
  requireUuid,
  requirePaiseAmount,
  MAX_CONTRACT_AMOUNT_PAISE,
  enforceRateLimit,
} from "@/lib/security";

/**
 * POST /api/instant-hire/respond
 * Body: {
 *   offer_id: string,
 *   response: 'accept' | 'decline' | 'counter',
 *   counter_rate_paise?: number,    // required if response='counter'
 *   decline_reason?: string
 * }
 * The candidate calls this. Counter requires a positive rate; 3 rounds max.
 *
 * Security:
 *   - Caller must be signed in.
 *   - offer_id must be a valid UUID.
 *   - counter_rate_paise (when counter) must be a positive integer ≤
 *     MAX_CONTRACT_AMOUNT_PAISE.
 *   - Per-user rate limit: 30/min (this is a low-risk action, just
 *     defending against runaway clients).
 */
const MAX_DECLINE_REASON_LEN = 500;

export async function POST(req: Request) {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

    enforceRateLimit(`instant_hire_respond:${user.id}`, { max: 30, windowMs: 60_000 });

    const body = await req.json().catch(() => ({}));
    let offerId: string;
    try {
      offerId = requireUuid(body.offer_id, "offer_id");
    } catch (e) {
      if (e instanceof SecurityError) {
        return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
      }
      throw e;
    }
    const response = String(body.response ?? "");
    if (!["accept", "decline", "counter"].includes(response)) {
      return NextResponse.json({ ok: false, error: "response must be accept/decline/counter" }, { status: 400 });
    }
    let counterRate: number | null = null;
    if (response === "counter") {
      try {
        counterRate = requirePaiseAmount(body.counter_rate_paise, "counter_rate_paise");
        if (counterRate > MAX_CONTRACT_AMOUNT_PAISE) {
          return NextResponse.json({ ok: false, error: `counter_rate_paise exceeds max (${MAX_CONTRACT_AMOUNT_PAISE})` }, { status: 400 });
        }
      } catch (e) {
        if (e instanceof SecurityError) {
          return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
        }
        throw e;
      }
    }
    const declineReason = body.decline_reason ? String(body.decline_reason) : null;
    if (declineReason && declineReason.length > MAX_DECLINE_REASON_LEN) {
      return NextResponse.json({ ok: false, error: `decline_reason too long (max ${MAX_DECLINE_REASON_LEN} chars)` }, { status: 400 });
    }

    const { data, error } = await sb.rpc("respond_instant_hire_offer" as any, {
      p_offer_id: offerId,
      p_response: response,
      p_counter_rate_paise: counterRate,
      p_decline_reason: declineReason,
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
