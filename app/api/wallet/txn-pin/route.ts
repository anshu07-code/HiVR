import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SecurityError, enforceRateLimit } from "@/lib/security";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { writeWalletAudit } from "@/lib/audit";

const PIN_MIN = 4;
const PIN_MAX = 6;

function validatePin(pin: string): string | null {
  if (pin.length < PIN_MIN || pin.length > PIN_MAX) {
    return `PIN must be ${PIN_MIN}-${PIN_MAX} digits`;
  }
  if (!/^\d+$/.test(pin)) {
    return "PIN must contain only digits";
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

    const admin = createAdminClient();
    const { data: wallet } = await admin
      .from("user_wallets")
      .select("txn_pin_hash")
      .eq("user_id", user.id)
      .maybeSingle();

    return NextResponse.json({
      ok: true,
      hasPin: !!(wallet as any)?.txn_pin_hash,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

    enforceRateLimit(`txn_pin:${user.id}`, { max: 5, windowMs: 60_000 });

    const body = await req.json().catch(() => ({}));
    const action = body.action;
    const pin = String(body.pin ?? "");
    const oldPin = String(body.oldPin ?? "");
    const newPin = String(body.newPin ?? "");

    if (!["set", "verify", "change"].includes(action)) {
      return NextResponse.json({ ok: false, error: "action must be 'set', 'verify', or 'change'" }, { status: 400 });
    }

    const pinErr = validatePin(pin);
    if (pinErr) return NextResponse.json({ ok: false, error: pinErr }, { status: 400 });

    const admin = createAdminClient();
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();

    if (action === "set") {
      const { data: wallet } = await admin
        .from("user_wallets")
        .select("txn_pin_hash")
        .eq("user_id", user.id)
        .maybeSingle();

      if ((wallet as any)?.txn_pin_hash) {
        return NextResponse.json({ ok: false, error: "Transaction PIN already set. Use the change flow instead." }, { status: 400 });
      }

      const pinHash = await hashPassword(pin);

      const { error } = await admin
        .from("user_wallets")
        .update({ txn_pin_hash: pinHash } as any)
        .eq("user_id", user.id);

      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

      await writeWalletAudit(user.id, "txn_pin_set", {}, ip);

      return NextResponse.json({ ok: true, message: "Transaction PIN set successfully" });
    }

    // For verify and change, fetch the stored hash
    const { data: wallet } = await admin
      .from("user_wallets")
      .select("txn_pin_hash")
      .eq("user_id", user.id)
      .maybeSingle();

    const storedHash = (wallet as any)?.txn_pin_hash;
    if (!storedHash) {
      return NextResponse.json({ ok: false, error: "No transaction PIN set. Set one first in Earnings &rarr; Payout method." }, { status: 400 });
    }

    if (action === "verify") {
      const valid = await verifyPassword(pin, storedHash);
      await writeWalletAudit(user.id, valid ? "txn_pin_verified" : "txn_pin_verify_fail", {}, ip);

      if (!valid) {
        return NextResponse.json({ ok: false, error: "Incorrect transaction PIN" }, { status: 401 });
      }

      return NextResponse.json({ ok: true, verified: true });
    }

    if (action === "change") {
      const newPinErr = validatePin(newPin);
      if (newPinErr) return NextResponse.json({ ok: false, error: newPinErr }, { status: 400 });

      const valid = await verifyPassword(oldPin, storedHash);
      if (!valid) {
        await writeWalletAudit(user.id, "txn_pin_change_fail", {}, ip);
        return NextResponse.json({ ok: false, error: "Incorrect current PIN" }, { status: 401 });
      }

      const newPinHash = await hashPassword(newPin);

      const { error } = await admin
        .from("user_wallets")
        .update({ txn_pin_hash: newPinHash } as any)
        .eq("user_id", user.id);

      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

      await writeWalletAudit(user.id, "txn_pin_changed", {}, ip);

      return NextResponse.json({ ok: true, message: "Transaction PIN changed successfully" });
    }

    return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });
  } catch (e) {
    if (e instanceof SecurityError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
