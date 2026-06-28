import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_KEYS: Record<string, "boolean" | "number"> = {
  instant_hire_enabled: "boolean",
  instant_hire_top_pros_window_days: "number",
};

export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  const { data: adminRow } = await sb.from("admin_users").select("admin_role").eq("user_id", user.id).maybeSingle();
  const role = (adminRow as any)?.admin_role;
  if (!role || !["super_admin", "finance_admin", "support_admin", "trust_safety_admin"].includes(role)) {
    return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const key = String(body.key ?? "");
  const expectedType = ALLOWED_KEYS[key];
  if (!expectedType) return NextResponse.json({ ok: false, error: "Unknown setting" }, { status: 400 });
  let value: any = body.value;
  if (expectedType === "boolean") value = Boolean(value);
  else if (expectedType === "number") {
    const n = Number(value);
    if (!Number.isFinite(n)) return NextResponse.json({ ok: false, error: "Value must be a number" }, { status: 400 });
    value = n;
  }
  const { error } = await (sb.from("platform_settings") as any).upsert({
    key, value: { value }, updated_by: user.id,
  }, { onConflict: "key" });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  await (sb.from("admin_audit_log") as any).insert({
    actor_id: user.id, action: `instant_hire_setting:${key}`,
    target_table: "platform_settings", target_id: key,
    metadata: { value },
  });
  return NextResponse.json({ ok: true, key, value });
}
