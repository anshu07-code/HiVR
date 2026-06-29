import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** POST /api/applications/offer — buyer sends an offer to the applicant.
 *  The offer is bargainable but the buyer cannot go below 80% of the
 *  employee's standing rate for the task's pricing model. The employee
 *  decides whether to accept or decline.
 */
export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const applicationId = String(body.application_id ?? "");
  const amountPaise = Number(body.amount_paise ?? 0);
  const message = String(body.message ?? "").trim() || null;
  const daysToExpire = Math.max(1, Math.min(30, Number(body.days_to_expire ?? 7)));

  if (!applicationId) return NextResponse.json({ error: "application_id required" }, { status: 400 });

  // Verify the user is the task's buyer
  const { data: app } = await sb
    .from("task_applications")
    .select("id, task_id, employee_id, task_posts!inner(buyer_id, category_id, pricing_model)")
    .eq("id", applicationId)
    .maybeSingle();
  if (!app) return NextResponse.json({ error: "Application not found" }, { status: 404 });
  if (((app as any).task_posts as any)?.buyer_id !== user.id) {
    return NextResponse.json({ error: "Not your task" }, { status: 403 });
  }

  // Enforce the -20% floor: the offer must be >= 80% of the employee's
  // standing rate for the task's pricing model.
  const task = (app as any).task_posts;
  const { data: rateRow } = await sb
    .from("employee_skills")
    .select("rate_per_hour_paise, rate_per_task_paise, rate_per_day_paise, rate_per_week_paise")
    .eq("employee_id", (app as any).employee_id)
    .eq("category_id", task.category_id)
    .maybeSingle();
  const pm = task.pricing_model ?? "fixed";
  const employeeRatePaise =
    pm === "hourly" ? rateRow?.rate_per_hour_paise :
    pm === "fixed"  ? rateRow?.rate_per_task_paise :
    pm === "daily_rate" ? rateRow?.rate_per_day_paise :
    pm === "fixed_milestone" ? rateRow?.rate_per_week_paise :
    null;
  if (employeeRatePaise && amountPaise > 0) {
    const minPaise = Math.round(employeeRatePaise * 0.8);
    if (amountPaise < minPaise) {
      return NextResponse.json(
        { error: `Offer must be at least ₹${(minPaise / 100).toFixed(2)} (80% of the employee's standing rate of ₹${(employeeRatePaise / 100).toFixed(2)}). Send Offer is for bargaining — Hire Directly is for the full rate.` },
        { status: 400 },
      );
    }
  }

  // Create the offer
  const expiresAt = new Date(Date.now() + daysToExpire * 86400000).toISOString();
  const { data: offer, error } = await sb.from("application_offers").insert({
    application_id: applicationId,
    sent_by: user.id,
    amount_paise: amountPaise > 0 ? amountPaise : null,
    expires_at: expiresAt,
    message,
  }).select("id, application_id, sent_by, amount_paise, expires_at, message, status, created_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Bump the application's hiring_stage to 'offer' (which the trigger syncs to status='shortlisted')
  await sb.from("task_applications").update({
    hiring_stage: "offer",
    hiring_stage_history: ((app as any).hiring_stage_history ?? []).concat([{ from: (app as any).hiring_stage, to: "offer", at: new Date().toISOString(), note: "Offer sent" }]),
  }).eq("id", applicationId);

  // Notify the employee
  await sb.rpc("create_notification" as any, {
    p_user_id: (app as any).employee_id,
    p_type: "hiring_stage",
    p_title: "You received an offer!",
    p_body: `Open the offer to review terms and accept. You have ${daysToExpire} day${daysToExpire === 1 ? "" : "s"} to respond.`,
    p_link: "/dashboard/applications",
  } as any);

  return NextResponse.json({ ok: true, offer });
}
