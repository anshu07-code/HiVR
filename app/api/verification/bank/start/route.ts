import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { isValidUpiHandle, upiProvider, generateRefCode, formatNote, createUpiPaymentLink } from "@/lib/razorpay-upi";

const Schema = z.object({
  upiId: z.string().min(3).max(80),
  accountHolder: z.string().min(2).max(120),
  ifsc: z.string().min(11).max(11),
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

    const upiId = parsed.data.upiId.trim().toLowerCase();
    if (!isValidUpiHandle(upiId)) {
      return NextResponse.json({ ok: false, error: "UPI ID doesn't look valid (e.g. name@bank)." }, { status: 400 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const refCode = generateRefCode();

    // Create the Razorpay payment link (in sandbox/bypass mode it fabricates locally)
    const link = await createUpiPaymentLink({
      userId: user.id,
      upiId,
      refCode,
      callbackUrl: `${appUrl}/onboarding/verify`,
    });

    const rpcParams: Record<string, string> = {
      p_upi_id: upiId,
      p_account_holder: parsed.data.accountHolder.trim(),
      p_ifsc: parsed.data.ifsc.trim().toUpperCase(),
      p_ref_code: refCode,
    };
    if (!link.bypassed) {
      rpcParams.p_payment_link_id = link.paymentLinkId;
    }
    const { data, error } = await (sb.rpc as any)("start_bank_verification", rpcParams);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    const result = (data as any) ?? {};
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error ?? "Failed to start" }, { status: 400 });

    return NextResponse.json({
      ok: true,
      bank_verification_id: result.bank_verification_id,
      sandbox_code: result.sandbox_code,
      amount_paise: result.amount_paise,
      expires_at: result.expires_at,
      provider: result.provider,
      payment_link_url: link.shortUrl,
      note: link.note,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
