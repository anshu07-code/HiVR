import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/profile/availability
 * Body: { status, available_until, declared_weekly_capacity }
 * Upserts the current user's employee_availability row.
 */
export async function POST(req: Request) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const status = String(body.status ?? "offline");
  if (!["offline", "available", "busy", "away", "dnd"].includes(status)) {
    return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400 });
  }
  const availableUntil = body.available_until ? new Date(body.available_until).toISOString() : null;
  const weeklyCapacity = Math.max(1, Math.min(168, Number(body.declared_weekly_capacity ?? 40)));

  // Also call the RPC so the heartbeat timestamps + status are updated
  // atomically. The RPC also returns the canonical snapshot.
  const { data, error } = await sb.rpc("ping_availability" as any, {
    p_status: status,
    p_available_until: availableUntil,
  } as any);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  await sb.from("employee_availability").update({
    declared_weekly_capacity: weeklyCapacity,
    updated_at: new Date().toISOString(),
  } as any).eq("user_id", user.id);

  return NextResponse.json({ ok: true, ...(data as any), declared_weekly_capacity: weeklyCapacity });
}
