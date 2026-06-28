import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ladderCooldownDays } from "@/lib/auth-context";
import { timingSafeEqual } from "@/lib/security";

/**
 * GET /api/cron/dispute-unpause-check
 *
 * Daily cron. Finds every paused employee whose cooldown has expired
 * (and is NOT permanently banned) and flips `application_paused` off.
 * Step 4+ (permanent_ban) is never auto-unpaused — admin must clear it
 * manually with `resetLadder: true`.
 *
 * Auth: Bearer CRON_SECRET (same as /api/cron/auto-release).
 *
 * Configure your scheduler (e.g. Vercel Cron, GitHub Actions, or
 * Supabase pg_cron) to hit this endpoint once per day.
 */
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || cronSecret.length < 16) {
    return NextResponse.json({ ok: false, reason: "server misconfigured" }, { status: 503 });
  }
  const headerSecret = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!headerSecret || !timingSafeEqual(headerSecret, cronSecret)) {
    return NextResponse.json({ ok: false, reason: "Unauthorized" }, { status: 401 });
  }

  const sb = createClient();
  // Read the configured cooldown overrides.
  const { data: settings } = await sb
    .from("platform_settings")
    .select("key, value")
    .in("key", ["pause_cooldown_step1_days", "pause_cooldown_step2_days", "pause_cooldown_step3_days"]);
  const get = (k: string, def: number) => {
    const row = (settings ?? []).find((s: any) => s.key === k) as any;
    return Number(row?.value?.value ?? def);
  };
  const steps = [
    get("pause_cooldown_step1_days", 7),
    get("pause_cooldown_step2_days", 30),
    get("pause_cooldown_step3_days", 90),
  ];

  // Pull every currently-paused, non-permanent employee.
  const { data: paused, error } = await sb
    .from("employee_profiles")
    .select("user_id, last_pause_at, application_paused_at, pause_ladder_step")
    .eq("application_paused", true)
    .eq("permanent_ban", false);
  if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });

  const now = Date.now();
  const unpaused: string[] = [];
  const stillPaused: { userId: string; remainingDays: number }[] = [];

  for (const row of paused ?? []) {
    const step = Math.max(1, Math.min(3, (row as any).pause_ladder_step || 1));
    const cooldown = steps[step - 1] ?? ladderCooldownDays(step);
    const startStr = (row as any).last_pause_at ?? (row as any).application_paused_at;
    if (!startStr) continue;
    const start = new Date(startStr).getTime();
    const elapsedDays = (now - start) / (24 * 60 * 60 * 1000);
    if (elapsedDays >= cooldown) {
      const { error: upErr } = await sb.from("employee_profiles").update({
        application_paused: false,
        application_paused_at: null,
        application_paused_reason: null,
        // last_pause_at is kept so the user can see the history.
      }).eq("user_id", (row as any).user_id);
      if (!upErr) {
        unpaused.push((row as any).user_id);
        // Audit log
        try {
          const { data: cur } = await sb.from("employee_profiles").select("unpause_log").eq("user_id", (row as any).user_id).maybeSingle();
          const log = ((cur as any)?.unpause_log as any[]) ?? [];
          log.push({
            kind: "auto_unpause",
            at: new Date().toISOString(),
            ladder_step: step,
            cooldown_days: cooldown,
          });
          await sb.from("employee_profiles").update({ unpause_log: log.slice(-50) }).eq("user_id", (row as any).user_id);
        } catch { /* non-fatal */ }
        // Best-effort notification
        try {
          await sb.rpc("create_notification" as any, {
            p_user_id: (row as any).user_id,
            p_type: "profile_unpaused",
            p_title: "Your profile is active again",
            p_body: `Your application pause has expired (ladder step ${step}). You can apply to tasks again.`,
            p_link: "/browse",
          });
        } catch { /* non-fatal */ }
      }
    } else {
      stillPaused.push({ userId: (row as any).user_id, remainingDays: Math.max(0, Math.ceil(cooldown - elapsedDays)) });
    }
  }

  return NextResponse.json({
    ok: true,
    unpaused_count: unpaused.length,
    unpaused,
    still_paused: stillPaused,
    scanned_at: new Date().toISOString(),
  });
}
