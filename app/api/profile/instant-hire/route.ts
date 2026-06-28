import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/profile/instant-hire
 * Body: {
 *   enabled, headline, intro_video_url, response_time_minutes,
 *   urgent_ok, critical_ok, auto_accept_enabled,
 *   weekly_capacity_hours, timezone, languages
 * }
 * Upserts the current user's employee_instant_profile row.
 */
export async function POST(req: Request) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const enabled = !!body.enabled;
  const headline = (body.headline ?? "").toString().slice(0, 200);
  const introVideo = (body.intro_video_url ?? "").toString().slice(0, 500);
  const responseTime = Math.max(1, Math.min(1440, Number(body.response_time_minutes ?? 30)));
  const weeklyCapacity = Math.max(1, Math.min(168, Number(body.weekly_capacity_hours ?? 40)));
  const timezone = (body.timezone ?? "Asia/Kolkata").toString().slice(0, 60);
  const languages = Array.isArray(body.languages) ? body.languages.slice(0, 20).map((l: any) => String(l).slice(0, 40)) : [];
  const urgentOk = !!body.urgent_ok;
  const criticalOk = !!body.critical_ok;
  let autoAccept = !!body.auto_accept_enabled;

  // Tier-gate auto-accept (track_record / top_rated only).
  const { data: ep } = await sb
    .from("employee_profiles")
    .select("overall_trust_tier")
    .eq("user_id", user.id)
    .maybeSingle();
  const tier = (ep as any)?.overall_trust_tier ?? "provisional";
  if (tier !== "track_record" && tier !== "top_rated") {
    autoAccept = false;
  }

  const { error } = await sb
    .from("employee_instant_profile")
    .upsert({
      user_id: user.id,
      enabled,
      headline: headline || null,
      intro_video_url: introVideo || null,
      response_time_minutes: responseTime,
      urgent_ok: urgentOk && tier !== "provisional",
      critical_ok: criticalOk && tier !== "provisional",
      auto_accept_enabled: autoAccept,
      weekly_capacity_hours: weeklyCapacity,
      timezone,
      languages,
      updated_at: new Date().toISOString(),
    } as any, { onConflict: "user_id" });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
