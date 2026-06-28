import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

/**
 * POST /api/phone/send-otp
 *
 * Sends a 6-digit OTP to the signed-in user's phone via Supabase Auth.
 * Supabase Auth handles rate limiting per phone by default.
 *
 * In production, the project must have a phone provider configured
 * (Twilio, MessageBird, Vonage, etc.) and the `EXPOSE_PHONE_NUMBER` flag
 * enabled on the auth config. In sandbox, OTP is not actually sent —
 * Supabase returns an error like "phone provider not configured" if the
 * project isn't set up. The client surfaces a clear message in that
 * case.
 *
 * The phone number must already be on the user record (set at signup
 * via the `phone` field in the public.users row). We update the auth
 * user via `updateUserById` so the OTP gets sent to the right place.
 */

const Schema = z.object({
  phone: z.string().regex(/^\+?[1-9]\d{6,14}$/, "Use international format: +91XXXXXXXXXX"),
});

const RATE_LIMIT_WINDOW_MS = 5 * 60_000;
const RATE_LIMIT_MAX = 3;

export async function POST(req: Request) {
  try {
    const sb = createClient();
    // Try getUser first; fall back to getSession if needed. Some
    // Supabase configurations (especially after email confirmation)
    // may need a moment for the session to be reflected server-side.
    let { data: { user } } = await sb.auth.getUser();
    if (!user) {
      const { data: { session } } = await sb.auth.getSession();
      user = session?.user ?? null;
    }
    if (!user) return NextResponse.json({ ok: false, reason: "Not signed in" }, { status: 401 });

    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, reason: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }

    // ============================================================
    // DEV BYPASS: when BYPASS_PHONE_OTP=true is set, skip the real
    // SMS send. The verify route accepts any 6-digit code, and the
    // client surfaces a clear "sandbox" notice. NEVER enable this
    // in production.
    // ============================================================
    if (process.env.BYPASS_PHONE_OTP === "true") {
      return NextResponse.json({
        ok: true,
        phone: parsed.data.phone,
        bypassed: true,
        message: "Sandbox mode: any 6-digit code is accepted. Set BYPASS_PHONE_OTP=false in production.",
      });
    }

    // Anti-spam: cap the number of OTP requests per 5 minutes.
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { count: recent } = await sb
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("type", "phone_otp_request")
      .gte("created_at", since);
    if ((recent ?? 0) >= RATE_LIMIT_MAX) {
      return NextResponse.json({ ok: false, reason: "Too many OTP requests. Please wait 5 minutes and try again." }, { status: 429 });
    }

    // Update the user's phone in auth if it has changed.
    if (user.phone !== parsed.data.phone) {
      const { error: upErr } = await sb.auth.updateUser({ phone: parsed.data.phone });
      if (upErr) return NextResponse.json({ ok: false, reason: upErr.message }, { status: 400 });
    }

    // Send the OTP. The `signInWithOtp` call sends an SMS to the phone
    // and (in dev) logs the code to the Supabase dashboard logs.
    const { error } = await sb.auth.signInWithOtp({ phone: parsed.data.phone });
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("phone provider") || msg.includes("twilio") || msg.includes("not configured")) {
        return NextResponse.json({ ok: false, reason: "Phone OTP isn't enabled in this Supabase project yet. Enable it in Authentication → Providers → Phone. (Free tier: Twilio trial has its own limits.)", needsProviderSetup: true }, { status: 503 });
      }
      return NextResponse.json({ ok: false, reason: error.message }, { status: 400 });
    }

    // Log the attempt for anti-fraud monitoring. Best-effort.
    try {
      await sb.rpc("create_notification" as any, {
        p_user_id: user.id,
        p_type: "phone_otp_request",
        p_title: "Phone OTP sent",
        p_body: `OTP sent to ${parsed.data.phone.slice(0, 4)}****${parsed.data.phone.slice(-2)}.`,
        p_link: "/dashboard",
      });
    } catch { /* non-fatal */ }

    return NextResponse.json({ ok: true, phone: parsed.data.phone });
  } catch (e) {
    return NextResponse.json({ ok: false, reason: (e as Error).message }, { status: 500 });
  }
}
