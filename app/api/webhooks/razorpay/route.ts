import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookSignature, isSandbox } from "@/lib/escrow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/razorpay
 *
 * Razorpay sends webhooks for many event types. The ones HiVR cares about:
 *
 *   order.paid          — buyer paid, money is in escrow.   → mark payment `in_escrow`, contract `active`
 *   payment.captured    — same as order.paid in hosted-checkout flow. → same
 *   payment.authorized  — soft capture (auto-capture disabled). → mark payment `authorized`
 *   payment.failed      — buyer payment failed.             → mark payment `failed`, contract `cancelled`, notify buyer
 *   transfer.processed  — payout to employee succeeded.     → mark payment `released`, escrow_released=true
 *   transfer.failed     — payout to employee failed.        → mark payment `disputed`, notify both parties
 *   refund.processed    — refund settled.                   → mark payment `refunded`
 *   refund.failed       — refund failed (rare).            → mark payment `disputed`, notify admin
 *
 * Configure in Razorpay dashboard: Settings → Webhooks → New webhook
 *   URL:    https://YOUR_DOMAIN/api/webhooks/razorpay
 *   Events: order.paid, payment.captured, payment.authorized, payment.failed,
 *           transfer.processed, transfer.failed, refund.processed, refund.failed
 *
 * Reliability features in this handler:
 *   1. **Signature verification** — HMAC-SHA256 of the raw body with the
 *      webhook secret. Returns 400 if invalid (event still logged for audit).
 *   2. **Idempotency** — uses Razorpay's own `payload.id` (e.g. "evt_XXXXXXX")
 *      as `event_id`. The unique index on `webhook_events.event_id` prevents
 *      duplicate processing if Razorpay retries.
 *   3. **Audit trail** — every status transition on `payments` is mirrored
 *      to `payment_status_history`.
 *   4. **Status guards** — never overwrite `disputed` or `completed` with a
 *      stale "active" if the lifecycle has already moved on.
 *   5. **Best-effort notifications** — buyer/employee get pinged on capture,
 *      failure, and refund. Errors here are logged but don't fail the handler.
 *   6. **Self-healing dev fallback** — in sandbox mode without a webhook
 *      secret, signature is skipped (signature_valid=false) and the event is
 *      still processed so the local flow works.
 */
