import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

/**
 * POST /api/verification/start
 *
 * Body: { kind, dob }
 *   kind: one of public.verification_kind
 *   dob : ISO date string (YYYY-MM-DD)
 *
 * Calls the start_verification_session RPC. Returns the session id and
 * a flag indicating whether the user is a minor (so the client can
 * branch into the minor flow).
 */

const Schema = z.object({
  kind: z.enum([
    "adult_aadhaar", "adult_pan", "adult_passport", "adult_dl",
    "minor_school_id", "minor_aadhaar", "minor_parent_aadhaar",
  ]),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "DOB must be YYYY-MM-DD"),
});

export async function POST(req: Request) {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }

    const { data, error } = await (sb.rpc as any)("start_verification_session", {
      p_kind: parsed.data.kind,
      p_dob: parsed.data.dob,
    });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    const result = (data as any) ?? {};
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error ?? "Failed to start session" }, { status: 400 });

    return NextResponse.json({
      ok: true,
      session_id: result.session_id,
      is_minor: !!result.is_minor,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
