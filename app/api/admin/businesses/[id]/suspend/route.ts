/**
 * POST /api/admin/businesses/[id]/suspend
 * Body: { reason: string }
 *
 * Sets business.is_suspended = true, suspended_reason = reason,
 * suspended_at = now(). Cancels the active subscription (sets status=cancelled).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // Verify admin
  const { data: admin } = await sb.from("admin_users").select("admin_role").eq("user_id", user.id).maybeSingle();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  const reason = (body.reason ?? "Suspended by admin").slice(0, 500);

  const { data: bp } = await sb.from("business_profiles")
    .select("id, is_suspended, brand_name, legal_name").eq("id", params.id).maybeSingle();
  if (!bp) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  if ((bp as any).is_suspended) return NextResponse.json({ error: "Already suspended" }, { status: 400 });

  await sb.from("business_profiles").update({
    is_suspended: true,
    suspended_reason: reason,
    suspended_at: new Date().toISOString(),
  } as any).eq("id", params.id);

  // Cancel the active subscription (keep the existing history rows)
  await sb.from("business_subscriptions")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() } as any)
    .eq("business_id", params.id)
    .in("status", ["active", "trialing"]);

  // Audit log (best-effort)
  try {
    await sb.from("business_audit_log").insert({
      business_id: params.id,
      actor_id: user.id,
      actor_role: "admin",
      action: "suspended",
      details: { reason },
    } as any);
  } catch {}

  return NextResponse.json({ ok: true, message: `${(bp as any).brand_name || (bp as any).legal_name} suspended.` });
}
