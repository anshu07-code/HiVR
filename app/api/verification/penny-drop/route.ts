import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

/**
 * POST /api/verification/penny-drop
 *
 * Step 1 of bank account verification. The user enters their account
 * number + IFSC; we (in production) send 1 INR to that account and read
 * back the holder's name from our bank. In sandbox, we just generate a
 * deterministic code and return it.
 *
 * Real flow:
 *   1. Buyer POSTs { account_number, ifsc, account_holder }
 *   2. We POST to our bank's penny-drop API
 *   3. The bank sends 1 INR + a 6-digit code in the description
 *   4. The buyer enters the code in the wizard
 *   5. We POST to /api/verification/start with the code to confirm
 *
 * Sandbox:
 *   1. Buyer POSTs { account_number, ifsc, account_holder }
 *   2. We validate format
 *   3. We return { code: "123456", expires_in: 600 } + display the code
 *      on the wizard so the user can see it.
 */

const InitSchema = z.object({
  account_number: z.string().regex(/^\d{9,18}$/, "Account number must be 9-18 digits"),
  ifsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "IFSC looks wrong (e.g. HDFC0001234)"),
  account_holder: z.string().min(2).max(120),
});

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;

export async function POST(req: Request) {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, reason: "Not signed in" }, { status: 401 });

    const body = await req.json();
    const parsed = InitSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, reason: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }

    // Rate-limit so attackers can't spam penny-drop requests against a
    // bank. We use the recent-inserts trick on `verifications` as a
    // proxy for "how many bank attempts recently".
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { count: recentCount } = await sb
      .from("verifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("doc_type", "bank")
      .gte("created_at", since);
    if ((recentCount ?? 0) >= RATE_LIMIT_MAX) {
      return NextResponse.json({ ok: false, reason: "Too many attempts. Please wait a minute." }, { status: 429 });
    }

    // Sandbox returns a fixed code so the user can complete the flow
    // without a real bank. Real implementation would call the bank API
    // and the user would read the code from their bank statement.
    const SANDBOX_CODE = "123456";
    return NextResponse.json({
      ok: true,
      code: SANDBOX_CODE,
      expires_in: 600,
      account_holder: parsed.data.account_holder,
      account_number_last4: parsed.data.account_number.slice(-4),
      ifsc: parsed.data.ifsc,
      message: `Sandbox: enter code ${SANDBOX_CODE} in the next step.`,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, reason: (e as Error).message }, { status: 500 });
  }
}
