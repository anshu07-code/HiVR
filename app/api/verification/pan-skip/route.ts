import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/verification/pan-skip
 *
 * Records that the user explicitly skipped PAN verification. The PAN
 * session is left in_progress and will auto-expire (its TTL is short);
 * we just add an audit entry so admins can see why PAN was skipped.
 *
 * Body: { sessionId: string }
 */

export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const sessionId = String(body.sessionId ?? "");
  if (!sessionId) return NextResponse.json({ ok: false, error: "sessionId required" }, { status: 400 });

  // Verify the session belongs to this user
  const { data: session, error: sErr } = await sb
    .from("verification_sessions")
    .select("id, kind, user_id, status")
    .eq("id", sessionId)
    .maybeSingle();
  if (sErr) return NextResponse.json({ ok: false, error: sErr.message }, { status: 500 });
  const row = session as any;
  if (!row) return NextResponse.json({ ok: false, error: "Session not found" }, { status: 404 });
  if (row.user_id !== user.id) return NextResponse.json({ ok: false, error: "Not your session" }, { status: 403 });
  if (row.status !== "in_progress") {
    return NextResponse.json({ ok: true, note: "Session already finalised" });
  }

  // Audit log entry — service_role bypasses the verification_audit RLS
  const admin = createAdminClient();
  await (admin.from("verification_audit") as any).insert({
    user_id: user.id,
    session_id: sessionId,
    event: "pan_skipped",
    metadata: {
      reason: "User opted to skip PAN. PAN is only required for payouts > ₹30,000/year (TDS rule).",
    },
  });

  return NextResponse.json({ ok: true });
}
