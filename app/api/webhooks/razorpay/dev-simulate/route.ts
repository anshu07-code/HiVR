/**
 * Dev-only: simulate a Razorpay webhook without going through Razorpay.
 *
 * Body: {
 *   contractId: string,
 *   event: "order.paid" | "payment.captured" | "payment.failed" |
 *          "transfer.processed" | "transfer.failed" | "refund.processed" | "refund.failed",
 *   paymentId?: string,   // override the pay_XXX id (defaults to "pay_dev_<contract>")
 *   transferId?: string,
 *   refundId?: string,
 *   amountPaise?: number,
 *   errorReason?: string
 * }
 *
 * Use this to test the full lifecycle without a Razorpay test account:
 *   1. POST /api/contracts/create         → create a contract + payment
 *   2. POST /api/webhooks/razorpay/dev-simulate { contractId, event: "order.paid" }
 *   3. POST /api/webhooks/razorpay/dev-simulate { contractId, event: "transfer.processed" }
 *   4. Verify the contract is `completed` and the payment is `released`.
 *
 * Guarded: only enabled when isRazorpayPayoutBypassed() returns true.
 * (Either RAZORPAY_KEY_ID contains "your-key" or BYPASS_RAZORPAY_PAYOUTS=true.)
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isRazorpayPayoutBypassed } from "@/lib/razorpay-payouts";

export const runtime = "nodejs";

const VALID_EVENTS = new Set([
  "order.paid",
  "payment.captured",
  "payment.authorized",
  "payment.failed",
  "transfer.processed",
  "transfer.failed",
  "refund.processed",
  "refund.failed",
]);

export async function POST(req: NextRequest) {
  if (!isRazorpayPayoutBypassed()) {
    return NextResponse.json(
      { error: "Dev simulator is disabled (Razorpay is live)." },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => ({} as any));
  const { contractId, event } = body as {
    contractId?: string;
    event?: string;
    paymentId?: string;
    transferId?: string;
    refundId?: string;
    amountPaise?: number;
    errorReason?: string;
  };

  if (!contractId || !event) {
    return NextResponse.json({ error: "contractId and event are required" }, { status: 400 });
  }
  if (!VALID_EVENTS.has(event)) {
    return NextResponse.json({ error: `unsupported event: ${event}` }, { status: 400 });
  }

  const admin = createAdminClient();

  // Load the contract + its payment row so we can fill in real ids.
  const { data: contract } = await admin
    .from("contracts")
    .select("id, escrow_payment_id, payments(id, razorpay_payment_id, amount, status)")
    .eq("id", contractId)
    .maybeSingle();
  if (!contract) {
    return NextResponse.json({ error: "contract not found" }, { status: 404 });
  }
  const payment = (contract as any).payments?.[0] ?? null;
  const paymentId = body.paymentId ?? payment?.razorpay_payment_id ?? `pay_dev_${contractId.slice(0, 8)}`;
  const transferId = body.transferId ?? `trf_dev_${Date.now()}`;
  const refundId = body.refundId ?? `rfnd_dev_${Date.now()}`;
  const amountPaise = body.amountPaise ?? Number(payment?.amount ?? 0);

  // Build the synthetic Razorpay envelope. Match the real shape so the
  // main webhook handler treats it identically.
  const now = Math.floor(Date.now() / 1000);
  const eventId = `evt_dev_${contractId.slice(0, 8)}_${event}_${now}`;

  let envelope: any = {
    id: eventId,
    event,
    created_at: now,
    payload: {},
  };

  switch (event) {
    case "order.paid":
      envelope.payload.order = {
        entity: {
          id: contract.escrow_payment_id ?? `order_dev_${contractId.slice(0, 8)}`,
          amount: amountPaise,
          amount_paid: amountPaise,
          status: "paid",
          notes: { contract_id: contractId },
        },
      };
      break;
    case "payment.captured":
    case "payment.authorized":
    case "payment.failed":
      envelope.payload.payment = {
        entity: {
          id: paymentId,
          order_id: contract.escrow_payment_id ?? `order_dev_${contractId.slice(0, 8)}`,
          amount: amountPaise,
          status: event === "payment.authorized" ? "authorized" : event === "payment.failed" ? "failed" : "captured",
          notes: { contract_id: contractId },
          error_description: body.errorReason ?? null,
        },
      };
      break;
    case "transfer.processed":
    case "transfer.failed":
      envelope.payload.transfer = {
        entity: {
          id: transferId,
          source: paymentId,
          amount: amountPaise,
          status: event === "transfer.processed" ? "processed" : "failed",
          error_description: body.errorReason ?? null,
        },
      };
      break;
    case "refund.processed":
    case "refund.failed":
      envelope.payload.refund = {
        entity: {
          id: refundId,
          payment_id: paymentId,
          amount: amountPaise,
          status: event === "refund.processed" ? "processed" : "failed",
          error_reason: body.errorReason ?? null,
        },
      };
      break;
  }

  // Self-POST: re-use the real handler so any logic changes are honoured.
  // In dev we sign the body with the local webhook secret if one is set;
  // otherwise the handler will see the bypass flag and skip verification.
  const res = await fetch(new URL("/api/webhooks/razorpay", req.url), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-razorpay-signature": "",
      "x-dev-simulator": "1",
    },
    body: JSON.stringify(envelope),
  });

  const out = await res.json().catch(() => ({}));
  return NextResponse.json({ ok: res.ok, dev_event_id: eventId, webhook_response: out });
}
