import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/security";
import {
  createRazorpayOrder,
  verifyRazorpaySignature,
  isRazorpayConfigured,
} from "@/lib/razorpay";

/**
 * POST /api/wallet/add-funds
 *
 * Two-step flow for adding money to the HiVR wallet:
 *
 *   1. POST { step: "create", amountPaise: 50000 } → creates a Razorpay
 *      order, returns { orderId, keyId, amount, currency }. Client opens
 *      the Razorpay checkout with these.
 *
 *   2. After user pays, client POSTs back with
 *      { step: "verify", orderId, paymentId, signature, amountPaise }.
 *      We verify the HMAC-SHA256 signature and call wallet_add_funds
 *      RPC to credit the balance.
 */

const MIN_AMOUNT_PAISE = 100 * 100;        // ₹100
const MAX_AMOUNT_PAISE = 100_000 * 100;   // ₹1,00,000

export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  enforceRateLimit(`wallet_add_funds:${user.id}`, { max: 10, windowMs: 60_000 });

  const body = await req.json().catch(() => ({}));
  const step = String(body.step ?? "");
  const amountPaise = Number(body.amountPaise ?? 0);
  const orderId = body.orderId ? String(body.orderId) : null;
  const paymentId = body.paymentId ? String(body.paymentId) : null;
  const signature = body.signature ? String(body.signature) : null;

  if (step === "create") {
    if (!Number.isFinite(amountPaise) || amountPaise < MIN_AMOUNT_PAISE || amountPaise > MAX_AMOUNT_PAISE) {
      return NextResponse.json({ ok: false, error: `Amount must be between ₹${MIN_AMOUNT_PAISE / 100} and ₹${MAX_AMOUNT_PAISE / 100}` }, { status: 400 });
    }
    if (!isRazorpayConfigured()) {
      return NextResponse.json({ ok: false, error: "Razorpay keys not configured" }, { status: 503 });
    }
    try {
      const order = await createRazorpayOrder(
        amountPaise,
        `wlt_${user.id.slice(0, 8)}_${Date.now()}`,
        { user_id: user.id, purpose: "wallet_add_funds" }
      );
      return NextResponse.json({
        ok: true,
        orderId: order.id,
        keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? process.env.RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: order.currency,
      });
    } catch (e) {
      return NextResponse.json({ ok: false, error: (e as Error).message ?? "Could not create Razorpay order" }, { status: 502 });
    }
  }

  if (step === "verify") {
    if (!orderId || !paymentId || !signature) {
      return NextResponse.json({ ok: false, error: "Missing payment fields" }, { status: 400 });
    }
    if (!verifyRazorpaySignature(orderId, paymentId, signature)) {
      return NextResponse.json({ ok: false, error: "Invalid payment signature" }, { status: 400 });
    }
    // Sign valid — credit the wallet
    const { data, error } = await sb.rpc("wallet_add_funds" as any, {
      p_user_id: user.id,
      p_amount_paise: amountPaise,
      p_razorpay_order_id: orderId,
      p_razorpay_payment_id: paymentId,
    } as any);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    const result = data as any;
    if (!result?.ok) return NextResponse.json({ ok: false, error: result?.error ?? "Failed" }, { status: 400 });
    return NextResponse.json({ ok: true, balance: result.balance });
  }

  return NextResponse.json({ ok: false, error: "Invalid step" }, { status: 400 });
}
