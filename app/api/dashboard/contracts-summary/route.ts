import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

  const { data: contracts } = await sb
    .from("contracts")
    .select(`
      id, status, agreed_price, started_at, approved_at,
      buyer_id, employee_id,
      task_post:task_posts(title),
      buyer:users!contracts_buyer_id_fkey(full_name),
      employee:users!contracts_employee_id_fkey(full_name)
    `)
    .or(`buyer_id.eq.${user.id},employee_id.eq.${user.id}`)
    .order("started_at", { ascending: false, nullsFirst: false })
    .limit(50);

  const contractIds = (contracts ?? []).map((c: any) => c.id);
  const { data: workspaces } = await sb
    .from("workspaces")
    .select("contract_id, id")
    .in("contract_id", contractIds.length > 0 ? contractIds : ["00000000-0000-0000-0000-000000000000"]);

  const wsMap = new Map((workspaces ?? []).map((w: any) => [w.contract_id, w.id]));

  const mapped = (contracts ?? []).map((c: any) => ({
    id: c.id,
    status: c.status,
    agreed_price: c.agreed_price,
    buyer_id: c.buyer_id,
    employee_id: c.employee_id,
    buyer_name: c.buyer?.full_name ?? null,
    employee_name: c.employee?.full_name ?? null,
    task_title: c.task_post?.title ?? `Contract (${c.id?.slice(0, 8) ?? "..."})`,
    workspace_id: wsMap.get(c.id) ?? null,
  }));

  return NextResponse.json({ ok: true, contracts: mapped });
}
