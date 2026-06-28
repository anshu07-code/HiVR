import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { executeDisputeEscrow } from "@/lib/dispute-escrow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/disputes/[id]/resolve
 *
 * Admin endpoint to resolve a dispute. Wraps the `resolve_dispute` SQL RPC
 * (which handles state transitions, strikes, notifications, and the
 * wallet-funded money path atomically) and then calls the
 * `executeDisputeEscrow` Node helper to drive the Razorpay path.
 *
 * Body: {
 *   resolution: "in_favor_of_buyer" | "in_favor_of_employee" | "split" | "no_action",
 *   notes?: string,
 *   bad_faith_side?: "buyer" | "employee" | null,
 *   employee_share_pct?: number  // 0-100, only used when resolution = "split"
 * }
 *
 * Auth: super_admin / support_admin / trust_safety_admin.
 *
 * Response: {
 *   ok: true,
 *   dispute: { id, status, ... },
 *   escrow: { source, refund_paise, payout_paise, ... }
 * }
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

  const { data: adminRow } = await sb
    .from("admin_users")
    .select("admin_role")
    .eq("user_id", user.id)
    .maybeSingle();
  const role = (adminRow as any)?.admin_role;
  if (!["super_admin", "support_admin", "trust_safety_admin"].includes(role)) {
    return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({} as any));
  const {
    resolution,
    notes,
    bad_faith_side,
    employee_share_pct,
  } = body as {
    resolution?: string;
    notes?: string;
    bad_faith_side?: "buyer" | "employee" | null;
    employee_share_pct?: number;
  };

  if (!["in_favor_of_buyer", "in_favor_of_employee", "split", "no_action"].includes(resolution ?? "")) {
    return NextResponse.json({ ok: false, error: "invalid resolution" }, { status: 400 });
  }
  if (bad_faith_side != null && !["buyer", "employee"].includes(bad_faith_side)) {
    return NextResponse.json({ ok: false, error: "invalid bad_faith_side" }, { status: 400 });
  }
  if (employee_share_pct != null && (employee_share_pct < 0 || employee_share_pct > 100)) {
    return NextResponse.json({ ok: false, error: "employee_share_pct must be 0-100" }, { status: 400 });
  }

  // 1. Run the RPC. This handles: state transitions, strikes, contract
  //    status, item-level checklist, both-party notifications, and the
  //    wallet-funded money path atomically. The Razorpay path is recorded
  //    as an "intent" (refund_paise/payout_paise on the dispute row) and
  //    must be executed separately via the Node helper.
  const admin = createAdminClient();
  const { data: rpcRes, error: rpcErr } = await (admin.rpc as any)("resolve_dispute", {
    p_dispute_id: params.id,
    p_resolution: resolution,
    p_notes: notes ?? null,
    p_bad_faith_side: bad_faith_side ?? null,
    p_employee_share_pct: resolution === "split" ? (employee_share_pct ?? 50) : 50,
  });
  if (rpcErr) {
    return NextResponse.json({ ok: false, error: rpcErr.message }, { status: 400 });
  }
  if (rpcRes && (rpcRes as any).ok === false) {
    return NextResponse.json({ ok: false, error: (rpcRes as any).error, rpc: rpcRes }, { status: 400 });
  }

  // 2. Run the Node helper to actually call Razorpay for the split amounts.
  //    For wallet-funded disputes the RPC already moved the money, so this
  //    is a fast no-op. For Razorpay-funded disputes it makes the HTTP call.
  const escrow = await executeDisputeEscrow(params.id);

  // 3. Re-load the dispute so the UI gets the latest state (status, strikes, etc.)
  const { data: dispute } = await admin
    .from("disputes")
    .select("id, status, resolution, resolved_at, employee_share_pct, refund_paise, payout_paise, platform_retained_paise, escrow_processed_at")
    .eq("id", params.id)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    dispute,
    escrow,
  });
}
