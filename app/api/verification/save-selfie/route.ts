import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

    const { diditSessionId, livenessScore, status } = await req.json();
    const sessionStatus = status === "admin_review" ? "admin_review" : "auto_approved";

    const { error } = await sb.from("verification_sessions").insert({
      user_id: user.id,
      kind: "adult_selfie",
      status: sessionStatus,
      confidence_score: Math.round(livenessScore ?? 0),
      metadata: { didit_session_id: diditSessionId, liveness_score: livenessScore },
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    } as any);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
