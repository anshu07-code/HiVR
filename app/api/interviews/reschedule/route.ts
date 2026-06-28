import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/interviews/reschedule
 * Body: { booking_id, new_slot_id, reason? }
 * Cancels the old booking and books the new slot atomically.
 */
export async function POST(req: Request) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const bookingId  = String(body.booking_id  ?? "");
  const newSlotId  = String(body.new_slot_id ?? "");
  const reason     = body.reason ? String(body.reason) : null;
  if (!bookingId || !newSlotId) {
    return NextResponse.json({ ok: false, error: "booking_id and new_slot_id required" }, { status: 400 });
  }

  const { data, error } = await sb.rpc("reschedule_my_booking" as any, {
    p_booking_id: bookingId,
    p_new_slot_id: newSlotId,
    p_reason: reason,
  } as any);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
