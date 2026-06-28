import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/interviews/available-slots
 * Query: ?slot_kind=tier_b|level_up&target_tier=...&category_id=...
 * Returns the list of open, future slots the current user can book.
 */
export async function GET(req: Request) {
  const sb = createClient();
  const url = new URL(req.url);
  const slotKind   = url.searchParams.get("slot_kind")   || null;
  const targetTier = url.searchParams.get("target_tier") || null;
  const categoryId = url.searchParams.get("category_id") || null;
  const limit      = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") ?? 30)));

  const { data, error } = await sb.rpc("get_available_interview_slots" as any, {
    p_slot_kind: slotKind,
    p_target_tier: targetTier,
    p_category_id: categoryId,
    p_limit: limit,
  } as any);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, slots: data });
}
