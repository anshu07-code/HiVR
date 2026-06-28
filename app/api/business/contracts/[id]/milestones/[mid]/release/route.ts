import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createRazorpayPayout } from "@/lib/razorpay-payouts";

/**
 * Release payment for an approved milestone to the employee via Razorpay.
 *  - Status: approved -> paid
 *  - Records payment_id (Razorpay payout id)
 *  - Bumps business.total_spend_paise + lifetime_spend_paise on the subscription
 *  - On success, marks the contract as 'completed' if all milestones are paid
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string; mid: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: bp } = await sb.from("business_profiles").select("id, legal_name, brand_name, payout_upi_id, upi_verified_at")
    .eq("owner_user_id", user.id).maybeSingle();
  if (!bp) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  // Pull milestone + contract + employee
  const { data: ms } = await sb.from("business_milestones")
    .select("id, status, amount_paise, contract_id, title").eq("id", params.mid).eq("contract_id", params.id).maybeSingle();
  if (!ms) return NextResponse.json({ error: "Milestone not found" }, { status: 404 });
  if ((ms as any).business_id && (ms as any).business_id !== bp.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if ((ms as any).status !== "approved") {
    return NextResponse.json({ error: `Milestone must be approved before release. Current status: "${(ms as any).status}".` }, { status: 400 });
  }

  const { data: contract } = await sb.from("contracts")
    .select("id, employee_id, status, agreed_price, escrow_payment_id, business_id, employee:users!contracts_employee_id_fkey(full_name, upi_id, upi_verified_at, payout_upi_id)")
    .eq("id", params.id).maybeSingle();
  if (!contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  if ((contract as any).business_id !== bp.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Determine the employee's UPI ID (for payout). Priority: their upi_id > payout_upi_id.
  const employeeUpi = (contract as any).employee?.upi_id || (contract as any).employee?.payout_upi_id;
  if (!employeeUpi) {
    return NextResponse.json({
      error: "Employee hasn't added a payout UPI yet. Ask them to complete eKYC.",
    }, { status: 400 });
  }

  // Call Razorpay to release the payout.
  let payout;
  try {
    payout = await createRazorpayPayout({
      amountPaise: Number((ms as any).amount_paise),
      upiId: employeeUpi,
      referenceId: (ms as any).id,
      note: `HiVR contract ${(contract as any).id.slice(0, 8)} — milestone: ${(ms as any).title?.slice(0, 50)}`,
    });
  } catch (e: any) {
    return NextResponse.json({
      error: `Payout failed: ${e?.message ?? "unknown"}. The milestone was NOT released.`,
    }, { status: 502 });
  }

  // Mark milestone as paid
  const { error: updErr } = await sb.from("business_milestones").update({
    status: "paid",
    paid_at: new Date().toISOString(),
    payment_id: payout.id,
  } as any).eq("id", params.mid);
  if (updErr) {
    return NextResponse.json({
      error: `Razorpay payout was created (${payout.id}) but database update failed: ${updErr.message}. Please contact support.`,
    }, { status: 500 });
  }

  // Bump business lifetime spend (subscription aggregates)
  await sb.rpc("bump_business_total" as any, {
    _business_id: bp.id,
    _field: "spend",
    _delta_paise: Number((ms as any).amount_paise),
  } as any).then(({ error }: any) => {
    if (error) {
      // Fallback: update subscription + business_profile directly if RPC missing
      sb.from("business_subscriptions").select("lifetime_spend_paise, month_to_date_spend_paise").eq("business_id", bp.id)
        .in("status", ["active", "trialing"]).order("created_at", { ascending: false }).limit(1).maybeSingle()
        .then(({ data }: any) => {
          if (data) {
            const lts = Number((data as any).lifetime_spend_paise ?? 0) + Number((ms as any).amount_paise);
            const mtd = Number((data as any).month_to_date_spend_paise ?? 0) + Number((ms as any).amount_paise);
            sb.from("business_subscriptions").update({ lifetime_spend_paise: lts, month_to_date_spend_paise: mtd } as any)
              .eq("business_id", bp.id).then(() => {});
          }
        });
      sb.from("business_profiles").select("total_spend_paise").eq("id", bp.id).maybeSingle()
        .then(({ data }: any) => {
          const newSpend = Number((data as any)?.total_spend_paise ?? 0) + Number((ms as any).amount_paise);
          sb.from("business_profiles").update({ total_spend_paise: newSpend } as any)
            .eq("id", bp.id).then(() => {});
        });
    }
  });

  // If all milestones are paid, mark the contract as completed.
  const { data: remainingM } = await sb.from("business_milestones")
    .select("id").eq("contract_id", contract.id).neq("status", "paid");
  if (!remainingM || (remainingM as any[]).length === 0) {
    await sb.from("contracts").update({
      status: "completed",
      approved_at: new Date().toISOString(),
    } as any).eq("id", contract.id);
    // Bump business profile counters
    await sb.rpc("bump_business_total" as any, {
      _business_id: bp.id,
      _field: "contracts",
      _delta: 1,
    } as any);
  }

  return NextResponse.json({ ok: true, payoutId: payout.id });
}
