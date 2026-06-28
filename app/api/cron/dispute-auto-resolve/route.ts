/**
 * Cron: handles auto-decide (7d) + auto-split (30d) for business disputes.
 *
 * Schedule: every hour. Call with `Authorization: Bearer ${CRON_SECRET}`.
 *
 * Logic:
 *   1. For each dispute past auto_decide_at with status='open' or
 *      'under_review', look at the evidence. If both sides submitted
 *      evidence, do a "split". If only the raiser submitted, resolve in
 *      the raiser's favour. If no evidence from either side, also split.
 *   2. For each dispute where the raiser is the employee and the
 *      business didn't submit evidence within 7 days, default to the
 *      employee (refund the employee) to favour the worker.
 *   3. After 30 days, if still unresolved, force-split 50/50.
 *
 * For the MVP we implement the deterministic 30-day auto-split and
 * 7-day default-to-raiser rules. Admin can override before the timer.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordDisputeLoss } from "@/lib/auth-context";
import { timingSafeEqual } from "@/lib/security";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || cronSecret.length < 16) {
    return NextResponse.json({ error: "server misconfigured" }, { status: 503 });
  }
  const headerSecret = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!headerSecret || !timingSafeEqual(headerSecret, cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createClient();
  const now = new Date();

  // 1. Auto-decide (7d): disputes past auto_decide_at
  const { data: autoDecideDue } = await sb.from("business_disputes")
    .select("id, business_id, contract_id, raised_by_role, raised_by_user_id, status, auto_decide_at")
    .in("status", ["open", "under_review"])
    .not("auto_decide_at", "is", null)
    .lte("auto_decide_at", now.toISOString());

  let autoDecided = 0;
  for (const d of ((autoDecideDue as unknown) as any[]) ?? []) {
    // Pull the evidence submitted
    const { data: ev } = await sb.from("business_dispute_evidence")
      .select("submitted_by_role")
      .eq("dispute_id", d.id);
    const businessEvidence = (ev ?? []).some((e: any) => e.submitted_by_role === "business");
    const employeeEvidence = (ev ?? []).some((e: any) => e.submitted_by_role === "employee");

    let resolution: "resolved_business" | "resolved_employee" | "split";
    if (businessEvidence && !employeeEvidence) {
      // Only the business submitted — they're likely right
      resolution = d.raised_by_role === "business" ? "resolved_business" : "resolved_business";
    } else if (employeeEvidence && !businessEvidence) {
      // Only the employee submitted — they're likely right
      resolution = d.raised_by_role === "employee" ? "resolved_employee" : "resolved_employee";
    } else if (businessEvidence && employeeEvidence) {
      // Both submitted — split
      resolution = "split";
    } else {
      // Neither submitted — default split (neutral)
      resolution = "split";
    }

    await applyResolution(sb, d.id, d.contract_id, resolution, "auto_decide");
    autoDecided++;
  }

  // 2. Auto-split (30d): disputes older than 30 days still unresolved
  //    (auto_decide_at was set to 7d; if both deadlines missed, force split)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400_000).toISOString();
  const { data: autoSplitDue } = await sb.from("business_disputes")
    .select("id, business_id, contract_id, created_at")
    .in("status", ["open", "under_review"])
    .lte("created_at", thirtyDaysAgo);

  let autoSplit = 0;
  for (const d of (autoSplitDue as any[]) ?? []) {
    // Only force-split if there's no recent admin involvement
    // (simple check: status still 'open' or 'under_review')
    await applyResolution(sb, d.id, d.contract_id, "split", "auto_split");
    autoSplit++;
  }

  return NextResponse.json({ ok: true, autoDecided, autoSplit });
}

async function applyResolution(sb: any, disputeId: string, contractId: string, resolution: "resolved_business" | "resolved_employee" | "split", kind: "auto_decide" | "auto_split") {
  // Pull the dispute for employee_id
  const { data: dispute } = await sb.from("business_disputes")
    .select("contract:contracts!business_disputes_contract_id_fkey(employee_id)")
    .eq("id", disputeId).maybeSingle();
  const employeeId = (dispute as any)?.contract?.employee_id;
  const favorOf = resolution === "resolved_business" ? "business" : resolution === "resolved_employee" ? "employee" : "split";
  const strikesAdded = resolution === "resolved_employee" ? 1 : 0;

  await sb.from("business_disputes").update({
    status: resolution,
    resolved_in_favor_of: favorOf,
    resolved_at: new Date().toISOString(),
    resolution_notes: `Auto-resolved (${kind === "auto_decide" ? "7-day" : "30-day"} timer).`,
    auto_decide_result: kind === "auto_decide" ? resolution : null,
    strikes_added: strikesAdded,
    funds_held: false,
    funds_released_at: new Date().toISOString(),
    funds_released_to: favorOf,
  } as any).eq("id", disputeId);

  if (strikesAdded > 0 && employeeId) {
    try { await recordDisputeLoss(employeeId, `Dispute auto-resolved (${kind})`); } catch {}
  }

  if (resolution === "resolved_employee") {
    await sb.from("contracts").update({ status: "completed", approved_at: new Date().toISOString() } as any).eq("id", contractId);
  } else if (resolution === "resolved_business") {
    await sb.from("contracts").update({ status: "cancelled" } as any).eq("id", contractId);
  }
}
