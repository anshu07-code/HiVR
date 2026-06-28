import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const Schema = z.object({
  upiId: z.string().min(3).max(80),
  accountHolder: z.string().min(2).max(120),
  ifsc: z.string().min(11).max(11),
});

export async function POST(req: Request) {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }

    const { data, error } = await (sb.rpc as any)("start_bank_verification", {
      p_upi_id: parsed.data.upiId,
      p_account_holder: parsed.data.accountHolder,
      p_ifsc: parsed.data.ifsc,
    });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    const result = (data as any) ?? {};
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error ?? "Failed to start" }, { status: 400 });

    return NextResponse.json({
      ok: true,
      bank_verification_id: result.bank_verification_id,
      sandbox_code: result.sandbox_code,
      amount_paise: result.amount_paise,
      expires_at: result.expires_at,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
