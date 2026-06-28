import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: bp } = await sb.from("business_profiles").select("id").eq("owner_user_id", user.id).maybeSingle();
  if (!bp) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const { data: contract } = await sb.from("contracts")
    .select("id, business_id, status").eq("id", params.id).maybeSingle();
  if (!contract) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if ((contract as any).business_id !== bp.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await sb.from("contracts")
    .update({ status: "cancelled" } as any)
    .eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Bump subscription active_contracts_count down
  const { count } = await sb.from("contracts").select("id", { count: "exact", head: true })
    .eq("business_id", bp.id).in("status", ["active", "pending"]);
  await sb.from("business_subscriptions").update({ active_contracts_count: count ?? 0 } as any)
    .eq("business_id", bp.id).in("status", ["active", "trialing"]);

  return NextResponse.json({ ok: true });
}
