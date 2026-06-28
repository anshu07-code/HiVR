import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SecurityError, enforceRateLimit } from "@/lib/security";
import { anonymousDisplayId } from "@/lib/crypto";

export async function POST(req: NextRequest) {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

    enforceRateLimit(`anonymous_register:${user.id}`, { max: 3, windowMs: 3600_000 });

    const body = await req.json().catch(() => ({}));
    const justification = String(body.justification ?? "").trim().slice(0, 500);
    const requestedTier = body.tier === "A" || body.tier === "B" ? body.tier : "A";

    const admin = createAdminClient();

    const { data: ep } = await admin
      .from("employee_profiles")
      .select("user_id, is_anonymous")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!ep) return NextResponse.json({ ok: false, error: "Employee profile not found" }, { status: 400 });
    if ((ep as any).is_anonymous) {
      return NextResponse.json({ ok: false, error: "Already an anonymous profile" }, { status: 400 });
    }

    const { data: existing } = await admin
      .from("anonymous_requests")
      .select("id, status")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false } as any)
      .limit(1) as any;

    if (existing && existing.length > 0) {
      const lastStatus = existing[0].status;
      if (lastStatus === "pending") {
        return NextResponse.json({ ok: false, error: "You already have a pending request" }, { status: 400 });
      }
    }

    const { data: request, error } = await admin
      .from("anonymous_requests")
      .insert({
        user_id: user.id,
        requested_tier: requestedTier,
        justification: justification || null,
        status: "pending",
      } as any)
      .select("id")
      .single() as any;

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      requestId: request.id,
      message: "Your anonymous profile request has been submitted for review. The Accounts team will review it shortly.",
    });
  } catch (e) {
    if (e instanceof SecurityError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
