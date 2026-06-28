import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/payout/update
 *
 * Update the user's payout method (UPI / Bank).
 *
 *   Body: {
 *     method:      "upi" | "bank",
 *     upiId?:      string,      // when method=upi
 *     upiProvider?:string,
 *     accountHolder?:string,    // when method=bank
 *     ifsc?:       string,
 *     accountNumber?:string,    // bank — we store last 4 only
 *   }
 *
 * The user can update their payout method anytime. The actual transfer
 * to this account happens when:
 *   - Employee submits a contract delivery AND buyer marks it done
 *     (Razorpay payout triggered automatically)
 *   - User initiates a manual withdrawal from their wallet
 *
 * We do NOT process the actual transfer here — we only record where
 * the user wants to be paid. Verification of the payout method is a
 * separate flow (via the bank_verifications step in the KYC wizard).
 */

const UPI_REGEX = /^[a-zA-Z0-9._-]{3,}@[a-zA-Z]{2,}$/;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_REGEX = /^[0-9]{9,18}$/;

export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const method = body.method === "upi" || body.method === "bank" ? body.method : null;
  if (!method) return NextResponse.json({ ok: false, error: "method must be 'upi' or 'bank'" }, { status: 400 });

  const updates: Record<string, any> = {};

  if (method === "upi") {
    const upiId = String(body.upiId ?? "").trim().toLowerCase();
    if (!UPI_REGEX.test(upiId)) {
      return NextResponse.json({ ok: false, error: "Invalid UPI ID (e.g. name@bank)" }, { status: 400 });
    }
    updates.upi_id = upiId;
    updates.upi_provider_name = body.upiProvider ? String(body.upiProvider).slice(0, 40) : null;
    // Don't reset upi_verified_at — let admin re-verify if needed
  } else {
    const accountHolder = String(body.accountHolder ?? "").trim();
    const ifsc = String(body.ifsc ?? "").trim().toUpperCase();
    const accountNumber = String(body.accountNumber ?? "").replace(/\s+/g, "");
    if (!accountHolder || accountHolder.length < 3) {
      return NextResponse.json({ ok: false, error: "Account holder name required" }, { status: 400 });
    }
    if (!IFSC_REGEX.test(ifsc)) {
      return NextResponse.json({ ok: false, error: "Invalid IFSC (e.g. SBIN0001234)" }, { status: 400 });
    }
    if (!ACCOUNT_REGEX.test(accountNumber)) {
      return NextResponse.json({ ok: false, error: "Invalid account number" }, { status: 400 });
    }
    updates.account_holder = accountHolder;
    updates.ifsc = ifsc;
    updates.account_last4 = accountNumber.slice(-4);
    // Don't reset bank_verified_at
  }
  updates.payout_method = method;

  const { error } = await sb.from("users").update(updates).eq("id", user.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, method });
}
