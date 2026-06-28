import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/interviews/slots/create
 * Body: {
 *   slot_kind: "tier_b" | "level_up",
 *   target_tier?: "verified" | "track_record" | "top_rated",
 *   category_id?: string,
 *   interviewer_id: string,    // panel member user id (or self)
 *   scheduled_at: string,      // ISO timestamp
 *   duration_min?: number,
 *   max_bookings?: number,
 *   meeting_url?: string,
 *   notes?: string
 * }
 * Caller must be a panel member, the assigned interviewer, or super admin.
 */
export async function POST(req: Request) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const slot_kind = String(body.slot_kind ?? "");
  const target_tier = body.target_tier ?? null;
  const category_id = body.category_id ?? null;
  const interviewer_id = String(body.interviewer_id ?? user.id);
  const scheduled_at = String(body.scheduled_at ?? "");
  const duration_min = Math.max(15, Math.min(180, Number(body.duration_min ?? 30)));
  const max_bookings = Math.max(1, Math.min(20, Number(body.max_bookings ?? 1)));
  const meeting_url = body.meeting_url ? String(body.meeting_url) : null;
  const notes = body.notes ? String(body.notes) : null;

  if (!["tier_b", "level_up"].includes(slot_kind)) {
    return NextResponse.json({ ok: false, error: "slot_kind must be tier_b or level_up" }, { status: 400 });
  }
  if (!scheduled_at || isNaN(Date.parse(scheduled_at))) {
    return NextResponse.json({ ok: false, error: "scheduled_at must be a valid ISO timestamp" }, { status: 400 });
  }
  if (slot_kind === "level_up" && !["verified", "track_record", "top_rated"].includes(target_tier)) {
    return NextResponse.json({ ok: false, error: "level-up slots require target_tier" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.from("interview_slots").insert({
    slot_kind,
    target_tier,
    category_id,
    interviewer_id,
    scheduled_at,
    duration_min,
    max_bookings,
    meeting_url,
    notes,
    status: "open",
  } as any).select("id").single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, slot_id: (data as any).id });
}
