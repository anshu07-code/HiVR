/**
 * Razorpay Payouts (for releasing milestone payments to employees).
 *
 * Sandbox behaviour: when RAZORPAY_KEY_ID is a placeholder ("rzp_test_..." with
 * "your-key-id") or BYPASS_RAZORPAY_PAYOUTS is set, we return a synthetic
 * "payout_paid" id without hitting Razorpay. This is what dev uses.
 *
 * Production: set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_ACCOUNT_NUMBER
 * and we'll call https://api.razorpay.com/v1/payouts via Basic auth.
 *
 * Razorpay payouts require the account to be "activated" (KYC done on Razorpay
 * dashboard) before any money moves. Until then, payouts return 400.
 */
import crypto from "crypto";

const KEY_ID = process.env.RAZORPAY_KEY_ID ?? "";
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET ?? "";
const ACCOUNT_NUMBER = process.env.RAZORPAY_ACCOUNT_NUMBER ?? "";
const BYPASS = process.env.BYPASS_RAZORPAY_PAYOUTS === "true" || !KEY_ID || KEY_ID.includes("your-key");

export function isRazorpayPayoutBypassed() {
  return BYPASS;
}

export type CreatePayoutInput = {
  amountPaise: number;
  upiId: string;
  referenceId: string;
  note?: string;
};

export type RazorpayPayoutResult = {
  id: string;
  status: string;
  amount_paise: number;
  reference_id: string;
};

export async function createRazorpayPayout(input: CreatePayoutInput): Promise<RazorpayPayoutResult> {
  if (BYPASS) {
    return {
      id: `pout_bypass_${crypto.randomBytes(8).toString("hex")}`,
      status: "processed",
      amount_paise: input.amountPaise,
      reference_id: input.referenceId,
    };
  }

  const body = {
    account_number: ACCOUNT_NUMBER,
    fund_account: {
      account_type: "vpa",
      vpa: { address: input.upiId },
    },
    amount: input.amountPaise,
    currency: "INR",
    mode: "UPI",
    purpose: "payout",
    reference_id: input.referenceId,
    narration: (input.note ?? "HiVR payout").slice(0, 30),
  };

  const auth = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/payouts", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Basic ${auth}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as any)?.error?.description ?? (data as any)?.message ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return {
    id: (data as any).id,
    status: (data as any).status,
    amount_paise: (data as any).amount,
    reference_id: (data as any).reference_id,
  };
}

/**
 * Verify a Razorpay webhook signature.
 * Razorpay signs the body with HMAC-SHA256 using your webhook secret.
 */
export function verifyRazorpayWebhookSignature(rawBody: string, signature: string, secret = process.env.RAZORPAY_WEBHOOK_SECRET): boolean {
  if (!secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}
