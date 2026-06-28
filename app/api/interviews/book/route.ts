import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/interviews/book
 * Body: { slot_id: string }
 * Books an open interview slot for the current user.
 */
export async function POST(req: Request) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const slotId = String(body.slot_id ?? "");
  if (!slotId) return NextResponse.json({ ok: false, error: "slot_id required" }, { status: 400 });

  const { data, error } = await sb.rpc("book_interview_slot" as any, { p_slot_id: slotId } as any);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  // The RPC returns jsonb; pull the booking id from it
  const bookingId = (data as any)?.booking_id ?? null;
  return NextResponse.json({ ok: true, booking_id: bookingId, ...(data as any) });
}
