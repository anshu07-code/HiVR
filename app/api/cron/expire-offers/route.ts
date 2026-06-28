import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { timingSafeEqual } from "@/lib/security";

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || cronSecret.length < 16) {
    return NextResponse.json({ error: "server misconfigured" }, { status: 503 });
  }
  const headerSecret = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!headerSecret || !timingSafeEqual(headerSecret, cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data: expired, error: expErr } = await (admin.rpc as any)("expire_due_negotiation_offers");
  const { data: statsCount, error: statsErr } = await (admin.rpc as any)("recompute_category_rate_stats");
  return NextResponse.json({
    ok: true,
    expired_offers: typeof expired === "number" ? expired : (expired as any)?.expired ?? 0,
    rate_stats_recomputed: typeof statsCount === "number" ? statsCount : null,
    errors: [expErr?.message, statsErr?.message].filter(Boolean),
  });
}

export const GET = POST;
