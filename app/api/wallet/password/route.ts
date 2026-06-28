import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SecurityError, enforceRateLimit } from "@/lib/security";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { writeWalletAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

    enforceRateLimit(`wallet_password:${user.id}`, { max: 5, windowMs: 60_000 });

    const body = await req.json().catch(() => ({}));
    const action = body.action === "set" ? "set" : body.action === "verify" ? "verify" : null;
    const password = String(body.password ?? "");

    if (!action) {
      return NextResponse.json({ ok: false, error: "action must be 'set' or 'verify'" }, { status: 400 });
    }

    if (password.length < 8 || password.length > 128) {
      return NextResponse.json({ ok: false, error: "Password must be 8-128 characters" }, { status: 400 });
    }

    const admin = createAdminClient();
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();

    if (action === "set") {
      const { data: existing } = await admin
        .from("wallet_passwords")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        return NextResponse.json({ ok: false, error: "Withdrawal password already set. Use the change flow instead." }, { status: 400 });
      }

      const passwordHash = await hashPassword(password);

      const { error } = await admin
        .from("wallet_passwords")
        .insert({
          user_id: user.id,
          password_hash: passwordHash,
        } as any);

      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

      await writeWalletAudit(user.id, "password_set", {}, ip);

      return NextResponse.json({ ok: true, message: "Withdrawal password set successfully" });
    }

    const { data: stored } = await admin
      .from("wallet_passwords")
      .select("password_hash")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!stored) {
      return NextResponse.json({ ok: false, error: "No withdrawal password set. Set one first." }, { status: 400 });
    }

    const valid = await verifyPassword(password, (stored as any).password_hash);

    await writeWalletAudit(user.id, valid ? "password_verified" : "password_verify_fail", {}, ip);

    if (!valid) {
      return NextResponse.json({ ok: false, error: "Incorrect withdrawal password" }, { status: 401 });
    }

    return NextResponse.json({ ok: true, verified: true });
  } catch (e) {
    if (e instanceof SecurityError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
