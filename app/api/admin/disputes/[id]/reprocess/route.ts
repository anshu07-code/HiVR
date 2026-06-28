import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { executeDisputeEscrow } from "@/lib/dispute-escrow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/disputes/[id]/reprocess
 *
 * Re-runs the Razorpay money movement for a previously-resolved dispute.
 * Useful when:
 *   - The RPC succeeded in DB (status transitions, strikes, notifications) but
 *     the Razorpay HTTP call failed (e.g. Razorpay was down for 10 minutes)
 *   - The first reprocess failed and the admin wants to retry without
 *     re-resolving the dispute (which would 409 "already resolved")
 *
 * For wallet-funded disputes this is a no-op.
 *
 * Auth: super_admin / finance_admin.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

  const { data: adminRow } = await sb
    .from("admin_users")
    .select("admin_role")
    .eq("user_id", user.id)
    .maybeSingle();
  const role = (adminRow as any)?.admin_role;
  if (!["super_admin", "finance_admin"].includes(role)) {
    return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
  }

  const result = await executeDisputeEscrow(params.id);
  return NextResponse.json(result);
}
