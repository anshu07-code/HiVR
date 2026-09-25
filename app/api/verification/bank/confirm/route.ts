import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { fetchPaymentStatus, normaliseRefCode } from "@/lib/razorpay-upi";

const Schema = z.object({
  bankVerificationId: z.string().uuid(),
  code: z.string().min(1).max(16),
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

    // Look up the bank_verification to check provider
    const { data: bv } = await (sb.from("bank_verifications") as any)
      .select("id, status, payment_provider, payment_link_id, sandbox_code, expires_at")
      .eq("id", parsed.data.bankVerificationId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!bv) return NextResponse.json({ ok: false, error: "Verification not found" }, { status: 404 });
    if (bv.expires_at && new Date(bv.expires_at) < new Date()) {
      return NextResponse.json({ ok: false, error: "Verification expired. Start a new one." }, { status: 400 });
    }

    const code = normaliseRefCode(parsed.data.code) ?? parsed.data.code.trim().toUpperCase();

    // Razorpay flow: check payment status via Razorpay API
    let razorpayPaymentId: string | null = null;
    if (bv.payment_provider === "razorpay" && bv.payment_link_id) {
      const status = await fetchPaymentStatus(bv.payment_link_id, code);
      if (!status.paid) {
        return NextResponse.json({
          ok: false,
          error: "Payment not yet received. Please complete the ₹1 payment and try again.",
        }, { status: 400 });
      }
      razorpayPaymentId = status.paymentId;
    }

    const { data, error } = await (sb.rpc as any)("confirm_bank_verification", {
      p_bank_verification_id: parsed.data.bankVerificationId,
      p_code: code,
      p_payment_id: razorpayPaymentId,
    });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    const result = (data as any) ?? {};
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error ?? "Failed to verify" }, { status: 400 });

    return NextResponse.json({
      ok: true,
      status: result.status,
      last4: result.last4,
      upi_provider: result.upi_provider,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
