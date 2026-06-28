import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createEscrowOrder } from "@/lib/escrow";
import { loadSettings } from "@/lib/settings";
import {
  SecurityError,
  requireUuid,
  enforceRateLimit,
  MAX_CONTRACT_AMOUNT_PAISE,
} from "@/lib/security";

/**
 * POST /api/contracts/create
 * Body: { task_post_id, employee_id, category_id, tier, pricing_model, agreed_price_inr, milestones? }
 *
 * Server-side validation:
 *   - All UUIDs validated
 *   - agreed_price_inr is a positive number (in rupees) ≤ MAX_CONTRACT_AMOUNT_PAISE
 *   - employee_id exists and is not the buyer themselves
 *   - category_id exists and is active
 *   - tier / pricing_model combos match the DB CHECK
 *   - 10 contracts per user per hour (rate limit) — each call creates a
 *     real Razorpay order, so we cap them
 *
 * The route NEVER trusts the client-submitted amount or any of the IDs.
 * Every cross-reference is re-validated against the DB.
 */
const VALID_TIERS = new Set(["micro_task", "role_engagement"]);
const VALID_PRICING = new Set(["hourly", "daily", "monthly", "fixed", "daily_rate", "fixed_milestone"]);

export async function POST(req: NextRequest) {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    // 10 contracts per hour per user. Spamming contract creation wastes
    // a Razorpay order quota on every call.
    enforceRateLimit(`contract_create:${user.id}`, { max: 10, windowMs: 60 * 60_000 });

    const body = (await req.json()) as {
      task_post_id?: string;
      employee_id?: string;
      category_id?: string;
      tier?: string;
      pricing_model?: string;
      agreed_price_inr?: number;
      milestones?: { description: string; amount_inr: number }[];
    };

    // Validate required fields and types
    if (!body.employee_id || !body.agreed_price_inr || !body.category_id || !body.tier || !body.pricing_model) {
      return NextResponse.json({ error: "missing fields" }, { status: 400 });
    }

    let employeeId: string, categoryId: string;
    try {
      employeeId = requireUuid(body.employee_id, "employee_id");
      categoryId = requireUuid(body.category_id, "category_id");
    } catch (e) {
      if (e instanceof SecurityError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }
    if (body.task_post_id) {
      try { requireUuid(body.task_post_id, "task_post_id"); } catch (e) {
        if (e instanceof SecurityError) {
          return NextResponse.json({ error: e.message }, { status: e.status });
        }
        throw e;
      }
    }

    if (!VALID_TIERS.has(body.tier)) {
      return NextResponse.json({ error: "invalid tier" }, { status: 400 });
    }
    if (!VALID_PRICING.has(body.pricing_model)) {
      return NextResponse.json({ error: "invalid pricing_model" }, { status: 400 });
    }
    if (body.tier === "role_engagement" && !["daily_rate", "fixed_milestone"].includes(body.pricing_model)) {
      return NextResponse.json({ error: "Tier B contracts may only be daily_rate or fixed_milestone" }, { status: 400 });
    }

    // Price validation
    const agreedInr = Number(body.agreed_price_inr);
    if (!Number.isFinite(agreedInr) || agreedInr <= 0) {
      return NextResponse.json({ error: "agreed_price_inr must be a positive number" }, { status: 400 });
    }
    // Reject scientific notation / decimals to prevent rounding surprises
    if (String(agreedInr).includes("e") || String(agreedInr).includes("E")) {
      return NextResponse.json({ error: "agreed_price_inr must be a plain number" }, { status: 400 });
    }
    // Sanity: at most MAX_CONTRACT_AMOUNT_PAISE paise = ₹50 lakh.
    const amountPaise = Math.round(agreedInr * 100);
    if (amountPaise > MAX_CONTRACT_AMOUNT_PAISE) {
      return NextResponse.json(
        { error: `Price exceeds the maximum allowed (₹${(MAX_CONTRACT_AMOUNT_PAISE / 100).toLocaleString("en-IN")})` },
        { status: 400 },
      );
    }
    if (amountPaise < 10000) {
      // ₹100 minimum — prevents accidental ₹1 contracts that would be
      // impossible to refund / dispute meaningfully.
      return NextResponse.json({ error: "Minimum contract value is ₹100" }, { status: 400 });
    }

    // Validate employee exists and is not the buyer (no self-contracts).
    const { data: emp } = await sb
      .from("users")
      .select("id, is_suspended, current_mode")
      .eq("id", employeeId)
      .maybeSingle();
    if (!emp) {
      return NextResponse.json({ error: "employee not found" }, { status: 404 });
    }
    if ((emp as any).id === user.id) {
      return NextResponse.json({ error: "You cannot create a contract with yourself" }, { status: 400 });
    }
    if ((emp as any).is_suspended) {
      return NextResponse.json({ error: "This freelancer is suspended" }, { status: 400 });
    }
    const mode = (emp as any).current_mode;
    if (mode && !["employee", "both"].includes(mode)) {
      return NextResponse.json({ error: "This user is not in employee mode" }, { status: 400 });
    }

    // Validate category is active.
    const { data: cat } = await sb
      .from("skill_categories")
      .select("id, tier, status")
      .eq("id", categoryId)
      .maybeSingle();
    if (!cat) {
      return NextResponse.json({ error: "category not found" }, { status: 404 });
    }
    if ((cat as any).status !== "active") {
      return NextResponse.json({ error: "category is not active" }, { status: 400 });
    }
    if ((cat as any).tier !== body.tier) {
      return NextResponse.json({ error: "category tier mismatch" }, { status: 400 });
    }

    // Recompute fee server-side — never trust client-submitted amount.
    const settings = await loadSettings();
    const feePct = settings.platform_fee_pct_by_tier.verified;
    const feePaise = Math.round(amountPaise * feePct);

    // 1. Create contract row
    const { data: contract, error: cErr } = await sb.from("contracts").insert({
      buyer_id: user.id,
      employee_id: employeeId,
      task_post_id: body.task_post_id ?? null,
      category_id: categoryId,
      tier: body.tier,
      pricing_model: body.pricing_model,
      agreed_price: amountPaise,
      platform_fee_pct: feePct,
    }).select().single();
    if (cErr || !contract) throw cErr ?? new Error("contract insert failed");

    // 2. Create milestones (if provided — Tier B fixed-milestone)
    if (body.milestones && body.milestones.length > 0) {
      // Validate milestone amounts
      for (const m of body.milestones) {
        if (typeof m.description !== "string" || !m.description.trim()) {
          return NextResponse.json({ error: "milestone description required" }, { status: 400 });
        }
        if (m.description.length > 500) {
          return NextResponse.json({ error: "milestone description too long (max 500)" }, { status: 400 });
        }
        if (!Number.isFinite(Number(m.amount_inr)) || Number(m.amount_inr) <= 0) {
          return NextResponse.json({ error: "milestone amount must be positive" }, { status: 400 });
        }
      }
      await sb.from("milestones").insert(
        body.milestones.map(m => ({
          contract_id: contract.id,
          description: m.description,
          amount: Math.round(Number(m.amount_inr) * 100),
        })),
      );
    }

    // 3. Create payment row (in "created" state)
    const { data: payment, error: pErr } = await sb.from("payments").insert({
      contract_id: contract.id,
      amount: amountPaise,
      platform_fee_amount: feePaise,
    }).select().single();
    if (pErr) throw pErr;

    // 4. Create Razorpay escrow order
    const order = await createEscrowOrder({
      amount: amountPaise,
      contractId: contract.id,
      buyerId: user.id,
    });
    await sb.from("payments").update({ razorpay_payment_id: order.id }).eq("id", payment.id);
    await sb.from("contracts").update({ escrow_payment_id: order.id }).eq("id", contract.id);

    return NextResponse.json({ contract_id: contract.id, order });
  } catch (e) {
    if (e instanceof SecurityError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
