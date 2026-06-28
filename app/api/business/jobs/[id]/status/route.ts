import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const next = String(body?.status ?? "");
  if (!["open", "paused", "closed", "draft"].includes(next)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  // Verify the caller owns the business that owns this job
  const { data: bp } = await sb.from("business_profiles").select("id").eq("owner_user_id", user.id).maybeSingle();
  if (!bp) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  // If opening, check plan limits
  if (next === "open") {
    const { data: sub } = await sb.from("business_subscriptions")
      .select("plan_key, status, active_jobs_count").eq("business_id", bp.id)
      .in("status", ["active", "trialing"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const planKey = (sub as any)?.plan_key ?? "business_free";
    const activeJobs = (sub as any)?.active_jobs_count ?? 0;
    const planLimits: Record<string, number> = { business_free: 1, business_pro: 10, business_enterprise: -1 };
    const limit = planLimits[planKey];
    if (limit > 0 && activeJobs >= limit) {
      return NextResponse.json({ error: `Plan limit reached (${limit} active jobs). Upgrade to Pro.` }, { status: 403 });
    }
  }

  // Update the job
  const { data: updated, error } = await sb.from("business_jobs")
    .update({ status: next } as any)
    .eq("id", params.id).eq("business_id", bp.id)
    .select("id, status").single();
  if (error || !updated) return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });

  // Recompute active_jobs_count on the subscription
  const { count } = await sb.from("business_jobs").select("id", { count: "exact", head: true }).eq("business_id", bp.id).eq("status", "open");
  await sb.from("business_subscriptions")
    .update({ active_jobs_count: count ?? 0 } as any)
    .eq("business_id", bp.id);

  return NextResponse.json({ ok: true, status: (updated as any).status });
}
