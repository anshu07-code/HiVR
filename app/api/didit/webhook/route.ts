import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const decision = body as {
      session_id?: string;
      status?: string;
      vendor_data?: string | null;
      id_verification?: { status?: string; full_name?: string; date_of_birth?: string; document_number?: string } | null;
      liveness?: { status?: string; score?: number | null } | null;
      face_match?: { status?: string; score?: number | null } | null;
    };

    const userId = decision.vendor_data;
    if (!userId || !decision.session_id) {
      return NextResponse.json({ ok: false, error: "Missing vendor_data or session_id" }, { status: 400 });
    }

    const sb = createClient();

    if (decision.status === "approved" || decision.status === "completed") {
      const idv = decision.id_verification;
      const live = decision.liveness;
      const fm = decision.face_match;

      const metadata: Record<string, unknown> = {};
      if (idv) {
        metadata.aadhaar = idv.status === "approved";
        metadata.aadhaar_name = idv.full_name;
        metadata.aadhaar_dob = idv.date_of_birth;
      }
      if (live) metadata.liveness_score = live.score;
      if (fm) metadata.face_match_score = fm.score;

      await sb.from("verifications").upsert({
        user_id: userId,
        doc_type: "aadhaar",
        purpose: "employee",
        status: "verified",
        provider: "didit_session",
        verified_at: new Date().toISOString(),
        metadata,
        provider_reference_id: decision.session_id,
      } as any, { onConflict: "user_id, doc_type, purpose" });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Didit webhook error:", e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
