import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/interviews/result
 * Body: { booking_id: string, result: "passed" | "failed", notes?: string }
 * Caller must be the assigned interviewer, a panel member, or super admin.
 */
export async function POST(req: Request) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const bookingId = String(body.booking_id ?? "");
  const result = String(body.result ?? "");
  const notes = body.notes ? String(body.notes) : null;
  if (!bookingId) return NextResponse.json({ ok: false, error: "booking_id required" }, { status: 400 });
  if (result !== "passed" && result !== "failed") {
    return NextResponse.json({ ok: false, error: "result must be 'passed' or 'failed'" }, { status: 400 });
  }

  const { data, error } = await sb.rpc("upload_interview_result" as any, {
    p_booking_id: bookingId,
    p_result: result,
    p_notes: notes,
  } as any);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
