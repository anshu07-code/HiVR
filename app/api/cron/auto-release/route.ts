import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { timingSafeEqual } from "@/lib/security";

/**
 * Cron job: safety-net wallet credit for already-COMPLETED contracts
 * whose wallet-funded payments haven't been released yet.
 *
 * IMPORTANT: This cron must NEVER set contracts.status = 'completed'.
 * Workspace completion is the buyer's exclusive action — see
 * migration 0117 and POST /api/workspace/mark-done. The auto-release
 * cron's previous behaviour of completing 'delivered' contracts
 * automatically has been removed because it closed workspaces before
 * the buyer could approve.
 *
 * Configure in vercel.json or your scheduler of choice:
 *   { "crons": [{ "path": "/api/cron/auto-release", "schedule": "0 * * * *" }] }
 *
 * Auth: requires the `Authorization: Bearer ${CRON_SECRET}` header.
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

  // Only consider contracts the BUYER has already marked as done.
  // Do NOT complete any pending contracts here.
  const { data: candidates } = await admin
    .from("contracts")
    .select("id, employee_id, status, employee_payout_paise, payments(id, status, amount, platform_fee_amount, razorpay_payment_id, escrow_released)")
    .eq("status", "completed");

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
        // so the money actually lands.
        if (!p.razorpay_payment_id) {
          employeeWalletCreditPaise += Math.max(
            0,
            Number(p.amount ?? 0) - Number(p.platform_fee_amount ?? 0)
          );
        }
      }
    }

    // Safety-net credit: if the mark-done API route failed to credit
    // the wallet (e.g. transient network error), the cron will catch it
    // on the next run.
    if (employeeWalletCreditPaise > 0) {
      const { error: walletErr } = await admin.rpc("wallet_credit" as any, {
        p_user_id: (c as any).employee_id,
        p_amount_paise: employeeWalletCreditPaise,
        p_kind: "escrow_release",
        p_description: "Safety-net credit for contract " + c.id,
        p_ref_type: "contract",
        p_ref_id: c.id,
        p_metadata: { trigger: "auto_release_cron_safety_net", contract_id: c.id },
      } as any);
      if (walletErr) {
        // eslint-disable-next-line no-console
        console.error("[auto-release] wallet_credit failed for contract", c.id, walletErr);
      }
    }
  }

  return NextResponse.json({ ok: true, candidates: candidates?.length ?? 0, released });
}
