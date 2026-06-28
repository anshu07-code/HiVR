/**
 * lib/escrow.ts — Razorpay Route integration.
 *
 * We do NOT hold buyer money in a platform-controlled bank account. All funds
 * in transit are held by Razorpay via the Route / escrow product. This file
 * is a thin wrapper around the Razorpay Node SDK for the operations HiVR needs:
 *
 *   - createEscrowOrder(contract)        → returns order_id; buyer pays into this
 *   - captureAndHold(orderId)            → mark payment captured, still in escrow
 *   - releaseToEmployee(paymentId, amt)  → transfer from escrow to employee's linked account
 *   - refundBuyer(paymentId, amt)        → reverse an escrow payment
 *
 * In Phase 1, when no Razorpay key is set, this module returns mock responses
 * so the rest of the app can be built and demoed end-to-end. The TODO markers
 * below mark exactly where the real API calls slot in.
 */

import crypto from "crypto";
import type { Database } from "./supabase/types";

const KEY_ID = process.env.RAZORPAY_KEY_ID ?? "";
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET ?? "";
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";
const IS_SANDBOX = !KEY_ID || KEY_ID.includes("test_xxx") || process.env.NODE_ENV !== "production";

export type CreateOrderInput = {
  amount: number;            // in paise (smallest INR unit)
  contractId: string;
  buyerId: string;
  notes?: Record<string, string>;
};

export type RazorpayOrder = {
  id: string;
  amount: number;
  currency: "INR";
  status: "created" | "attempted" | "paid";
  key_id: string;
};

export async function createEscrowOrder(input: CreateOrderInput): Promise<RazorpayOrder> {
  if (IS_SANDBOX) {
    return {
      id: `order_mock_${input.contractId}`,
      amount: input.amount,
      currency: "INR",
      status: "created",
      key_id: KEY_ID || "rzp_test_mock",
    };
  }
  // TODO: real Razorpay call when keys are configured
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Basic " + Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64"),
    },
    body: JSON.stringify({
      amount: input.amount,
      currency: "INR",
      receipt: input.contractId,
      notes: { contract_id: input.contractId, buyer_id: input.buyerId, ...input.notes },
      // Route/escrow configuration: in production, link to a route plan that
      // holds the buyer's payment and transfers to the employee on release.
      // See https://razorpay.com/docs/api/route/
    }),
  });
  if (!res.ok) throw new Error(`razorpay create order failed: ${res.status}`);
  return (await res.json()) as RazorpayOrder;
}

export type TransferInput = {
  paymentId: string;
  amount: number;     // in paise
  employeeAccountId: string;   // Razorpay Route linked account id
  contractId: string;
};

export async function releaseToEmployee(input: TransferInput): Promise<{ transfer_id: string; status: string }> {
  if (IS_SANDBOX) {
    return { transfer_id: `trf_mock_${input.contractId}`, status: "processed" };
  }
  // TODO: real Razorpay Route transfer call
  const res = await fetch(`https://api.razorpay.com/v1/payments/${input.paymentId}/transfers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Basic " + Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64"),
    },
    body: JSON.stringify({
      transfers: [
        {
          account: input.employeeAccountId,
          amount: input.amount,
          currency: "INR",
          notes: { contract_id: input.contractId },
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`razorpay transfer failed: ${res.status}`);
  return (await res.json()) as { transfer_id: string; status: string };
}

export async function refundBuyer(paymentId: string, amount?: number): Promise<{ refund_id: string; status: string }> {
  if (IS_SANDBOX) return { refund_id: `rfnd_mock_${paymentId}`, status: "processed" };
  // TODO: real refund call
  const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Basic " + Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64"),
    },
    body: JSON.stringify(amount ? { amount } : {}),
  });
  if (!res.ok) throw new Error(`razorpay refund failed: ${res.status}`);
  return (await res.json()) as { refund_id: string; status: string };
}

/** Verify a Razorpay webhook signature. */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  if (!WEBHOOK_SECRET) return false;
  if (!signature) return false;
  const expected = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  try {
    // timingSafeEqual requires equal-length buffers; pad if needed.
    const exp = Buffer.from(expected, "hex");
    const sig = Buffer.from(signature, "hex");
    if (exp.length !== sig.length) return false;
    return crypto.timingSafeEqual(exp, sig);
  } catch {
    return false;
  }
}

export function isSandbox(): boolean { return IS_SANDBOX; }
