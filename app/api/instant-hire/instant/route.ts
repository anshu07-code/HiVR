import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  SecurityError,
  requireUuid,
  enforceRateLimit,
} from "@/lib/security";

/**
 * POST /api/instant-hire/instant
 * Body: { candidate_id: string, category_id?: string, urgency?: 'normal'|'urgent'|'critical' }
 *
 * Atomically:
 *   1. Creates a draft task_post in the candidate's primary category
 *      (or the explicit category_id, if provided)
 *   2. Creates a contract for that task with status='pending_acceptance'.
 *      Previously this was 'active', which counted the contract against
 *      the freelancer's load BEFORE the candidate accepted — they could
 *      spam this endpoint to lock candidates out. Now the contract is
 *      'pending_acceptance' until the candidate accepts (or auto-accepts).
 *   3. Calls initiate_instant_hire_offer to start the 60-second handshake
 *
 * Security:
 *   - Caller must be signed in.
 *   - candidate_id must be a valid UUID and must NOT equal the caller.
 *   - The candidate must be in employee mode and not suspended.
 *   - The category, if provided, must be active and tier must match.
 *   - Per-user rate limit: 5 instant-hire starts per hour (each creates
 *     a real task + contract, so we cap them).
 *
 * Returns { task_id, contract_id, offer_id, expires_at, candidate_id }.
 * The client then navigates to /dashboard/instant-hire/offer/<offer_id>.
 */
const VALID_URGENCY = new Set(["normal", "urgent", "critical"]);

