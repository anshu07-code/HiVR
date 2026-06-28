import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/reviews/upsert
 *
 * Write or update a review for a completed contract.
 *
 *   Body: { contractId, rating: 1-5, comment?: string }
 *
 * Rules (enforced by RLS + here):
 *   - Caller must be buyer or employee of the contract
 *   - Contract must be in 'completed' status
 *   - One review per (contract, reviewer) — UPSERT on conflict
 *   - Updates allowed only within `editable_until` (48h after creation)
 */

export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const contractId = String(body.contractId ?? "");
  const rating = Number(body.rating ?? 0);
  const comment = body.comment ? String(body.comment) : null;

  if (!contractId) return NextResponse.json({ ok: false, error: "contractId required" }, { status: 400 });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ ok: false, error: "rating must be an integer 1-5" }, { status: 400 });
  }
  if (comment && comment.length > 2000) {
    return NextResponse.json({ ok: false, error: "comment too long (max 2000 chars)" }, { status: 400 });
  }

  // 1. Verify contract membership + status
  const { data: contract, error: cErr } = await sb
    .from("contracts")
    .select("id, status, buyer_id, employee_id")
    .eq("id", contractId)
    .maybeSingle();
  if (cErr) return NextResponse.json({ ok: false, error: cErr.message }, { status: 500 });
  if (!contract) return NextResponse.json({ ok: false, error: "Contract not found" }, { status: 404 });
  if (contract.status !== "completed") {
    return NextResponse.json({ ok: false, error: "Reviews are only allowed on completed contracts" }, { status: 400 });
  }
  if (user.id !== contract.buyer_id && user.id !== contract.employee_id) {
    return NextResponse.json({ ok: false, error: "Not a contract party" }, { status: 403 });
  }

  const revieweeId = user.id === contract.buyer_id ? contract.employee_id : contract.buyer_id;

  // 2. Check if a review already exists (for the editable_until check)
  const { data: existing } = await sb
    .from("reviews")
    .select("id, editable_until, created_at")
    .eq("contract_id", contractId)
    .eq("reviewer_id", user.id)
    .maybeSingle();

  if (existing) {
    const stillEditable = existing.editable_until && new Date(existing.editable_until) > new Date();
    if (!stillEditable) {
      return NextResponse.json({ ok: false, error: "Edit window has closed (48h after first submit)" }, { status: 400 });
    }
  }

  // 3. UPSERT
  const { data, error } = await sb
    .from("reviews")
    .upsert(
      {
        contract_id: contractId,
        reviewer_id: user.id,
        reviewee_id: revieweeId,
        rating,
        comment,
        is_verified_purchase: true,
        // editable_until: keep the original 48h window from the first submit
        // by leaving the column alone (handled by trigger / first-insert default).
      } as any,
      { onConflict: "contract_id,reviewer_id" }
    )
    .select("id, rating, comment, created_at, editable_until")
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.error("[reviews/upsert] failed:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, review: data });
}
