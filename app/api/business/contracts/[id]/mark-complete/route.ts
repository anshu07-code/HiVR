import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: bp } = await sb.from("business_profiles").select("id").eq("owner_user_id", user.id).maybeSingle();
  if (!bp) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const { data: contract } = await sb.from("contracts")
    .select("id, business_id, status, paid_milestones, total_milestones").eq("id", params.id).maybeSingle();
  if (!contract) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if ((contract as any).business_id !== bp.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Verify all milestones are paid
  const { data: unpaid } = await sb.from("business_milestones")
    .select("id").eq("contract_id", params.id).neq("status", "paid");
  if (unpaid && (unpaid as any[]).length > 0) {
    return NextResponse.json({
      error: `Cannot mark complete: ${(unpaid as any[]).length} milestone${(unpaid as any[]).length === 1 ? "" : "s"} still unpaid.`,
    }, { status: 400 });
  }

  const { error } = await sb.from("contracts")
    .update({ status: "completed", approved_at: new Date().toISOString() } as any)
    .eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Bump business profile counters
  await sb.rpc("bump_business_total" as any, {
    _business_id: bp.id,
    _field: "contracts",
    _delta: 1,
  } as any).then(({ error }: any) => {
    if (!error) return;
    sb.from("business_profiles").select("total_contracts_signed").eq("id", bp.id).maybeSingle()
      .then(({ data }: any) => {
        const newCount = Number((data as any)?.total_contracts_signed ?? 0) + 1;
        sb.from("business_profiles").update({ total_contracts_signed: newCount } as any).eq("id", bp.id);
      });
  });

  // Decrement active_contracts_count
  const { count } = await sb.from("contracts").select("id", { count: "exact", head: true })
    .eq("business_id", bp.id).in("status", ["active", "pending"]);
  await sb.from("business_subscriptions").update({ active_contracts_count: count ?? 0 } as any)
    .eq("business_id", bp.id).in("status", ["active", "trialing"]);

  return NextResponse.json({ ok: true });
}
