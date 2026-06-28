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

  const { data: candidates, error: cErr } = await (admin.from("contracts") as any)
    .select("id")
    .eq("incentive_condition_type", "rating_based")
    .eq("incentive_earned", false)
    .not("incentive_amount_paise", "is", null);
  if (cErr) return NextResponse.json({ ok: false, error: cErr.message }, { status: 500 });

  let awarded = 0;
  for (const c of ((candidates ?? []) as any[])) {
    const { data, error } = await (admin.rpc as any)("award_rating_incentive", {
      p_contract_id: c.id,
    });
    if (!error && typeof data === "number" && data > 0) awarded += 1;
  }
  return NextResponse.json({ ok: true, candidates: candidates?.length ?? 0, awarded });
}

export const GET = POST;
