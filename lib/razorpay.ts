/**
 * lib/razorpay.ts — minimal Razorpay HTTP client.
 *
 * Why not the official `razorpay` Node SDK? It pulls in a lot of
 * transitive deps and isn't always present in a Next.js project's
 * `package.json`. The Razorpay Orders + Refunds + Payouts APIs are
 * small enough to call directly with `fetch`.
 *
 * All methods use Basic Auth with the key_id:key_secret pair from env.
 * Errors are returned as `{ ok: false, error: string, status: number }`
 * so callers can surface a clear message to the user.
 */

const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";

function getKeys(): { keyId: string; keySecret: string } | null {
  const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? process.env.RAZORPAY_KEY_ID ?? "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET ?? "";
  if (!keyId || !keySecret || keyId.includes("...") || keySecret.includes("...")) return null;
  return { keyId, keySecret };
}

export function isRazorpayConfigured(): boolean {
  return getKeys() !== null;
}

function authHeader(): string {
  const k = getKeys();
  if (!k) throw new Error("Razorpay not configured");
  return "Basic " + Buffer.from(`${k.keyId}:${k.keySecret}`).toString("base64");
}

export type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
  receipt?: string;
  status: string;
  [k: string]: any;
};

/**
 * Create a Razorpay Order (used for wallet top-up and workspace funding).
 * https://razorpay.com/docs/api/orders/create/
 */
export async function createRazorpayOrder(
  amountPaise: number,
  receipt: string,
  notes: Record<string, string> = {},
  currency: string = "INR"
): Promise<RazorpayOrder> {
  const res = await fetch(`${RAZORPAY_API_BASE}/orders`, {
    method: "POST",
    headers: {
      "Authorization": authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: amountPaise,
      currency,
      receipt: receipt.slice(0, 40),
      notes,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    // eslint-disable-next-line no-console
    console.error("[razorpay] create order failed:", res.status, text);
    throw new Error(`Razorpay create-order failed: ${res.status} ${text.slice(0, 200)}`);
  }
  return JSON.parse(text) as RazorpayOrder;
}

/**
 * Verify a Razorpay payment signature using HMAC-SHA256.
 * Returns true if the signature matches `orderId|paymentId`.
 */
export function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string
): boolean {
  const k = getKeys();
  if (!k) return false;
  const crypto = require("crypto") as typeof import("crypto");
  const expected = crypto
    .createHmac("sha256", k.keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  if (expected.length !== signature.length) return false;
  // timingSafeEqual requires equal-length buffers
  const sigBuf = Buffer.from(signature, "hex");
  const expBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

/**
 * Fetch a single payment by id.
 * https://razorpay.com/docs/api/payments/fetch/
 */
export async function fetchRazorpayPayment(paymentId: string): Promise<any> {
  const res = await fetch(`${RAZORPAY_API_BASE}/payments/${encodeURIComponent(paymentId)}`, {
    method: "GET",
    headers: { "Authorization": authHeader() },
  });
  if (!res.ok) {
    // eslint-disable-next-line no-console
    console.error("[razorpay] fetch payment failed:", res.status);
    return null;
  }
  return res.json();
}

/**
 * Refund a payment (full or partial).
 * https://razorpay.com/docs/api/refunds/create/
 */
export async function refundRazorpayPayment(
  paymentId: string,
  amountPaise?: number,
  notes: Record<string, string> = {}
): Promise<{ id: string; status: string; amount: number; [k: string]: any } | null> {
  const body: any = { notes };
  if (typeof amountPaise === "number" && amountPaise > 0) {
    body.amount = amountPaise;
  }
  const res = await fetch(`${RAZORPAY_API_BASE}/payments/${encodeURIComponent(paymentId)}/refund`, {
    method: "POST",
    headers: {
      "Authorization": authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    // eslint-disable-next-line no-console
    console.error("[razorpay] refund failed:", res.status, t);
    return null;
  }
  return res.json();
}
