import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

/**
 * POST /api/verification/submit
 *
 * Finalises a verification session. The client sends the OCR data,
 * liveness scores, and (for minors) parent consent + FAMPay info.
 * The server calls submit_verification_session which is the source of
 * truth for the confidence breakdown and the final status.
 *
 * Production:
 *   * `sandbox` is rejected unless ALLOW_SANDBOX_VERIFY=true is set in
 *     the env (dev convenience only — must never be on in prod)
 *   * `aadhaarQrVerified: true` causes the RPC to use the signed
 *     name/DOB as authoritative and skip fuzzy matching.
 */

const LivenessSchema = z.object({
  face_score: z.number().min(0).max(100).optional(),
  name_score: z.number().min(0).max(100).optional(),
  liveness_score: z.number().min(0).max(100).optional(),
  doc_validity: z.number().min(0).max(100).optional(),
  aadhaar_qr_verified: z.boolean().optional(),
  challenges: z.array(z.object({
    prompt: z.string(),
    detected: z.boolean(),
    score: z.number(),
  })).optional(),
});

const Schema = z.object({
  sessionId: z.string().uuid(),
  ocrFullName: z.string().min(0).max(200).optional(),
  ocrDob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  ocrDocumentNumber: z.string().min(0).max(40).optional(),
  ocrDocumentHash: z.string().max(64).optional(),
  selfieHash: z.string().max(64).optional(),
  livenessChallenges: LivenessSchema,
  fampayHandle: z.string().max(60).optional(),
  parentEmail: z.string().email().optional(),
  parentPhone: z.string().max(20).optional(),
  otp: z.string().max(6).optional(),
  sandbox: z.boolean().optional(),
  aadhaarQrVerified: z.boolean().optional(),
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
    const v = parsed.data;

    // Production guard: sandbox is for dev only. If a user somehow
    // toggles the Dev: skip checks checkbox, the server refuses to
    // skip the real flow.
    if (v.sandbox && process.env.ALLOW_SANDBOX_VERIFY !== "true") {
      return NextResponse.json({ ok: false, error: "Sandbox mode is disabled in this environment" }, { status: 403 });
    }

    // 1. Look up the session to get its kind + dob (for routing to the
    //    right minor vs adult path)
    const { data: session } = await sb
      .from("verification_sessions")
      .select("id, kind, status, dob, user_id")
      .eq("id", v.sessionId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!session) {
      return NextResponse.json({ ok: false, error: "Session not found" }, { status: 404 });
    }
    const sessionRow = session as any;
    if (sessionRow.status !== "in_progress") {
      return NextResponse.json({ ok: false, error: "Session is " + sessionRow.status }, { status: 400 });
    }

    // 2. If this is a minor (13-14) we may need parent consent. Look
    //    for a verified OTP or a magic-link click recorded in
    //    verification_audit by parent-consent route.
    let parentConsentAt: string | null = null;
    let parentUserId: string | null = null;
    if (v.parentEmail || v.parentPhone) {
      const admin = createAdminClient();
      const { data: ev } = await admin
        .from("verification_audit")
        .select("event, metadata, created_at")
        .eq("session_id", v.sessionId)
        .in("event", ["parent_consent_otp_verified", "parent_consent_magic_link_clicked"])
        .order("created_at", { ascending: false })
        .limit(1);
      if (ev && ev.length > 0) {
        parentConsentAt = (ev[0] as any).created_at;
        parentUserId = (ev[0] as any).metadata?.parent_user_id ?? null;
      } else if (v.parentEmail && v.sandbox) {
        // In sandbox we accept the email without a magic link
        parentConsentAt = new Date().toISOString();
      } else if (v.parentPhone && v.otp && v.sandbox) {
        parentConsentAt = new Date().toISOString();
      }
    }

    // 3. If dob was set on the session, also auto-consent a 15+ minor
    if (!parentConsentAt) {
      const { data: u } = await sb.from("users").select("is_minor, dob").eq("id", user.id).maybeSingle();
      const uRow = u as any;
      if (uRow?.dob) {
        const age = (Date.now() - new Date(uRow.dob).getTime()) / (365.25 * 24 * 3600 * 1000);
        if (age >= 15 && age < 18) {
          parentConsentAt = new Date().toISOString();
        }
      }
    }

    // 4. Pack the liveness challenges + scores into a single JSONB
    //    object that the RPC understands.
    const challengesJson = {
      challenges: v.livenessChallenges.challenges ?? [],
      face_score: v.livenessChallenges.face_score ?? 0,
      name_score: v.livenessChallenges.name_score ?? 0,
      liveness_score: v.livenessChallenges.liveness_score ?? 0,
      doc_validity: v.livenessChallenges.doc_validity ?? 0,
      aadhaar_qr_verified: !!v.aadhaarQrVerified,
    };

    // 5. Call the RPC
    const { data, error } = await (sb.rpc as any)("submit_verification_session", {
      p_session_id: v.sessionId,
      p_ocr_full_name: v.ocrFullName ?? null,
      p_ocr_dob: v.ocrDob || null,
      p_ocr_document_number: v.ocrDocumentNumber ?? null,
      p_ocr_document_hash: v.ocrDocumentHash ?? null,
      p_selfie_hash: v.selfieHash ?? null,
      p_liveness_challenges: challengesJson,
      p_fampay_handle: v.fampayHandle ?? null,
      p_parent_email: v.parentEmail ?? null,
      p_parent_consent_at: parentConsentAt,
      p_parent_user_id: parentUserId,
      p_sandbox: v.sandbox ?? false,
    });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    const result = (data as any) ?? {};
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error ?? "Failed" }, { status: 400 });

    return NextResponse.json({
      ok: true,
      status: result.status,
      confidence: result.confidence,
      is_minor: !!result.is_minor,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
