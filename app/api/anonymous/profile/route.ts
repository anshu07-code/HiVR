import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SecurityError, enforceRateLimit } from "@/lib/security";

export async function PATCH(req: NextRequest) {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

    enforceRateLimit(`anonymous_profile:${user.id}`, { max: 10, windowMs: 60_000 });

    const body = await req.json().catch(() => ({}));

    const admin = createAdminClient();

    const { data: ap } = await admin
      .from("anonymous_profiles")
      .select("user_id, status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!ap) return NextResponse.json({ ok: false, error: "Anonymous profile not found. Register first." }, { status: 400 });
    if ((ap as any).status !== "approved") {
      return NextResponse.json({ ok: false, error: "Anonymous profile is not yet approved" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};

    if (body.bio_public !== undefined) {
      const bio = String(body.bio_public).trim().slice(0, 500);
      if (bio.length < 10) {
        return NextResponse.json({ ok: false, error: "Public bio must be at least 10 characters" }, { status: 400 });
      }
      updates.bio_public = bio;
    }

    if (body.display_label !== undefined) {
      const label = String(body.display_label).trim().slice(0, 30);
      if (!label) {
        return NextResponse.json({ ok: false, error: "Display label is required" }, { status: 400 });
      }
      updates.display_label = label;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: false, error: "No fields to update" }, { status: 400 });
    }

    updates.updated_at = new Date().toISOString();

    const { error } = await admin
      .from("anonymous_profiles")
      .update(updates as any)
      .eq("user_id", user.id);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof SecurityError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
