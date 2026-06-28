import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/interviews/cancel
 * Body: { booking_id, reason? }
 * Cancels a booking the current user owns. Within-24h cancellations
 * are allowed but flagged (may affect level-up eligibility).
 */
export async function POST(req: Request) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const bookingId = String(body.booking_id ?? "");
  const reason = body.reason ? String(body.reason) : null;
  if (!bookingId) return NextResponse.json({ ok: false, error: "booking_id required" }, { status: 400 });

  const { data, error } = await sb.rpc("cancel_my_booking" as any, {
    p_booking_id: bookingId,
    p_reason: reason,
  } as any);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
