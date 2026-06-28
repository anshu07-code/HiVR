import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  await requireAdmin();
  const sb = createClient();

  const body = await req.json().catch(() => ({}));
  const emails: string[] = Array.isArray(body.emails) ? body.emails : [];
  if (emails.length === 0) {
    return NextResponse.json({ ok: false, error: "Provide an 'emails' array" }, { status: 400 });
  }

  const { data: setting } = await sb
    .from("platform_settings")
    .select("value")
    .eq("key", "signup_bonus_points")
    .maybeSingle();
  const points = (setting as any)?.value?.value ?? 50;

  const results: { email: string; ok: boolean; error?: string }[] = [];

  for (const email of emails) {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) { results.push({ email, ok: false, error: "empty email" }); continue; }

    const { data: user } = await sb
      .from("users")
      .select("id, email")
      .eq("email", trimmed)
      .maybeSingle();

    if (!user) { results.push({ email: trimmed, ok: false, error: "user not found" }); continue; }

    const { data: existing } = await sb
      .from("points_ledger")
      .select("id")
      .eq("employee_id", user.id)
      .eq("reason", "signup_bonus")
      .maybeSingle();

    if (existing) { results.push({ email: trimmed, ok: false, error: "already awarded" }); continue; }

    // Use the authenticated client (admin session) so RLS policy pl_admin_write passes
    const { error: insertErr } = await sb.from("points_ledger").insert({
      employee_id: user.id,
      change_amount: points,
      reason: "signup_bonus",
    });

    if (insertErr) {
      results.push({ email: trimmed, ok: false, error: insertErr.message });
    } else {
      results.push({ email: trimmed, ok: true });
    }
  }

  return NextResponse.json({ ok: true, points, results });
}
