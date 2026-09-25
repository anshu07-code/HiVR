import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
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
  const communicationRating = body.communication_rating != null ? Number(body.communication_rating) : null;
  const qualityRating = body.quality_rating != null ? Number(body.quality_rating) : null;
  const valueRating = body.value_rating != null ? Number(body.value_rating) : null;

  if (!contractId) return NextResponse.json({ ok: false, error: "contractId required" }, { status: 400 });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ ok: false, error: "rating must be an integer 1-5" }, { status: 400 });
  }
  if (comment && comment.length > 2000) {
    return NextResponse.json({ ok: false, error: "comment too long (max 2000 chars)" }, { status: 400 });
  }
  if (communicationRating != null && (!Number.isInteger(communicationRating) || communicationRating < 1 || communicationRating > 5)) {
    return NextResponse.json({ ok: false, error: "communication_rating must be an integer 1-5" }, { status: 400 });
  }
  if (qualityRating != null && (!Number.isInteger(qualityRating) || qualityRating < 1 || qualityRating > 5)) {
    return NextResponse.json({ ok: false, error: "quality_rating must be an integer 1-5" }, { status: 400 });
  }
  if (valueRating != null && (!Number.isInteger(valueRating) || valueRating < 1 || valueRating > 5)) {
    return NextResponse.json({ ok: false, error: "value_rating must be an integer 1-5" }, { status: 400 });
  }

  // 1. Verify contract membership + status
  const { data: rawContract, error: cErr } = await sb
    .from("contracts")
    .select("id, status, buyer_id, employee_id")
    .eq("id", contractId)
    .maybeSingle() as any;
  if (cErr) return NextResponse.json({ ok: false, error: cErr.message }, { status: 500 });
  if (!rawContract) return NextResponse.json({ ok: false, error: "Contract not found" }, { status: 404 });
  const contract = rawContract as { id: string; status: string; buyer_id: string; employee_id: string };
  if (contract.status !== "completed") {
    return NextResponse.json({ ok: false, error: "Reviews are only allowed on completed contracts" }, { status: 400 });
  }
  if (user.id !== contract.buyer_id && user.id !== contract.employee_id) {
    return NextResponse.json({ ok: false, error: "Not a contract party" }, { status: 403 });
  }

  const revieweeId = user.id === contract.buyer_id ? contract.employee_id : contract.buyer_id;

  // 2. Check if a review already exists (for the editable_until check)
  const { data: rawExisting } = await sb
    .from("reviews")
    .select("id, editable_until, created_at")
    .eq("contract_id", contractId)
    .eq("reviewer_id", user.id)
    .maybeSingle() as any;
  const existing = rawExisting as { id: string; editable_until: string | null; created_at: string } | null;

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
        communication_rating: communicationRating ?? rating,
        quality_rating: qualityRating ?? rating,
        value_rating: valueRating ?? rating,
        is_verified_purchase: true,
      } as any,
      { onConflict: "contract_id,reviewer_id" }
    )
    .select("id, rating, comment, communication_rating, quality_rating, value_rating, created_at, editable_until")
    .single() as any;

  if (error) {
    // eslint-disable-next-line no-console
    console.error("[reviews/upsert] failed:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Force the dashboard (and any page showing employee ratings) to
  // re-fetch. The trigger updates employee_profiles.avg_rating +
  // total_reviews, but the dashboard's cached server render is stale
  // until the next navigation or router.refresh().
  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/contracts", "page");
  revalidatePath(`/dashboard/contracts/${contractId}`, "page");
  revalidatePath("/find-people", "page");
  revalidatePath(`/people/${revieweeId}`, "page");

  return NextResponse.json({ ok: true, review: data });
}
