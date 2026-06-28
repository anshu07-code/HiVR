import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SecurityError, checkSameOrigin, enforceRateLimit } from "@/lib/security";
import { hashPassword, generateOtpCode, hashOtpCode } from "@/lib/crypto";
import { writeChangePasswordAudit } from "@/lib/audit";
import { sendOtpEmail } from "@/lib/email";

const OTP_TTL_MS = 10 * 60 * 1000;

const otpStore = new Map<string, { codeHash: string; expiresAt: number; verified: boolean }>();

export async function POST(req: NextRequest) {
  try {
    const sameOriginError = checkSameOrigin(req);
    if (sameOriginError) return sameOriginError;

    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

    enforceRateLimit(`change_password:${user.id}`, { max: 5, windowMs: 60_000 });

    const body = await req.json().catch(() => ({}));
    const step = body.step === "request" ? "request" : body.step === "verify" ? "verify" : null;

    if (!step) {
      return NextResponse.json({ ok: false, error: "step must be 'request' or 'verify'" }, { status: 400 });
    }

    const admin = createAdminClient();
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();

    if (step === "request") {
      const { data: me } = await admin
        .from("users")
        .select("email")
        .eq("id", user.id)
        .maybeSingle();

      const email = (me as any)?.email;
      if (!email) {
        return NextResponse.json({ ok: false, error: "No email on file for OTP delivery" }, { status: 400 });
      }

      const code = generateOtpCode();
      const codeHash = hashOtpCode(code);
      const expiresAt = Date.now() + OTP_TTL_MS;

      otpStore.set(`change_pw:${user.id}`, { codeHash, expiresAt, verified: false });

      const result = await sendOtpEmail(email, code);
      await writeChangePasswordAudit(user.id, "email_otp_sent", { email }, ip);

      if (!result.ok) {
        console.error(`[change-password] Failed to send OTP: ${result.error}`);
      }

      return NextResponse.json({ ok: true, message: "OTP sent to your email" });
    }

    const otp = String(body.otp ?? "").trim();
    const newPassword = String(body.newPassword ?? "");

    if (!otp || otp.length !== 6 || !/^\d{6}$/.test(otp)) {
      return NextResponse.json({ ok: false, error: "Invalid OTP format" }, { status: 400 });
    }

    if (!newPassword || newPassword.length < 8 || newPassword.length > 128) {
      return NextResponse.json({ ok: false, error: "New password must be 8-128 characters" }, { status: 400 });
    }

    const stored = otpStore.get(`change_pw:${user.id}`);
    if (!stored) {
      return NextResponse.json({ ok: false, error: "No OTP requested. Start again." }, { status: 400 });
    }

    if (Date.now() > stored.expiresAt) {
      otpStore.delete(`change_pw:${user.id}`);
      return NextResponse.json({ ok: false, error: "OTP has expired. Request a new one." }, { status: 400 });
    }

    const otpHash = hashOtpCode(otp);
    if (otpHash !== stored.codeHash) {
      await writeChangePasswordAudit(user.id, "password_change_failed", { reason: "wrong_otp" }, ip);
      return NextResponse.json({ ok: false, error: "Incorrect OTP" }, { status: 401 });
    }

    stored.verified = true;

    const { error: pwError } = await sb.rpc("reset_user_password" as any, {
      p_email: (await admin.from("users").select("email").eq("id", user.id).single() as any).data.email,
      p_new_password: newPassword,
      p_code: otp,
    } as any);

    if (pwError) {
      return NextResponse.json({ ok: false, error: pwError.message }, { status: 500 });
    }

    otpStore.delete(`change_pw:${user.id}`);

    await writeChangePasswordAudit(user.id, "password_changed", {}, ip);

    return NextResponse.json({ ok: true, message: "Password changed successfully" });
  } catch (e) {
    if (e instanceof SecurityError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
