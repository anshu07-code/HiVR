import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { timingSafeEqual } from "@/lib/security";

/**
 * Cron job: mark interview bookings as no-show if the interview
 * time has passed and the interviewer hasn't uploaded a result.
 *
 * Grace window defaults to 60 minutes. Bump the grace for slow
 * interviewers, lower it for strict policies.
 *
 * Schedule: every 15 minutes (or more frequently in production).
 *
 * Auth: requires the `Authorization: Bearer ${CRON_SECRET}` header.
 * The secret MUST be set in production; we refuse to run with a missing
 * or weak default value. Comparisons use `timingSafeEqual` to prevent
 * timing side-channels.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || cronSecret.length < 16) {
    // eslint-disable-next-line no-console
    console.error("[no-show-mark] CRON_SECRET missing or too short; refusing to run");
    return NextResponse.json({ ok: false, error: "server misconfigured" }, { status: 503 });
  }
  const headerSecret = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!headerSecret || !timingSafeEqual(headerSecret, cronSecret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("auto_mark_no_shows" as any, { p_grace_minutes: 60 } as any);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
