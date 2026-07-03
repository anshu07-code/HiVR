import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Round = {
  id: string;
  application_id: string;
  round_number: number;
  offered_by: "buyer" | "employee";
  amount_paise: number;
  time_minutes: number | null;
  message: string | null;
  status: string;
  parent_round_id: string | null;
  created_at: string;
};

/** GET /api/applications/settlement?application_id=xxx
 *  Returns existing settlement rounds for the application.
 */
export async function GET(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const applicationId = req.nextUrl.searchParams.get("application_id");
  if (!applicationId) return NextResponse.json({ error: "application_id required" }, { status: 400 });

  const { data: rounds, error } = await sb
    .from("settlement_rounds")
    .select("*")
    .eq("application_id", applicationId)
    .order("round_number", { ascending: false })
    .limit(3);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, rounds: rounds ?? [] });
}

/** POST /api/applications/settlement
 *  Body: { action: "start" | "counter" | "accept" | "decline", ... }
 *
 *  start:   buyer initiates settlement with first offer (within task budget_min–max)
 *  counter: either party counters the last pending round
 *  accept:  either party accepts the last pending round → contract created
 *  decline: either party declines → settlement closed
 */
export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");
  const applicationId = String(body.application_id ?? "");

  if (!applicationId) return NextResponse.json({ error: "application_id required" }, { status: 400 });

  // Fetch the application with task info
  const { data: app } = await sb
    .from("task_applications")
    .select("id, employee_id, task_id, hiring_stage, task_posts!inner(id, buyer_id, title, budget_min, budget_max, pricing_model, estimated_hours, category_id)")
    .eq("id", applicationId)
    .maybeSingle();

  if (!app) return NextResponse.json({ error: "Application not found" }, { status: 404 });

  const task = (app as any).task_posts as any;
  const isBuyer = task.buyer_id === user.id;
  const isEmployee = (app as any).employee_id === user.id;

  if (!isBuyer && !isEmployee) {
    return NextResponse.json({ error: "Not a participant in this application" }, { status: 403 });
  }

  // Fetch latest rounds for this application
  const { data: existingRounds } = await sb
    .from("settlement_rounds")
    .select("*")
    .eq("application_id", applicationId)
    .order("round_number", { ascending: false })
    .limit(3);

  const rounds = (existingRounds ?? []) as Round[];
  const lastRound = rounds[0] ?? null;
  const currentRoundNum = lastRound ? lastRound.round_number : 0;

  switch (action) {
    // ---- START: buyer initiates the first round ----
    case "start": {
      if (!isBuyer) return NextResponse.json({ error: "Only the buyer can start a settlement" }, { status: 403 });
      if (rounds.length > 0) return NextResponse.json({ error: "Settlement already in progress" }, { status: 400 });

      const amountPaise = Number(body.amount_paise ?? task.budget_min ?? 0);
      const timeMinutes = body.time_minutes != null ? Number(body.time_minutes) : null;
      const message = String(body.message ?? "").trim() || null;

      // Validate price within task budget range
      if (amountPaise < task.budget_min || amountPaise > task.budget_max) {
        return NextResponse.json({
          error: `Offer must be between ₹${(task.budget_min / 100).toFixed(2)} and ₹${(task.budget_max / 100).toFixed(2)} (the task budget range)`,
        }, { status: 400 });
      }

      // Validate time if pricing model is hourly
      if (task.pricing_model === "hourly" && (!timeMinutes || timeMinutes < 15)) {
        return NextResponse.json({ error: "Please specify an estimated time (min 15 minutes)" }, { status: 400 });
      }

      const { data: round, error } = await sb.from("settlement_rounds").insert({
        application_id: applicationId,
        round_number: 1,
        offered_by: "buyer",
        amount_paise: amountPaise,
        time_minutes: timeMinutes,
        message,
        status: "pending",
      }).select().single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // Update application hiring stage to 'offer'
      await sb.from("task_applications").update({
        hiring_stage: "offer",
        hiring_stage_history: ((app as any).hiring_stage_history ?? []).concat([
          { from: (app as any).hiring_stage, to: "offer", at: new Date().toISOString(), note: "Settlement started" },
        ]),
      }).eq("id", applicationId);

      // Notify the employee
      await sb.rpc("create_notification" as any, {
        p_user_id: (app as any).employee_id,
        p_type: "hiring_stage",
        p_title: "You received an offer!",
        p_body: `${task.title ?? "A buyer"} sent you a settlement offer of ₹${(amountPaise / 100).toFixed(2)}. Open it to review, counter, or accept.`,
        p_link: `/dashboard/applications?settleAppId=${applicationId}`,
      } as any);

      return NextResponse.json({ ok: true, round });
    }

    // ---- COUNTER: either party counters the last pending round ----
    case "counter": {
      if (!lastRound || lastRound.status !== "pending") {
        return NextResponse.json({ error: "No pending round to counter" }, { status: 400 });
      }
      if (currentRoundNum >= 3) {
        return NextResponse.json({ error: "Maximum 3 rounds of negotiation reached. Accept or decline the current offer." }, { status: 400 });
      }
      // Only the other party can counter
      if (lastRound.offered_by === "buyer" && !isEmployee) {
        return NextResponse.json({ error: "Only the employee can counter the buyer's offer" }, { status: 403 });
      }
      if (lastRound.offered_by === "employee" && !isBuyer) {
        return NextResponse.json({ error: "Only the buyer can counter the employee's offer" }, { status: 403 });
      }

      const amountPaise = Number(body.amount_paise ?? task.budget_min ?? 0);
      const timeMinutes = body.time_minutes != null ? Number(body.time_minutes) : lastRound.time_minutes;
      const message = String(body.message ?? "").trim() || null;

      // Validate price within task budget range
      if (amountPaise < task.budget_min || amountPaise > task.budget_max) {
        return NextResponse.json({
          error: `Counter must be between ₹${(task.budget_min / 100).toFixed(2)} and ₹${(task.budget_max / 100).toFixed(2)}`,
        }, { status: 400 });
      }

      if (task.pricing_model === "hourly" && (!timeMinutes || timeMinutes < 15)) {
        return NextResponse.json({ error: "Please specify an estimated time (min 15 minutes)" }, { status: 400 });
      }

      // Mark previous round as countered
      await sb.from("settlement_rounds").update({ status: "countered" }).eq("id", lastRound.id);

      // Insert new round
      const { data: newRound, error } = await sb.from("settlement_rounds").insert({
        application_id: applicationId,
        round_number: currentRoundNum + 1,
        offered_by: isBuyer ? "buyer" : "employee",
        amount_paise: amountPaise,
        time_minutes: timeMinutes,
        message,
        parent_round_id: lastRound.id,
        status: "pending",
      }).select().single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // Notify the other party
      const notifyUserId = isBuyer ? (app as any).employee_id : task.buyer_id;
      const notifyLink = isBuyer
        ? `/dashboard/applications?settleAppId=${applicationId}`
        : `/dashboard/tasks/${(app as any).task_id}/applicants?settleAppId=${applicationId}`;
      await sb.rpc("create_notification" as any, {
        p_user_id: notifyUserId,
        p_type: "hiring_stage",
        p_title: "New counter offer received",
        p_body: `Round ${currentRoundNum + 1}: ₹${(amountPaise / 100).toFixed(2)}${task.pricing_model === "hourly" ? ` for ${timeMinutes ?? "?"} min` : ""}. Review and respond.`,
        p_link: notifyLink,
      } as any);

      return NextResponse.json({ ok: true, round: newRound });
    }

    // ---- ACCEPT: either party accepts the last pending round ----
    case "accept": {
      if (!lastRound || lastRound.status !== "pending") {
        return NextResponse.json({ error: "No pending round to accept" }, { status: 400 });
      }

      // Calculate final price
      let finalAmountPaise = lastRound.amount_paise;
      if (task.pricing_model === "hourly" && lastRound.time_minutes) {
        const hours = lastRound.time_minutes / 60;
        finalAmountPaise = Math.round(lastRound.amount_paise * hours);
      }

      // Mark round as accepted
      await sb.from("settlement_rounds").update({ status: "accepted" }).eq("id", lastRound.id);

      // Use admin client for writes to bypass RLS (same as hire_applicant's SECURITY DEFINER)
      const admin = createAdminClient();

      // Derive tier from category
      const { data: catRow } = await sb.from("skill_categories").select("tier").eq("id", task.category_id).maybeSingle();
      const tier = (catRow as any)?.tier ?? "micro_task";

      const { data: contract, error: ce } = await admin.from("contracts").insert({
        task_post_id: (app as any).task_id,
        buyer_id: task.buyer_id,
        employee_id: (app as any).employee_id,
        category_id: task.category_id,
        tier,
        pricing_model: task.pricing_model,
        agreed_price: finalAmountPaise,
        status: "active",
        started_at: new Date().toISOString(),
      }).select().single();
      if (ce) return NextResponse.json({ error: ce.message }, { status: 500 });

      // Update application
      await admin.from("task_applications").update({
        hiring_stage: "hired",
        hiring_stage_updated_at: new Date().toISOString(),
        bid_paise: finalAmountPaise,
      }).eq("id", applicationId);

      // Update task status
      await admin.from("task_posts").update({ status: "in_contract", updated_at: new Date().toISOString() })
        .eq("id", (app as any).task_id)
        .not("status", "in", ["closed", "cancelled"]);

      // Create workspace
      await admin.from("workspaces").insert({
        contract_id: contract.id,
        buyer_id: task.buyer_id,
        employee_id: (app as any).employee_id,
        status: "awaiting_funding",
        escrow_amount_paise: finalAmountPaise,
      });

      // Auto-close task if all openings filled
      try { await (admin.rpc as any)("auto_close_task_if_full", { p_task_id: (app as any).task_id }); } catch {}

      // Notify the other party
      const otherId = isBuyer ? (app as any).employee_id : task.buyer_id;
      await admin.rpc("create_notification" as any, {
        p_user_id: otherId,
        p_type: "hired",
        p_title: "Offer accepted!",
        p_body: `Offer accepted at ₹${(finalAmountPaise / 100).toFixed(2)}. Contract created.`,
        p_link: `/dashboard/contracts/${contract.id}`,
      } as any);

      return NextResponse.json({ ok: true, contract_id: contract.id, round: { ...lastRound, status: "accepted" } });
    }

    // ---- DECLINE: either party declines the last pending round ----
    case "decline": {
      const isAutoExpire = body.auto_expire === true;

      if (!lastRound) {
        return NextResponse.json({ error: "No round to decline" }, { status: 400 });
      }
      if (!isAutoExpire && lastRound.status !== "pending") {
        return NextResponse.json({ error: "No pending round to decline" }, { status: 400 });
      }

      const expireStatus = isAutoExpire ? "expired" : "declined";
      await sb.from("settlement_rounds").update({ status: expireStatus }).eq("id", lastRound.id);

      // Mark all rounds as expired/declined
      await sb.from("settlement_rounds").update({ status: expireStatus })
        .eq("application_id", applicationId)
        .in("status", expireStatus === "expired" ? ["pending", "countered"] : ["pending", "countered"]);

      // Revert application hiring_stage to previous stage so buyer can move on
      const history = (app as any).hiring_stage_history ?? [];
      const lastEntry = history[history.length - 1];
      const prevStage = lastEntry?.from ?? "shortlist";
      const admin = createAdminClient();
      await admin.from("task_applications").update({
        hiring_stage: prevStage,
        hiring_stage_history: history.concat([
          { from: "offer", to: prevStage, at: new Date().toISOString(), note: "Settlement declined" },
        ]),
      }).eq("id", applicationId);

      // Notify the other party (skip for auto-expire)
      if (!isAutoExpire) {
        const otherId = isBuyer ? (app as any).employee_id : task.buyer_id;
        const declineLink = isBuyer
          ? `/dashboard/applications?settleAppId=${applicationId}`
          : `/dashboard/tasks/${(app as any).task_id}/applicants?settleAppId=${applicationId}`;
        await sb.rpc("create_notification" as any, {
          p_user_id: otherId,
          p_type: "hiring_stage",
          p_title: "Offer declined",
          p_body: `The ${isBuyer ? "buyer" : "employee"} declined the offer for "${task.title}".`,
          p_link: declineLink,
        } as any);
      }

      return NextResponse.json({ ok: true, declined: true });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}. Use start, counter, accept, or decline.` }, { status: 400 });
  }
}
