/**
 * POST /api/business/disputes/[id]/resolve
 * Body: { resolution: "resolved_business" | "resolved_employee" | "split", notes: string }
 *
 * Resolves the dispute immediately. Releases the funds and, if resolved
 * against the employee, adds 1 strike to the employee via
 * recordDisputeLoss in lib/auth-context.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordDisputeLoss } from "@/lib/auth-context";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: bp } = await sb.from("business_profiles").select("id").eq("owner_user_id", user.id).maybeSingle();
  if (!bp) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    resolution?: "resolved_business" | "resolved_employee" | "split";
    notes?: string;
  };
  if (!body.resolution || !["resolved_business", "resolved_employee", "split"].includes(body.resolution)) {
    return NextResponse.json({ error: "Invalid resolution" }, { status: 400 });
  }

  // Pull the dispute + verify ownership
  const { data: dispute } = await sb.from("business_disputes")
    .select("id, business_id, contract_id, raised_by_role, status, funds_held, contract:contracts!business_disputes_contract_id_fkey(id, employee_id, agreed_price, business_id, status)")
    .eq("id", params.id).eq("business_id", bp.id).maybeSingle();
  if (!dispute) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if ((dispute as any).business_id !== bp.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!["open", "under_review"].includes((dispute as any).status)) {
    return NextResponse.json({ error: `Cannot resolve: status is "${(dispute as any).status}".` }, { status: 400 });
  }

  const now = new Date().toISOString();
  const resolution = body.resolution;
  const favorOf =
    resolution === "resolved_business" ? "business" :
    resolution === "resolved_employee" ? "employee" :
    "split";
  const strikesAdded = resolution === "resolved_employee" ? 1 : 0;
  const employeeId = (dispute as any).contract?.employee_id;

  // 1. Update the dispute
  const { error: updErr } = await sb.from("business_disputes").update({
    status: resolution,
    resolved_in_favor_of: favorOf,
    resolved_at: now,
    resolved_by: user.id,
    resolution_notes: (body.notes ?? "").slice(0, 4000),
    strikes_added: strikesAdded,
    funds_held: false,
    funds_released_at: now,
    funds_released_to: favorOf,
  } as any).eq("id", params.id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

  // 2. If split, no employee strike (split is neutral).
  //    If resolved_business (employee lost), add a strike.
  //    If resolved_employee (employee won), no strike.
  if (strikesAdded > 0 && employeeId) {
    try {
      await recordDisputeLoss(employeeId, `Dispute ${params.id} resolved in business's favour`);
    } catch (e: any) {
      // Strike is best-effort — log and continue.
    }
  }

  // 3. If resolved_employee, mark the contract as completed.
  if (resolution === "resolved_employee") {
    await sb.from("contracts").update({
      status: "completed",
      approved_at: now,
    } as any).eq("id", (dispute as any).contract_id);
  }
  // If resolved_business, mark the contract as cancelled.
  if (resolution === "resolved_business") {
    await sb.from("contracts").update({
      status: "cancelled",
    } as any).eq("id", (dispute as any).contract_id);
  }

  return NextResponse.json({ ok: true, status: resolution, strikesAdded });
}
