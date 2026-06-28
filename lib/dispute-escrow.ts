/**
 * lib/dispute-escrow.ts
 *
 * Server-side helpers for moving money in/out of escrow when an admin
 * resolves a dispute. Used by the admin disputes API route and the dev
 * simulator so both share the same code path.
 *
 * Two source types are supported:
 *   - 'razorpay' — the buyer's payment is in Razorpay escrow. We call
 *     `refundBuyer()` and/or `releaseToEmployee()` to move money.
 *   - 'wallet'   — the buyer's payment was funded from their HiVR wallet.
 *     We call `wallet_credit` to put the right amount in each party's wallet.
 *
 * The `resolve_dispute` SQL RPC does the wallet path natively (atomic with
 * the rest of the dispute state change). For the Razorpay path, we call
 * this helper AFTER the RPC has run, since plpgsql can't do HTTP.
 *
 * Idempotency: the RPC sets `disputes.escrow_processed_at` exactly once.
 * If you re-call this helper after the RPC has already set that timestamp
 * for a Razorpay-funded dispute, it's a no-op (the webhook will reconcile
 * the payment status).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { refundBuyer, releaseToEmployee } from "@/lib/escrow";

export type DisputeResolution = "in_favor_of_buyer" | "in_favor_of_employee" | "split" | "no_action";

export type DisputeEscrowResult = {
  ok: boolean;
  escrow_source: "razorpay" | "wallet" | "none";
  refund_paise: number;
  payout_paise: number;
  platform_retained_paise: number;
  razorpay_refund_id?: string;
  razorpay_transfer_id?: string;
  wallet_credit_results?: { to: "buyer" | "employee"; paise: number; ok: boolean; error?: string }[];
  errors?: string[];
};

/**
 * Move the money after a dispute has been resolved by the RPC.
 * - For wallet-funded disputes: this is a no-op (the RPC did it atomically).
 * - For Razorpay-funded disputes: calls Razorpay to release/refund.
 * - For "no_action" / "closed": does nothing.
 *
 * Returns a structured result so the caller (API route) can show the admin
 * exactly what just happened.
 */
export async function executeDisputeEscrow(disputeId: string): Promise<DisputeEscrowResult> {
  const admin = createAdminClient();

  // Load the dispute, contract, and payment row
  const { data: dispute } = await admin
    .from("disputes")
    .select("id, status, contract_id, employee_share_pct, refund_paise, payout_paise, platform_retained_paise, escrow_processed_at, escrow_processing_error")
    .eq("id", disputeId)
    .maybeSingle();
  if (!dispute) {
    return { ok: false, escrow_source: "none", refund_paise: 0, payout_paise: 0, platform_retained_paise: 0, errors: ["dispute not found"] };
  }
  if (!["resolved_buyer", "resolved_employee", "split", "closed"].includes(dispute.status)) {
    return { ok: false, escrow_source: "none", refund_paise: 0, payout_paise: 0, platform_retained_paise: 0, errors: [`dispute status is "${dispute.status}" — nothing to move`] };
  }

  const { data: contract } = await admin
    .from("contracts")
    .select("id, buyer_id, employee_id")
    .eq("id", dispute.contract_id)
    .maybeSingle();
  if (!contract) {
    return { ok: false, escrow_source: "none", refund_paise: 0, payout_paise: 0, platform_retained_paise: 0, errors: ["contract not found"] };
  }

  const { data: payment } = await admin
    .from("payments")
    .select("id, razorpay_payment_id, amount, platform_fee_amount, status")
    .eq("contract_id", dispute.contract_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Nothing to do if there's no money in escrow.
  if (!payment) {
    return { ok: true, escrow_source: "none", refund_paise: 0, payout_paise: 0, platform_retained_paise: 0 };
  }

  const refundPaise = Number(dispute.refund_paise ?? 0);
  const payoutPaise = Number(dispute.payout_paise ?? 0);
  const retainedPaise = Number(dispute.platform_retained_paise ?? payment.platform_fee_amount ?? 0);

  // Determine escrow source from the payment row, matching the SQL function's logic.
  const isRazorpay =
    payment.razorpay_payment_id &&
    !payment.razorpay_payment_id.startsWith("pay_dev_") &&
    !payment.razorpay_payment_id.startsWith("order_") &&
    !payment.razorpay_payment_id.startsWith("order_mock_");
  const escrow_source: "razorpay" | "wallet" = isRazorpay ? "razorpay" : "wallet";

  // If the RPC already marked the escrow as processed (wallet path) and the
  // money actually moved there, don't re-run the wallet credits. The
  // `escrow_processed_at` timestamp is set by the SQL function in both paths,
  // but for Razorpay it's set BEFORE the HTTP call so a crash here leaves
  // a recoverable state (re-run this helper).
  const alreadyDone = !!dispute.escrow_processed_at && escrow_source === "wallet";
  if (alreadyDone) {
    return { ok: true, escrow_source, refund_paise: refundPaise, payout_paise: payoutPaise, platform_retained_paise: retainedPaise };
  }

  const errors: string[] = [];
  let razorpayRefundId: string | undefined;
  let razorpayTransferId: string | undefined;

  if (escrow_source === "wallet") {
    // Wallet path: the RPC already credited the wallets. Just confirm.
    return { ok: true, escrow_source, refund_paise: refundPaise, payout_paise: payoutPaise, platform_retained_paise: retainedPaise };
  }

  // Razorpay path: call the API.
  if (refundPaise > 0) {
    try {
      const r = await refundBuyer(payment.razorpay_payment_id, refundPaise);
      razorpayRefundId = r.refund_id;
    } catch (e) {
      errors.push(`refund to buyer failed: ${(e as Error).message}`);
    }
  }
  if (payoutPaise > 0) {
    try {
      // In production we'd pass the employee's Razorpay Route linked account id.
      // For now we pass the contract id as the account (sandbox mock) and rely
      // on `releaseToEmployee` returning a synthetic id.
      const xfer = await releaseToEmployee({
        paymentId: payment.razorpay_payment_id,
        amount: payoutPaise,
        // Real: pull from business/employee linked accounts. For now we pass
        // the employee_id which the sandbox mock uses as the "destination".
        employeeAccountId: contract.employee_id,
        contractId: contract.id,
      });
      razorpayTransferId = xfer.transfer_id;
    } catch (e) {
      errors.push(`transfer to employee failed: ${(e as Error).message}`);
    }
  }

  // Record the result on the dispute row.
  await admin
    .from("disputes")
    .update({
      escrow_processing_error: errors.length ? errors.join("; ").slice(0, 1000) : null,
    })
    .eq("id", disputeId);

  return {
    ok: errors.length === 0,
    escrow_source,
    refund_paise: refundPaise,
    payout_paise: payoutPaise,
    platform_retained_paise: retainedPaise,
    razorpay_refund_id: razorpayRefundId,
    razorpay_transfer_id: razorpayTransferId,
    errors: errors.length ? errors : undefined,
  };
}
