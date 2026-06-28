import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/profile/standing-rate
 * Body: {
 *   category_id, tier,
 *   rate_per_hour_paise, rate_per_task_paise,
 *   rate_per_day_paise, rate_per_week_paise
 * }
 * Upserts the rate for a category.
 */
export async function POST(req: Request) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const categoryId = String(body.category_id ?? "");
  if (!categoryId) return NextResponse.json({ ok: false, error: "category_id required" }, { status: 400 });

  // Validate the category exists
  const { data: cat } = await sb
    .from("skill_categories")
    .select("id, tier")
    .eq("id", categoryId)
    .maybeSingle();
  if (!cat) return NextResponse.json({ ok: false, error: "Category not found" }, { status: 404 });
  const tier = (cat as any).tier as "micro_task" | "role_engagement";

  // Validate at least one rate is positive
  const rates = {
    rate_per_hour_paise: positiveOrNull(body.rate_per_hour_paise),
    rate_per_task_paise: positiveOrNull(body.rate_per_task_paise),
    rate_per_day_paise:  positiveOrNull(body.rate_per_day_paise),
    rate_per_week_paise: positiveOrNull(body.rate_per_week_paise),
  };
  if (Object.values(rates).every(v => v == null)) {
    return NextResponse.json({ ok: false, error: "Set at least one rate" }, { status: 400 });
  }

  // Tier A categories: only hour + task allowed. Reject day/week.
  if (tier === "micro_task" && (rates.rate_per_day_paise || rates.rate_per_week_paise)) {
    return NextResponse.json({ ok: false, error: "Tier A categories only support per-hour and per-task rates" }, { status: 400 });
  }

  // legacy "standing_rate" = the first non-null rate
  const legacy = rates.rate_per_hour_paise ?? rates.rate_per_task_paise ?? rates.rate_per_day_paise ?? rates.rate_per_week_paise;

  const { error } = await sb
    .from("employee_standing_rates")
    .upsert({
      user_id: user.id,
      category_id: categoryId,
      tier,
      standing_rate: legacy,
      rate_per_hour_paise: rates.rate_per_hour_paise,
      rate_per_task_paise: rates.rate_per_task_paise,
      rate_per_day_paise:  rates.rate_per_day_paise,
      rate_per_week_paise: rates.rate_per_week_paise,
      computed_at: new Date().toISOString(),
    } as any, { onConflict: "user_id,category_id" });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

function positiveOrNull(v: any): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}
