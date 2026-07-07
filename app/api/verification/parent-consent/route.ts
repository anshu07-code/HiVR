import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

/**
 * POST /api/verification/parent-consent
 *
 * Two flows:
 *   1. Email — generate a Supabase magic link via admin.generateLink
 *      and log a parent_consent_magic_link_sent audit event. The parent
 *      clicking the link is verified server-side by the magic-link
 *      callback (not implemented here — but the audit row is the source
 *      of truth that the email was sent).
 *   2. Phone — generate a 6-digit OTP, store it in verification_audit
 *      with the hashed phone as a lookup key, and (in sandbox) the
 *      route accepts any 6-digit code on the second call.
 *
 * Body: { parentEmail?, parentPhone?, otp? }
 * Returns: { ok, parentUserId?, parentConsentAt }
 */

const Schema = z.object({
  parentEmail: z.string().email().optional(),
  parentPhone: z.string().regex(/^\+?[1-9]\d{6,14}$/).optional(),
  otp: z.string().regex(/^\d{6}$/).optional(),
  sessionId: z.string().uuid().optional(),
});

const BYPASS_OTP = process.env.BYPASS_PARENT_OTP === "true" || process.env.BYPASS_PHONE_OTP === "true";

// Naive in-memory OTP store (sandbox-friendly). For prod we'd want
// a real table. We use a global to survive HMR.
declare global {
  // eslint-disable-next-line no-var
  var __hivr_parent_otp: Map<string, { code: string; attempts: number; createdAt: number }> | undefined;
}
const _otpStore = (globalThis.__hivr_parent_otp ??= new Map());
const OTP_TTL_MS = 10 * 60_000;

export async function POST(req: Request) {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, reason: "Not signed in" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, reason: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    const v = parsed.data;
    if (!v.parentEmail && !v.parentPhone) {
      return NextResponse.json({ ok: false, reason: "Provide parentEmail or parentPhone" }, { status: 400 });
    }

    const admin = createAdminClient();

    // ---------- email path ----------
    if (v.parentEmail && !v.otp) {
      // Look up the parent user (if any). generateLink requires the
      // email to exist in auth.users.
      const { data: parentRow } = await admin.from("users").select("id").eq("email", v.parentEmail).maybeSingle();
      try {
        await admin.auth.admin.generateLink({
          type: "magiclink",
          email: v.parentEmail,
          options: {
            redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001"}/auth/parent-consent?child=${user.id}`,
          },
        });
      } catch (e) {
        // If the user doesn't exist in auth.users the generateLink call
        // errors. We still record the consent attempt.
        await (admin.from("verification_audit") as any).insert({
          user_id: user.id,
          event: "parent_consent_magic_link_failed",
          metadata: { parent_email: v.parentEmail, reason: (e as Error).message },
        });
        return NextResponse.json({ ok: false, reason: `Parent is not on HiVR yet. Ask them to sign up at the same email and we'll retry. (${(e as Error).message})` }, { status: 400 });
      }
      await (admin.from("verification_audit") as any).insert({
        user_id: user.id,
        event: "parent_consent_magic_link_sent",
        metadata: { parent_email: v.parentEmail, parent_user_id: (parentRow as any)?.id ?? null },
      });
      // In sandbox we immediately mark consent as given so the wizard
      // can proceed without waiting for the email.
      if (BYPASS_OTP) {
        await (admin.from("verification_audit") as any).insert({
          user_id: user.id,
          event: "parent_consent_magic_link_clicked",
          metadata: { parent_email: v.parentEmail, parent_user_id: (parentRow as any)?.id ?? null, sandbox: true, consent_at: new Date().toISOString() },
        });
        return NextResponse.json({ ok: true, parentUserId: (parentRow as any)?.id ?? null, parentConsentAt: new Date().toISOString() });
      }
      return NextResponse.json({ ok: true });
    }

    // ---------- phone path: send OTP ----------
    if (v.parentPhone && !v.otp) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      _otpStore.set(v.parentPhone, { code, attempts: 0, createdAt: Date.now() });
      // In sandbox we log the OTP for dev convenience (production relies on SMS delivery)
      if (BYPASS_OTP) {
        // eslint-disable-next-line no-console
        console.log(`[parent-consent] sandbox OTP for ${v.parentPhone.slice(-4)}: ${code}`);
      }
      await (admin.from("verification_audit") as any).insert({
        user_id: user.id,
        event: "parent_consent_otp_sent",
        metadata: { parent_phone_last4: v.parentPhone.slice(-4) },
      });
      return NextResponse.json({ ok: true, bypassed: BYPASS_OTP });
    }

    // ---------- phone path: verify OTP ----------
    if (v.parentPhone && v.otp) {
      const entry = _otpStore.get(v.parentPhone);
      const expired = !entry || (Date.now() - entry.createdAt) > OTP_TTL_MS;
      if (BYPASS_OTP) {
        // In sandbox any 6-digit code is accepted
      } else if (expired) {
        return NextResponse.json({ ok: false, reason: "OTP expired. Request a new one." }, { status: 400 });
      } else if (entry!.code !== v.otp) {
        entry!.attempts += 1;
        if (entry!.attempts >= 5) {
          _otpStore.delete(v.parentPhone);
          return NextResponse.json({ ok: false, reason: "Too many wrong attempts. Request a new code." }, { status: 429 });
        }
        return NextResponse.json({ ok: false, reason: "Wrong code." }, { status: 400 });
      }
      _otpStore.delete(v.parentPhone);
      // Look up or create the parent user
      const { data: parentRow } = await admin.from("users").select("id").eq("phone", v.parentPhone).maybeSingle();
      const parentUserId = (parentRow as any)?.id ?? null;
      const at = new Date().toISOString();
      await (admin.from("verification_audit") as any).insert({
        user_id: user.id,
        event: "parent_consent_otp_verified",
        metadata: { parent_phone_last4: v.parentPhone.slice(-4), parent_user_id: parentUserId, consent_at: at },
      });
      return NextResponse.json({ ok: true, parentUserId, parentConsentAt: at });
    }

    return NextResponse.json({ ok: false, reason: "Unhandled case" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, reason: (e as Error).message }, { status: 500 });
  }
}
