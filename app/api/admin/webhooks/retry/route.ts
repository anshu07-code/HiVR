import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processRazorpayEvent } from "@/app/api/webhooks/razorpay/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/webhooks/retry
 *
 * Re-run a previously-failed (or never-finished) Razorpay webhook event.
 * Useful when the original handler errored out due to a transient Supabase
 * hiccup, or when you fix a bug and want to backfill missed events.
 *
 * Body: { event_id: "<uuid of the webhook_events row>" }
 *
 * Auth: finance_admin or super_admin only.
 *
 * Notes:
 *   - Idempotency: status transitions use the same transitionPayment helper
 *     as the live handler, so the from-status is checked. Already-released
 *     payments won't be double-released.
 *   - Audit: the row is marked processed=true / processed_at=now.
 *   - Limit: a single event per call to keep blast radius small.
 */
export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Super admin or finance admin only
  const { data: adminRow } = await sb
    .from("admin_users")
    .select("admin_role")
    .eq("user_id", user.id)
    .maybeSingle();
  const role = (adminRow as any)?.admin_role;
  if (!role || !["super_admin", "finance_admin"].includes(role)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({} as any));
  const { event_id } = body as { event_id?: string };
  if (!event_id) {
    return NextResponse.json({ error: "event_id is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("webhook_events")
    .select("id, event_type, event_id, payload, processed, error")
    .eq("id", event_id)
    .maybeSingle();
  if (!row) {
    return NextResponse.json({ error: "webhook event not found" }, { status: 404 });
  }

  try {
    await processRazorpayEvent(admin, row.payload);
    await admin.from("webhook_events").update({
      processed: true,
      processed_at: new Date().toISOString(),
      error: null,
    }).eq("id", row.id);
    return NextResponse.json({
      ok: true,
      retried: row.id,
      event_type: row.event_type,
      event_id: row.event_id,
    });
  } catch (e) {
    await admin.from("webhook_events").update({
      error: (e as Error).message?.slice(0, 500) ?? "unknown error",
    }).eq("id", row.id);
    return NextResponse.json({
      ok: false,
      error: (e as Error).message,
    }, { status: 500 });
  }
}
