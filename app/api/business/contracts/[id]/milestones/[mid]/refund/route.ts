/**
 * POST /api/business/contracts/[id]/milestones/[mid]/refund
 * Body: { reason }
 *
 * Refund a released milestone payment to the business. This:
 *   1. Reverses the Razorpay transfer back to the business
 *   2. Marks the milestone as 'rejected' (employee lost the dispute retroactively)
 *   3. Adds 1 strike to the employee via recordDisputeLoss
 *   4. Records a refund row in the payments table for the audit log
 *
 * Refunds are rare and serious. UI should warn the user before allowing this.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordDisputeLoss } from "@/lib/auth-context";

export async function POST(req: NextRequest, { params }: { params: { id: string; mid: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: bp } = await sb.from("business_profiles").select("id").eq("owner_user_id", user.id).maybeSingle();
  if (!bp) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  const reason = (body.reason ?? "Refund requested by business").slice(0, 1000);

  // Pull the milestone + verify ownership
  const { data: ms } = await sb.from("business_milestones")
    .select("id, status, amount_paise, business_id, contract_id, payment_id, contract:contracts!business_milestones_contract_id_fkey(id, employee_id, business_id, status)")
    .eq("id", params.mid).eq("contract_id", params.id).maybeSingle();
  if (!ms) return NextResponse.json({ error: "Milestone not found" }, { status: 404 });
  if ((ms as any).business_id !== bp.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!["paid", "approved"].includes((ms as any).status)) {
    return NextResponse.json({ error: `Cannot refund: status is "${(ms as any).status}".` }, { status: 400 });
  }
  if (!(ms as any).payment_id) {
    return NextResponse.json({ error: "No Razorpay payment id on file. Refund must be processed manually via support." }, { status: 400 });
  }

  const employeeId = (ms as any).contract?.employee_id;
  const amountPaise = Number((ms as any).amount_paise);

  // 1. Initiate Razorpay refund
  // In production: POST https://api.razorpay.com/v1/payments/{payment_id}/refund
  // with { amount, speed: "optimum" }.
  // In sandbox: mark as immediately refunded (the payment was synthetic).
  const isRazorpayLive = !!(process.env.RAZORPAY_KEY_ID && !process.env.RAZORPAY_KEY_ID.includes("your-key"));
  if (isRazorpayLive) {
    try {
      const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
      const res = await fetch(`https://api.razorpay.com/v1/payments/${(ms as any).payment_id}/refund`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Basic ${auth}` },
        body: JSON.stringify({ amount: amountPaise, speed: "optimum" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return NextResponse.json({ error: `Razorpay refund failed: ${(err as any)?.error?.description ?? res.status}` }, { status: 502 });
      }
    } catch (e: any) {
      return NextResponse.json({ error: `Refund error: ${e?.message}` }, { status: 502 });
    }
  }

  // 2. Mark milestone as rejected
  await sb.from("business_milestones").update({
    status: "rejected",
    paid_at: null,
    payment_id: null,
  } as any).eq("id", params.mid);

  // 3. Record the refund in the payments table
  await sb.from("payments").insert({
    contract_id: params.id,
    milestone_id: params.mid,
    amount: amountPaise,
    platform_fee_amount: 0,
    razorpay_payment_id: (ms as any).payment_id,
    status: "refunded",
    escrow_released: false,
  } as any);

  // 4. Add a strike to the employee
  if (employeeId) {
    try { await recordDisputeLoss(employeeId, `Milestone refunded by business: ${reason}`); } catch {}
  }

  // 5. Decrement lifetime_spend_paise + month_to_date_spend_paise
  {
    const { data: sub } = await sb.from("business_subscriptions")
      .select("lifetime_spend_paise, month_to_date_spend_paise")
      .eq("business_id", bp.id)
      .in("status", ["active", "trialing"])
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (sub) {
      const lts = Math.max(0, Number((sub as any).lifetime_spend_paise ?? 0) - amountPaise);
      const mtd = Math.max(0, Number((sub as any).month_to_date_spend_paise ?? 0) - amountPaise);
      await sb.from("business_subscriptions").update({ lifetime_spend_paise: lts, month_to_date_spend_paise: mtd } as any)
        .eq("business_id", bp.id);
    }
    const { data: bp2 } = await sb.from("business_profiles").select("total_spend_paise").eq("id", bp.id).maybeSingle();
    if (bp2) {
      const newSpend = Math.max(0, Number((bp2 as any).total_spend_paise ?? 0) - amountPaise);
      await sb.from("business_profiles").update({ total_spend_paise: newSpend } as any).eq("id", bp.id);
    }
  }

  return NextResponse.json({ ok: true, amountPaise, reason });
}