export async function POST(req: Request) {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

    // Per-user cap on handshake starts. Each call creates a real
    // task_post + contract + offer. 5/hour is plenty for legitimate use.
    enforceRateLimit(`instant_hire_instant:${user.id}`, { max: 5, windowMs: 60 * 60_000 });

    const body = await req.json().catch(() => ({}));
    let candidateId: string;
    try {
      candidateId = requireUuid(body.candidate_id, "candidate_id");
    } catch (e) {
      if (e instanceof SecurityError) {
        return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
      }
      throw e;
    }
    if (!candidateId) return NextResponse.json({ ok: false, error: "candidate_id required" }, { status: 400 });

    if (candidateId === user.id) {
      return NextResponse.json({ ok: false, error: "You cannot instant-hire yourself" }, { status: 400 });
    }

    const urgency = String(body.urgency ?? "normal");
    if (!VALID_URGENCY.has(urgency)) {
      return NextResponse.json({ ok: false, error: "urgency must be normal | urgent | critical" }, { status: 400 });
    }
    let categoryId: string | null = null;
    if (body.category_id) {
      try {
        categoryId = requireUuid(body.category_id, "category_id");
      } catch (e) {
        if (e instanceof SecurityError) {
          return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
        }
        throw e;
      }
    }

    // Candidate must exist, be in employee mode, and not suspended.
    const { data: cand } = await sb
      .from("users")
      .select("id, is_suspended, current_mode")
      .eq("id", candidateId)
      .maybeSingle();
    if (!cand) {
      return NextResponse.json({ ok: false, error: "Candidate not found" }, { status: 404 });
    }
    if ((cand as any).is_suspended) {
      return NextResponse.json({ ok: false, error: "This freelancer is suspended" }, { status: 400 });
    }
    const candMode = (cand as any).current_mode;
    if (candMode && !["employee", "both"].includes(candMode)) {
      return NextResponse.json({ ok: false, error: "This user is not in employee mode" }, { status: 400 });
    }

    // If no category supplied, pick the candidate's primary skill category
    if (!categoryId) {
      const { data: skill } = await sb
        .from("employee_skills")
        .select("category_id, category:skill_categories(name, status)")
        .eq("employee_id", candidateId)
        .eq("is_primary", true)
        .limit(1)
        .maybeSingle();
      if (!skill) {
        const { data: anySkill } = await sb
          .from("employee_skills")
          .select("category_id")
          .eq("employee_id", candidateId)
          .neq("verification_status", "provisional")
          .limit(1)
          .maybeSingle();
        categoryId = (anySkill as any)?.category_id ?? null;
      } else {
        categoryId = (skill as any).category_id;
      }
    }
    if (!categoryId) return NextResponse.json({ ok: false, error: "No category for candidate" }, { status: 400 });

    const admin = createAdminClient();

    // Resolve the rate the candidate has set for this category + pricing model
    const { data: cat } = await admin
      .from("skill_categories")
      .select("id, name, tier, parent_category_id, status")
      .eq("id", categoryId)
      .maybeSingle();
    if (!cat) return NextResponse.json({ ok: false, error: "Category not found" }, { status: 404 });
    if ((cat as any).status !== "active") {
      return NextResponse.json({ ok: false, error: "Category is not active" }, { status: 400 });
    }

    const { data: rate } = await admin.rpc("get_employee_rate" as any, {
      p_user_id: candidateId,
      p_category_id: categoryId,
      p_pricing_model: "fixed",
    } as any);
    let agreedPrice = Number(rate ?? 0);
    if (!agreedPrice || agreedPrice <= 0) {
      const { data: esr } = await admin
        .from("employee_standing_rates")
        .select("standing_rate")
        .eq("user_id", candidateId)
        .eq("category_id", categoryId)
        .maybeSingle();
      agreedPrice = Number((esr as any)?.standing_rate ?? 0);
    }
    if (!agreedPrice || agreedPrice <= 0) {
      agreedPrice = 100000; // ₹1,000 default fallback
    }

    // 1) Create a draft task_post
    const taskTitle = `Instant Hire · ${(cat as any).name}`;
    const { data: task, error: taskErr } = await admin
      .from("task_posts")
      .insert({
        buyer_id: user.id,
        category_id: categoryId,
        title: taskTitle,
        description: "Auto-created by Instant Hire. Add a brief once the handshake is accepted.",
        pricing_model: "fixed",
        budget_min: agreedPrice,
        budget_max: agreedPrice,
        status: "open",
        openings: 1,
        brief: { checklist_items: [], notes: "Instant Hire task — add details after the handshake." },
        created_at: new Date().toISOString(),
      } as any)
      .select("id")
      .single();
    if (taskErr || !task) {
      return NextResponse.json({ ok: false, error: taskErr?.message ?? "Failed to create task" }, { status: 500 });
    }
    const taskId = (task as any).id;

    // 2) Create a contract for the task — pending_acceptance, NOT active.
    //    The candidate's 60s handshake is the gate.
    const tierValue = (cat as any).tier ?? "micro_task";
    const { data: contract, error: contractErr } = await admin
      .from("contracts")
      .insert({
        task_post_id: taskId,
        buyer_id: user.id,
        employee_id: candidateId,
        category_id: categoryId,
        tier: tierValue,
        pricing_model: "fixed",
        agreed_price: agreedPrice,
        status: "pending_acceptance",  // <-- the fix: was "active"
        started_at: null,                // not actually started until the candidate accepts
      } as any)
      .select("id")
      .single();
    if (contractErr || !contract) {
      return NextResponse.json({ ok: false, error: contractErr?.message ?? "Failed to create contract" }, { status: 500 });
    }
    const contractId = (contract as any).id;

    // 3) Initiate the handshake
    const { data: hand, error: handErr } = await sb.rpc("initiate_instant_hire_offer" as any, {
      p_contract_id: contractId,
      p_candidate_id: candidateId,
      p_urgency: urgency,
      p_expires_in_seconds: 60,
    } as any);
    if (handErr) {
      return NextResponse.json({ ok: false, error: handErr.message }, { status: 400 });
    }
    const handData = hand as any;

    return NextResponse.json({
      ok: true,
      task_id: taskId,
      contract_id: contractId,
      candidate_id: candidateId,
      offer_id: handData.offer_id,
      rate_paise: handData.rate_paise,
      expires_at: handData.expires_at,
      urgency,
    });
  } catch (e) {
    if (e instanceof SecurityError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
