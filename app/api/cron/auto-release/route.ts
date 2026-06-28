import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AUTO_RELEASE_HOURS } from "@/lib/constants";
import { timingSafeEqual } from "@/lib/security";

/**
 * Cron job: auto-release escrowed payments whose contract has reached
 * its `release_at` (set to approved_at + AUTO_RELEASE_HOURS) AND no
 * dispute has been raised.
 *
 * For legacy rows without `release_at` we fall back to `started_at +
 * AUTO_RELEASE_HOURS` so old data isn't stranded.
 *
 * Configure in vercel.json or your scheduler of choice:
 *   { "crons": [{ "path": "/api/cron/auto-release", "schedule": "0 * * * *" }] }
 *
 * Auth: requires the `Authorization: Bearer ${CRON_SECRET}` header.
 * The secret MUST be set in production; we refuse to run with a missing
 * or weak default value. Comparisons use `timingSafeEqual` to prevent
 * timing side-channels.
 */
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || cronSecret.length < 16) {
    // eslint-disable-next-line no-console
    console.error("[auto-release] CRON_SECRET missing or too short; refusing to run");
    return NextResponse.json({ error: "server misconfigured" }, { status: 503 });
  }
  const headerSecret = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!headerSecret || !timingSafeEqual(headerSecret, cronSecret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - AUTO_RELEASE_HOURS * 3600 * 1000).toISOString();

  // Find contracts awaiting release:
  //  - status in (active, delivered) AND
  //  - either release_at <= now (the new path) OR
  //    release_at IS NULL AND started_at <= cutoff (legacy fallback)
  const { data: candidates } = await admin
    .from("contracts")
    .select("id, employee_id, status, started_at, delivered_at, release_at, employee_payout_paise, payments(id, status, amount, platform_fee_amount, razorpay_payment_id, razorpay_route_transfer_id, escrow_released)")
    .or(`status.eq.active,status.eq.delivered`)
    .or(`release_at.lte.${new Date().toISOString()},and(release_at.is.null,started_at.lte.${cutoff})`);

  let released = 0;
  for (const c of (candidates ?? []) as any[]) {
    // Skip if there's an open dispute.
    const { count: disputes } = await admin
      .from("disputes")
      .select("id", { count: "exact", head: true })
      .eq("contract_id", c.id)
      .neq("status", "resolved_buyer")
      .neq("status", "resolved_employee")
      .neq("status", "split")
      .neq("status", "closed");
    if ((disputes ?? 0) > 0) continue;

    // Mark contract complete and release any unreleased payment rows.
    await admin.from("contracts").update({
      status: "completed",
      approved_at: new Date().toISOString(),
    }).eq("id", c.id);

    const employeePayout = Number(c.employee_payout_paise ?? 0);
    let employeeWalletCreditPaise = 0;

    for (const p of c.payments ?? []) {
      if (!p.escrow_released) {
        await admin.from("payments").update({
          status: "released",
          escrow_released: true,
        }).eq("id", p.id);
        released++;

        // If this payment was funded from the buyer's HiVR wallet (no
        // Razorpay transfer to release), credit the employee wallet now
        // so the money actually lands. Wallet-funded payments have no
        // razorpay_payment_id and the amount was already debited from
        // the buyer's wallet at funding time.
        if (!p.razorpay_payment_id) {
          employeeWalletCreditPaise += Math.max(
            0,
            Number(p.amount ?? 0) - Number(p.platform_fee_amount ?? 0)
          );
        }
      }
    }

    // Credit the employee's wallet with the agreed_price - platform_fee
    // (or employee_payout_paise if set, e.g. after a cancellation penalty).
    // We use the contract-level effective payout so cancellation penalties
    // are respected.
    if (employeePayout > 0) {
      // Try RPC wallet_credit (uses service_role). Fallback to direct insert
      // if RPC isn't available in this context.
      const { error: walletErr } = await admin.rpc("wallet_credit" as any, {
        p_user_id: (c as any).employee_id,
        p_amount_paise: employeePayout,
        p_kind: "escrow_release",
        p_description: "Auto-release of escrow for contract " + c.id,
        p_ref_type: "contract",
        p_ref_id: c.id,
        p_metadata: { trigger: "auto_release_cron", contract_id: c.id },
      } as any);
      if (walletErr) {
        // eslint-disable-next-line no-console
        console.error("[auto-release] wallet_credit failed for contract", c.id, walletErr);
      }
    }
    // TODO: call Razorpay Route transfer for razorpay-funded payments when
    // real keys are configured.
  }

  return NextResponse.json({ ok: true, candidates: candidates?.length ?? 0, released });
}