export async function POST(req: NextRequest) {
  const sig = req.headers.get("x-razorpay-signature") ?? "";
  const rawBody = await req.text();
  const sandbox = isSandbox();
  const sigValid = sandbox && !process.env.RAZORPAY_WEBHOOK_SECRET
    ? true
    : verifyWebhookSignature(rawBody, sig);

  const admin = createAdminClient();

  // Parse payload. If invalid JSON, log and bail.
  let payload: any = {};
  try { payload = JSON.parse(rawBody); } catch {
    await admin.from("webhook_events").insert({
      event_type: "unknown",
      payload: { raw: rawBody.slice(0, 200) },
      signature_valid: false,
      error: "invalid_json",
    });
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const eventType: string = payload.event ?? "unknown";
  // Razorpay's event id is the canonical idempotency key (e.g. "evt_ABC123").
  // Fall back to payment/order id if the envelope id is absent.
  const eventId: string | null =
    payload.id ??
    payload.payload?.payment?.entity?.id ??
    payload.payload?.order?.entity?.id ??
    payload.payload?.refund?.entity?.id ??
    payload.payload?.transfer?.entity?.id ??
    null;

  // Idempotency: skip if we've already processed this event.
  if (eventId) {
    const { data: existing } = await admin
      .from("webhook_events")
      .select("id, processed, error")
      .eq("event_id", eventId)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ ok: true, duplicate: true, event_id: eventId });
    }
  }

  // Log the event first so we have a record even if processing throws.
  const { data: evt, error: logErr } = await admin.from("webhook_events").insert({
    event_type: eventType,
    event_id: eventId,
    payload,
    signature_valid: sigValid,
  }).select("id").single();
  if (logErr) {
    console.error("[razorpay webhook] log insert failed:", logErr);
  }

  if (!sigValid) {
    if (evt?.id) {
      await admin.from("webhook_events").update({ error: "invalid_signature" }).eq("id", evt.id);
    }
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    await processRazorpayEvent(admin, payload);
    if (evt?.id) {
      await admin.from("webhook_events").update({
        processed: true,
        processed_at: new Date().toISOString(),
      }).eq("id", evt.id);
    }
    return NextResponse.json({ ok: true, event_id: eventId, event_type: eventType });
  } catch (e) {
    if (evt?.id) {
      await admin.from("webhook_events").update({
        error: (e as Error).message?.slice(0, 500) ?? "unknown error",
      }).eq("id", evt.id);
    }
    console.error("[razorpay webhook] processing failed:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/**
 * Pure event processor. Exported so the admin retry endpoint can re-run
 * a previously-failed event without re-firing the signature check or
 * creating a new webhook_events row.
 */
export async function processRazorpayEvent(admin: Admin, payload: any) {
  const eventType: string = payload.event ?? "unknown";
  switch (eventType) {
    case "order.paid": {
      const order = payload.payload?.order?.entity;
      if (order?.id) await handleOrderPaid(admin, order);
      break;
    }
    case "payment.captured": {
      const payment = payload.payload?.payment?.entity;
      if (payment?.id) await handlePaymentCaptured(admin, payment);
      break;
    }
    case "payment.authorized": {
      const payment = payload.payload?.payment?.entity;
      if (payment?.id) await handlePaymentAuthorized(admin, payment);
      break;
    }
    case "payment.failed": {
      const payment = payload.payload?.payment?.entity;
      if (payment?.id) await handlePaymentFailed(admin, payment);
      break;
    }
    case "transfer.processed": {
      const transfer = payload.payload?.transfer?.entity;
      if (transfer?.id) await handleTransferProcessed(admin, transfer);
      break;
    }
    case "transfer.failed": {
      const transfer = payload.payload?.transfer?.entity;
      if (transfer?.id) await handleTransferFailed(admin, transfer);
      break;
    }
    case "refund.processed": {
      const refund = payload.payload?.refund?.entity;
      if (refund?.payment_id) await handleRefundProcessed(admin, refund);
      break;
    }
    case "refund.failed": {
      const refund = payload.payload?.refund?.entity;
      if (refund?.payment_id) await handleRefundFailed(admin, refund);
      break;
    }
    default:
      // Logged but not handled (e.g. payment_link.paid, qr_code.paid, virtual_account.credited)
      break;
  }
}

// =============================================================================
// Handlers
// =============================================================================

type Admin = ReturnType<typeof createAdminClient>;

async function handleOrderPaid(admin: Admin, order: any) {
  const contractId = order.notes?.contract_id;
  if (!contractId) return;
  // We don't know the payment_id from order.paid reliably (it can be the
  // order_id "order_XXX" or a child payment). The contract row holds the
  // canonical order_id, so we update via contract.
  const { data: contract } = await admin
    .from("contracts")
    .select("id, buyer_id, employee_id, status")
    .eq("id", contractId)
    .maybeSingle();
  if (!contract) return;

  // Find any payment row that still has status='created' for this contract
  // and mark it 'in_escrow'. (Most contracts have exactly one.)
  const { data: payments } = await admin
    .from("payments")
    .select("id, status")
    .eq("contract_id", contractId)
    .eq("status", "created");
  for (const p of payments ?? []) {
    await transitionPayment(admin, p.id, p.status, "in_escrow", null, "razorpay_order_paid");
  }

  // Only flip the contract to 'active' if it hasn't already moved on.
  if (!contract.status || contract.status === "created") {
    await admin
      .from("contracts")
      .update({ status: "active" })
      .eq("id", contractId);
  }

  await notify(admin, contract.buyer_id, {
    type: "payment",
    title: "Payment received — contract is live",
    body: `Your payment is in escrow. The contract is now active.`,
    link: `/dashboard/contracts/${contractId}`,
  });
  await notify(admin, contract.employee_id, {
    type: "payment",
    title: "New active contract",
    body: `A buyer has funded the escrow. You can start work now.`,
    link: `/dashboard/contracts/${contractId}`,
  });
}

async function handlePaymentCaptured(admin: Admin, payment: any) {
  // payment.id is the pay_XXX id. We saved that to payments.razorpay_payment_id.
  const razorpayPaymentId = payment.id;
  const { data: row } = await admin
    .from("payments")
    .select("id, contract_id, status")
    .eq("razorpay_payment_id", razorpayPaymentId)
    .maybeSingle();
  if (!row) return;

  // 1) Transition payment status (in_escrow, idempotent)
  if (row.status !== "in_escrow" && row.status !== "released" && row.status !== "refunded") {
    await transitionPayment(admin, row.id, row.status, "in_escrow", razorpayPaymentId, "razorpay_captured");
  }

  // 2) Flip contract to active, but only if it hasn't moved on
  const { data: contract } = await admin
    .from("contracts")
    .select("id, status, buyer_id, employee_id")
    .eq("id", row.contract_id)
    .maybeSingle();
  if (contract && (!contract.status || contract.status === "created")) {
    await admin
      .from("contracts")
      .update({ status: "active" })
      .eq("id", row.contract_id);
  }
  if (contract) {
    await notify(admin, contract.buyer_id, {
      type: "payment",
      title: "Payment received — contract is live",
      body: `Your payment is in escrow. The contract is now active.`,
      link: `/dashboard/contracts/${row.contract_id}`,
    });
    await notify(admin, contract.employee_id, {
      type: "payment",
      title: "New active contract",
      body: `A buyer has funded the escrow. You can start work now.`,
      link: `/dashboard/contracts/${row.contract_id}`,
    });
  }
}

async function handlePaymentAuthorized(admin: Admin, payment: any) {
  const { data: row } = await admin
    .from("payments")
    .select("id, status")
    .eq("razorpay_payment_id", payment.id)
    .maybeSingle();
  if (!row) return;
  if (row.status === "created") {
    await transitionPayment(admin, row.id, row.status, "authorized", payment.id, "razorpay_authorized");
  }
}

async function handlePaymentFailed(admin: Admin, payment: any) {
  const { data: row } = await admin
    .from("payments")
    .select("id, contract_id, status")
    .eq("razorpay_payment_id", payment.id)
    .maybeSingle();
  if (!row) return;
  if (row.status !== "failed" && row.status !== "refunded") {
    await transitionPayment(admin, row.id, row.status, "failed", payment.id, "razorpay_failed", payment.error_description ?? null);
  }
  // Cancel the contract (only if not already in a terminal state)
  const { data: contract } = await admin
    .from("contracts")
    .select("id, status, buyer_id")
    .eq("id", row.contract_id)
    .maybeSingle();
  if (contract && (!contract.status || contract.status === "created" || contract.status === "active")) {
    await admin
      .from("contracts")
      .update({ status: "cancelled" })
      .eq("id", row.contract_id);
  }
  if (contract) {
    await notify(admin, contract.buyer_id, {
      type: "payment",
      title: "Payment failed",
      body: `Your payment didn't go through. The contract was cancelled. Please try again from the task page.`,
      link: `/dashboard/contracts/${row.contract_id}`,
    });
  }
}

async function handleTransferProcessed(admin: Admin, transfer: any) {
  // Razorpay's transfer entity references the source payment via `source` (which
  // is the pay_XXX id). We match on that, not on transfer id (the column is
  // empty until we set it ourselves).
  const sourcePaymentId = transfer.source ?? transfer.payment_id ?? null;
  if (!sourcePaymentId) return;
  const { data: row } = await admin
    .from("payments")
    .select("id, status, contract_id, employee_id, employee_payout_paise, amount, platform_fee_amount")
    .eq("razorpay_payment_id", sourcePaymentId)
    .maybeSingle();
  if (!row) return;
  await admin.from("payments").update({
    status: "released",
    escrow_released: true,
    razorpay_route_transfer_id: transfer.id,
  }).eq("id", row.id);
  await transitionPayment(admin, row.id, row.status, "released", transfer.id, "razorpay_transfer_processed");

  // Migration 0133: when the contract was completed, both the employee's
  // wallet and the HiVR Revenue wallet got `pending_paise` credits
  // (because the money was still in Razorpay's escrow). Now that
  // Razorpay has settled the transfer to HiVR's pooled account,
  // move both pending_paise → balance_paise.
  //
  // We re-derive the amounts from the payment row (amount and
  // platform_fee_amount) and the contract row (employee_payout_paise)
  // — same as the live mark_workspace_done function did.
  const employeePayout = Number((row as any).employee_payout_paise ?? 0);
  const platformFee = Number((row as any).platform_fee_amount ?? 0);
  const hivrUserId = '00000000-0000-0000-0000-0000000000fe';

  if (employeePayout > 0) {
    // Employee: pending_paise → balance_paise
    const { data: empRow } = await admin
      .from("user_wallets")
      .select("pending_paise, balance_paise, lifetime_received_paise")
      .eq("user_id", (row as any).employee_id)
      .maybeSingle();
    const empPending = Number(empRow?.pending_paise ?? 0);
    const empBalance = Number(empRow?.balance_paise ?? 0);
    const empLifetime = Number(empRow?.lifetime_received_paise ?? 0);
    // Only move what we actually have pending (defensive — in case
    // mark_workspace_done didn't run for this contract).
    const movePayout = Math.min(employeePayout, empPending);
    if (movePayout > 0) {
      await admin.from("user_wallets").update({
        pending_paise: empPending - movePayout,
        balance_paise: empBalance + movePayout,
        lifetime_received_paise: empLifetime + movePayout,
        updated_at: new Date().toISOString(),
      }).eq("user_id", (row as any).employee_id);

      // Record the wallet transaction that moves pending → withdrawable
      await admin.from("wallet_transactions").insert({
        user_id: (row as any).employee_id,
        amount_paise: movePayout,
        direction: "credit",
        kind: "escrow_release",
        description: `Razorpay escrow released for contract ${row.contract_id}`,
        ref_type: "contract",
        ref_id: row.contract_id,
        balance_after_paise: empBalance + movePayout,
        metadata: {
          trigger: "razorpay_transfer_processed",
          transfer_id: transfer.id,
          was_pending: true,
        },
      });
    }
  }

  if (platformFee > 0) {
    // HiVR Revenue: pending_paise → balance_paise
    const { data: hivrRow } = await admin
      .from("user_wallets")
      .select("pending_paise, balance_paise, lifetime_received_paise")
      .eq("user_id", hivrUserId)
      .maybeSingle();
    const hivrPending = Number(hivrRow?.pending_paise ?? 0);
    const hivrBalance = Number(hivrRow?.balance_paise ?? 0);
    const hivrLifetime = Number(hivrRow?.lifetime_received_paise ?? 0);
    const moveFee = Math.min(platformFee, hivrPending);
    if (moveFee > 0) {
      await admin.from("user_wallets").update({
        pending_paise: hivrPending - moveFee,
        balance_paise: hivrBalance + moveFee,
        lifetime_received_paise: hivrLifetime + moveFee,
        updated_at: new Date().toISOString(),
      }).eq("user_id", hivrUserId);

      // Record the platform revenue ledger move
      await admin.from("platform_revenue_ledger").insert({
        wallet_id: hivrUserId,
        source: "contract_completion",
        amount_paise: moveFee,
        contract_id: row.contract_id,
        workspace_id: null,
        employee_id: (row as any).employee_id,
        description: `Pending → withdrawable (Razorpay released) for contract ${row.contract_id}`,
        metadata: {
          trigger: "razorpay_transfer_processed",
          transfer_id: transfer.id,
          was_pending: true,
        },
      });
    }
  }

  await notify(admin, row.employee_id, {
    type: "payment",
    title: "Funds released to your account",
    body: `${formatPaise(employeePayout)} from contract ${row.contract_id?.slice(0, 8) ?? ""} is now withdrawable.`,
    link: `/dashboard/contracts/${row.contract_id}`,
  });
}

async function handleTransferFailed(admin: Admin, transfer: any) {
  const sourcePaymentId = transfer.source ?? transfer.payment_id ?? null;
  if (!sourcePaymentId) return;
  const { data: row } = await admin
    .from("payments")
    .select("id, status, contract_id, employee_id, buyer_id")
    .eq("razorpay_payment_id", sourcePaymentId)
    .maybeSingle();
  if (!row) return;
  await admin.from("payments").update({
    status: "disputed",
  }).eq("id", row.id);
  await transitionPayment(admin, row.id, row.status, "disputed", transfer.id, "razorpay_transfer_failed", transfer.error_description ?? null);

  await notify(admin, row.employee_id, {
    type: "payment",
    title: "Payout failed — admin reviewing",
    body: `We couldn't transfer your earnings. Admin will retry within 24h.`,
    link: `/dashboard/contracts/${row.contract_id}`,
  });
  await notify(admin, row.buyer_id, {
    type: "payment",
    title: "Payout to freelancer is delayed",
    body: `Your funds are still in escrow. HiVR is resolving the payout issue.`,
    link: `/dashboard/contracts/${row.contract_id}`,
  });
}

async function handleRefundProcessed(admin: Admin, refund: any) {
  const { data: row } = await admin
    .from("payments")
    .select("id, status, contract_id, employee_id, buyer_id")
    .eq("razorpay_payment_id", refund.payment_id)
    .maybeSingle();
  if (!row) return;
  await admin.from("payments").update({
    status: "refunded",
  }).eq("id", row.id);
  await transitionPayment(admin, row.id, row.status, "refunded", refund.id, "razorpay_refund_processed");

  await notify(admin, row.buyer_id, {
    type: "payment",
    title: "Refund processed",
    body: `Your refund of ₹${(Number(refund.amount ?? 0) / 100).toFixed(2)} has been returned.`,
    link: `/dashboard/contracts/${row.contract_id}`,
  });
  await notify(admin, row.employee_id, {
    type: "payment",
    title: "Contract refunded to buyer",
    body: `Contract ${row.contract_id} was refunded. The escrow amount went back to the buyer.`,
    link: `/dashboard/contracts/${row.contract_id}`,
  });
}

async function handleRefundFailed(admin: Admin, refund: any) {
  const { data: row } = await admin
    .from("payments")
    .select("id, status, contract_id, employee_id, buyer_id")
    .eq("razorpay_payment_id", refund.payment_id)
    .maybeSingle();
  if (!row) return;
  await admin.from("payments").update({
    status: "disputed",
  }).eq("id", row.id);
  await transitionPayment(admin, row.id, row.status, "disputed", refund.id, "razorpay_refund_failed", refund.error_reason ?? null);
  await notify(admin, row.buyer_id, {
    type: "payment",
    title: "Refund couldn't be processed",
    body: `We couldn't refund this payment. Admin will reach out to resolve.`,
    link: `/dashboard/contracts/${row.contract_id}`,
  });
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Insert into payment_status_history AND update payments.status in one go.
 * Skips the insert if `from` === `to` (idempotent re-runs).
 */
async function transitionPayment(
  admin: Admin,
  paymentId: string,
  fromStatus: string | null,
  toStatus: string,
  refId: string | null,
  trigger: string,
  reason: string | null = null,
) {
  if (fromStatus === toStatus) return;
  await admin.from("payment_status_history").insert({
    payment_id: paymentId,
    from_status: fromStatus,
    to_status: toStatus,
    reason: reason ?? trigger,
  });
  await admin.from("payments").update({ status: toStatus }).eq("id", paymentId);
}

async function notify(admin: Admin, userId: string | null | undefined, n: {
  type: string; title: string; body: string; link?: string;
}) {
  if (!userId) return;
  try {
    await admin.rpc("create_notification" as any, {
      p_user_id: userId,
      p_type: n.type,
      p_title: n.title,
      p_body: n.body,
      p_link: n.link ?? null,
    } as any);
  } catch (e) {
    console.error("[razorpay webhook] notify failed for", userId, e);
  }
}

// Health check (Razorpay sends GET to verify the endpoint)
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "razorpay",
    sandbox: isSandbox(),
    ts: new Date().toISOString(),
  });
}
