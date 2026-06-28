import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ACTION_TO_STATUS: Record<string, string> = {
  shortlist: "shortlisted",
  reject: "rejected",
  interview: "interviewing",
  offer: "offered",
  reset: "pending",
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "");
  const next = ACTION_TO_STATUS[action];
  if (!next) return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  // Verify the caller owns the business that owns the parent job
  const { data: app } = await sb.from("business_applicants")
    .select("id, job_id, user_id, cover_note, proposed_rate_paise, expected_start_date, job:business_jobs!business_applicants_job_id_fkey(id, title, business_id, category_id, wage_min_paise, wage_max_paise, employment_type, business:business_profiles!business_jobs_business_id_fkey(owner_user_id, kyc_status, is_suspended))")
    .eq("id", params.id).maybeSingle();
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const jobAny = (app as any).job;
  if (jobAny?.business?.owner_user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (action === "offer") {
    // KYC gate: business must be KYC verified before sending offers.
    if (jobAny?.business?.kyc_status !== "verified" || jobAny?.business?.is_suspended) {
      return NextResponse.json({
        error: "Complete business KYC verification before sending offers.",
        redirectTo: "/business/settings",
      }, { status: 403 });
    }

    // Plan-limit gate: check active contracts.
    const { data: sub } = await sb.from("business_subscriptions")
      .select("plan_key, status, active_contracts_count").eq("business_id", jobAny.business_id)
      .in("status", ["active", "trialing"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const planKey = (sub as any)?.plan_key ?? "business_free";
    const activeContracts = (sub as any)?.active_contracts_count ?? 0;
    const planLimits: Record<string, number> = { business_free: 1, business_pro: 10, business_enterprise: -1 };
    const limit = planLimits[planKey];
    if (limit > 0 && activeContracts >= limit) {
      return NextResponse.json({
        error: `You've reached the ${planKey === "business_free" ? "Free" : planKey} plan limit of ${limit} active contract${limit === 1 ? "" : "s"}. Upgrade your subscription.`,
        redirectTo: "/business/subscription",
      }, { status: 403 });
    }

    // Create the contract + default milestone.
    const proposedRate = Number((app as any).proposed_rate_paise ?? jobAny.wage_min_paise ?? 0);
    if (proposedRate <= 0) {
      return NextResponse.json({ error: "No rate proposed. Ask the applicant for a rate first." }, { status: 400 });
    }
    const advancePct = 50;
    const advancePaise = Math.round(proposedRate * advancePct / 100);

    // Look up category tier for the contracts.tier column
    const { data: cat } = await sb.from("skill_categories")
      .select("tier").eq("id", jobAny.category_id).maybeSingle();
    const tier = (cat as any)?.tier ?? "A";

    const { data: contract, error: contractErr } = await sb.from("contracts").insert({
      task_post_id: null,
      buyer_id: user.id,
      employee_id: (app as any).user_id,
      category_id: jobAny.category_id,
      tier: tier,
      pricing_model: "fixed_milestone",
      agreed_price: proposedRate,
      business_id: jobAny.business_id,
      business_job_id: jobAny.id,
      business_applicant_id: (app as any).id,
      payment_mode: "per_milestone",
      advance_pct: advancePct,
      advance_paise: advancePaise,
      status: "pending",
      started_at: new Date().toISOString(),
    } as any).select("id").single();
    if (contractErr || !contract) {
      return NextResponse.json({ error: contractErr?.message ?? "Failed to create contract" }, { status: 500 });
    }

    // Create the single default milestone (full amount).
    await sb.from("business_milestones").insert({
      contract_id: (contract as any).id,
      business_id: jobAny.business_id,
      title: `Deliver: ${jobAny.title?.slice(0, 60)}`,
      description: (app as any).cover_note ?? "Full delivery as per job description.",
      amount_paise: proposedRate,
      status: "in_progress",
      sort_order: 0,
    } as any);

    // Mark applicant as offered and add to the business_member roster as 'is_hired=true'
    await sb.from("business_applicants").update({ status: "offered" } as any).eq("id", params.id);
    await sb.from("business_members").upsert({
      business_id: jobAny.business_id,
      user_id: (app as any).user_id,
      member_role: "hired",
      status: "active",
      is_hired: true,
      hired_at: new Date().toISOString(),
      hired_contract_id: (contract as any).id,
    } as any, { onConflict: "business_id,user_id" });

    return NextResponse.json({
      ok: true,
      status: "offered",
      contractId: (contract as any).id,
      redirectTo: `/business/contracts/${(contract as any).id}`,
    });
  }

  const { error } = await sb.from("business_applicants")
    .update({ status: next } as any)
    .eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, status: next });
}
