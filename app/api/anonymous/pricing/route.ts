import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SecurityError, enforceRateLimit } from "@/lib/security";

const MAX_PAISE = 5_000_000_00;

const tierAFields = ["hourly_rate_paise", "task_rate_paise"] as const;
const tierBFields = ["hourly_rate_paise", "daily_rate_paise", "weekly_rate_paise", "monthly_rate_paise"] as const;

export async function PUT(req: NextRequest) {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

    enforceRateLimit(`anonymous_pricing:${user.id}`, { max: 10, windowMs: 60_000 });

    const body = await req.json().catch(() => ({}));

    const admin = createAdminClient();

    const { data: ap } = await admin
      .from("anonymous_profiles")
      .select("user_id, status, tier")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!ap) return NextResponse.json({ ok: false, error: "Anonymous profile not found" }, { status: 400 });
    if ((ap as any).status !== "approved") {
      return NextResponse.json({ ok: false, error: "Anonymous profile is not yet approved" }, { status: 400 });
    }

    const tier = (ap as any).tier as string;
    const allowedFields = tier === "A" ? tierAFields : tierBFields;
    const updates: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        const val = Math.round(Number(body[field]));
        if (!Number.isFinite(val) || val <= 0 || val > MAX_PAISE) {
          return NextResponse.json({
            ok: false,
            error: `Invalid ${field}: must be a positive integer up to ₹${MAX_PAISE / 100}`,
          }, { status: 400 });
        }
        updates[field] = val;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: false, error: "No valid pricing fields provided" }, { status: 400 });
    }

    updates.updated_at = new Date().toISOString();

    const { error } = await admin
      .from("anonymous_profiles")
      .update(updates as any)
      .eq("user_id", user.id);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, tier, updatedFields: Object.keys(updates).filter(k => k !== "updated_at") });
  } catch (e) {
    if (e instanceof SecurityError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
