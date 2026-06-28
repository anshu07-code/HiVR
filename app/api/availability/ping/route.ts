import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/availability/ping
 * Body (all optional):
 *   { status: 'available'|'busy'|'away'|'dnd'|'offline',
 *     available_until: ISOString | null }
 * The client calls this every ~30s while the dashboard is open.
 * The RPC updates last_ping_at, status, and returns the snapshot.
 */
export async function POST(req: Request) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const status = body?.status ? String(body.status) : null;
  const availableUntil = body?.available_until ? new Date(body.available_until).toISOString() : null;

  const { data, error } = await sb.rpc("ping_availability" as any, {
    p_status: status,
    p_available_until: availableUntil,
  } as any);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
