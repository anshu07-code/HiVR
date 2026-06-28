import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createRazorpayEscrowPayment } from "@/lib/razorpay-escrow";

/**
 * Pay the advance for a business contract via Razorpay.
 * Creates a Razorpay order, returns the order_id + amount so the client
 * can launch the checkout widget.
 *
 * Flow:
 *   1. Verify the business owns the contract.
 *   2. Pull contract.advance_paise.
 *   3. Create a Razorpay order (capture=manual, so money is held until
 *      we capture on webhook confirmation).
 *   4. Store the order_id in the contract's escrow_payment_id field.
 *   5. Return { orderId, amountPaise, keyId, bypassed } to the client.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: bp } = await sb.from("business_profiles").select("id, brand_name, legal_name, is_suspended")
    .eq("owner_user_id", user.id).maybeSingle();
  if (!bp) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  if ((bp as any).is_suspended) return NextResponse.json({ error: "Business suspended" }, { status: 403 });

  const { data: contract } = await sb.from("contracts")
    .select("id, business_id, status, advance_paise, advance_paid_at")
    .eq("id", params.id).maybeSingle();
  if (!contract) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if ((contract as any).business_id !== bp.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if ((contract as any).advance_paid_at) {
    return NextResponse.json({ error: "Advance already paid." }, { status: 400 });
  }
  if ((contract as any).status !== "active" && (contract as any).status !== "pending") {
    return NextResponse.json({ error: `Cannot pay advance: status is "${(contract as any).status}".` }, { status: 400 });
  }

  const amountPaise = Number((contract as any).advance_paise ?? 0);
  if (amountPaise <= 0) {
    return NextResponse.json({ error: "No advance configured for this contract." }, { status: 400 });
  }

  // Create the Razorpay order
  let order;
  try {
    order = await createRazorpayEscrowPayment({
      amountPaise,
      receipt: `biz_contract_${(contract as any).id.slice(0, 24)}`,
      notes: {
        business_id: bp.id,
        contract_id: (contract as any).id,
        type: "business_contract_advance",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: `Razorpay error: ${e?.message ?? "unknown"}` }, { status: 502 });
  }

  // Stash the order id so the webhook can match it later
  await sb.from("contracts").update({
    escrow_payment_id: order.id,
  } as any).eq("id", contract.id);

  return NextResponse.json({
    ok: true,
    orderId: order.id,
    amountPaise,
    keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? process.env.RAZORPAY_KEY_ID ?? "",
    bypassed: order.bypassed,
  });
}
