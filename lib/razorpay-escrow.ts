/**
 * Razorpay escrow / orders.
 *
 * For business contracts we use Razorpay Orders to hold the advance payment.
 * The order is created with `payment_capture: false` so the money is held by
 * Razorpay until we capture it. In dev, we return a synthetic order id.
 */
import crypto from "crypto";

const KEY_ID = process.env.RAZORPAY_KEY_ID ?? "";
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET ?? "";
const BYPASS = process.env.BYPASS_RAZORPAY_PAYOUTS === "true" || !KEY_ID || KEY_ID.includes("your-key");

export function isRazorpayEscrowBypassed() {
  return BYPASS;
}

export type CreateEscrowInput = {
  amountPaise: number;
  receipt: string;
  notes?: Record<string, string>;
};

export type RazorpayOrderResult = {
  id: string;
  amount_paise: number;
  currency: string;
  status: string;
  bypassed: boolean;
};

export async function createRazorpayEscrowPayment(input: CreateEscrowInput): Promise<RazorpayOrderResult> {
  if (BYPASS) {
    return {
      id: `order_bypass_${crypto.randomBytes(8).toString("hex")}`,
      amount_paise: input.amountPaise,
      currency: "INR",
      status: "created",
      bypassed: true,
    };
  }

  const body = {
    amount: input.amountPaise,
    currency: "INR",
    receipt: input.receipt.slice(0, 40),
    payment_capture: false, // held in escrow until we capture
    notes: input.notes ?? {},
  };

  const auth = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/orders", {
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
    amount_paise: (data as any).amount,
    currency: (data as any).currency,
    status: (data as any).status,
    bypassed: false,
  };
}
