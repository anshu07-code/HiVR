import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRazorpayOrder, isRazorpayConfigured } from "@/lib/razorpay";
import { SecurityError, requireUuid, enforceRateLimit } from "@/lib/security";

/**
 * POST /api/workspace/fund/create-order
 *
 * Creates a Razorpay order for funding the workspace escrow. Called
 * by the FundEscrowModal before opening the Razorpay checkout UI.
 *
 * The flow (HiVR wallet-first policy):
 *   1. Buyer clicks "Pay with Razorpay" on the FundEscrowModal.
 *   2. This route creates a Razorpay order for the full escrow amount.
 *   3. The client opens https://checkout.razorpay.com/v1/checkout.js.
 *   4. On success, /api/workspace/fund/verify:
 *      a. verifies the signature,
 *      b. credits the buyer's HiVR wallet (net of platform fee),
 *      c. auto-debits the wallet to fund the workspace escrow.
 *
 * Returns:
 *   {
 *     orderId, amount, currency, keyId, workspaceId,
 *     user: { name, email, contact }
 *   }
 */

export async function POST(req: NextRequest) {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
    enforceRateLimit(`workspace_fund_order:${user.id}`, { max: 10, windowMs: 60_000 });

    const body = await req.json().catch(() => ({}));
    let workspaceId: string;
    try {
      workspaceId = requireUuid(body.workspaceId, "workspaceId");
    } catch (e) {
      if (e instanceof SecurityError) {
        return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
      }
      throw e;
    }

    if (!isRazorpayConfigured()) {
      return NextResponse.json({
        ok: false,
        error: "Razorpay keys not configured. Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, and NEXT_PUBLIC_RAZORPAY_KEY_ID in .env.local, then restart `next dev`.",
        needsKeys: true,
      }, { status: 503 });
    }

    // 1. Load the workspace + buyer's name/email/phone for Razorpay prefill.
    const admin = createAdminClient();
    const { data: ws, error: wsErr } = await admin
      .from("workspaces")
      .select("id, status, escrow_amount_paise, escrow_funded, buyer_id")
      .eq("id", workspaceId)
      .maybeSingle();
    if (wsErr || !ws) {
      return NextResponse.json({ ok: false, error: "Workspace not found" }, { status: 404 });
    }
    const w = ws as any;
    if (w.buyer_id !== user.id) {
      return NextResponse.json({ ok: false, error: "Only the buyer can fund this workspace" }, { status: 403 });
    }
    if (w.escrow_funded) {
      return NextResponse.json({ ok: false, error: "Escrow is already funded" }, { status: 400 });
    }
    if (w.status === "cancelled" || w.status === "frozen") {
      return NextResponse.json({ ok: false, error: `Cannot fund a ${w.status} workspace` }, { status: 400 });
    }

    const { data: profile } = await sb
      .from("users")
      .select("full_name, email, phone")
      .eq("id", user.id)
      .maybeSingle();

    // 2. Create the Razorpay order. For TEST mode use the test key pair
    //    from the dashboard. For LIVE, just swap env vars.
    try {
      const order = await createRazorpayOrder(
        Number(w.escrow_amount_paise),
        `ws_${workspaceId.replace(/-/g, "").slice(0, 16)}_${Date.now()}`,
        {
          workspace_id: workspaceId,
          buyer_id: user.id,
          purpose: "workspace_escrow",
        }
      );
      return NextResponse.json({
        ok: true,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? process.env.RAZORPAY_KEY_ID,
        workspaceId,
        user: {
          name: (profile as any)?.full_name ?? "HiVR User",
          email: (profile as any)?.email ?? user.email ?? "",
          contact: (profile as any)?.phone ?? "",
        },
      });
    } catch (e) {
      // Log without leaking workspace context/PII to server logs
      // eslint-disable-next-line no-console
      console.error("[fund/create-order] Razorpay error");
      return NextResponse.json({ ok: false, error: (e as Error).message ?? "Could not create Razorpay order" }, { status: 502 });
    }
  } catch (e) {
    if (e instanceof SecurityError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
