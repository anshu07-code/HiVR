import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

/**
 * POST /api/phone/verify-otp
 *
 * Verifies the OTP the user received and, on success, flips
 * `users.phone_verified` to true. We trust Supabase's verifyOtp as the
 * ground truth — if the code is correct, Supabase itself marks the
 * phone as confirmed.
 */

const Schema = z.object({
  phone: z.string().regex(/^\+?[1-9]\d{6,14}$/),
  token: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
});

export async function POST(req: Request) {
  try {
    const sb = createClient();
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
    // DEV BYPASS: accept any 6-digit code, set the phone on the user
    // row + flip phone_verified, and persist it. Never enable in prod.
    // ============================================================
    if (process.env.BYPASS_PHONE_OTP === "true") {
      // We need to set phone_confirmed_at on auth.users so Supabase's
      // own session reflects the verified state. The regular
      // createClient() doesn't have permission to do this; we use
      // the admin client.
      try {
        const admin = createAdminClient();
        await admin.auth.admin.updateUserById(user.id, {
          phone: parsed.data.phone,
          phone_confirm: true,
        } as any);
      } catch (e) {
        console.warn("[verify-otp] admin updateUserById failed (non-fatal in bypass):", (e as Error).message);
      }
      await sb.from("users").update({
        phone: parsed.data.phone,
        phone_verified: true,
      }).eq("id", user.id);
      return NextResponse.json({ ok: true, phone: parsed.data.phone, bypassed: true });
    }

    const { error } = await sb.auth.verifyOtp({ phone: parsed.data.phone, token: parsed.data.token, type: "sms" });
    if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 400 });

    // Mark phone verified in the public.users row.
    await sb.from("users").update({ phone_verified: true }).eq("id", user.id);

    return NextResponse.json({ ok: true, phone: parsed.data.phone });
  } catch (e) {
    return NextResponse.json({ ok: false, reason: (e as Error).message }, { status: 500 });
  }
}
