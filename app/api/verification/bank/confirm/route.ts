import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const Schema = z.object({
  bankVerificationId: z.string().uuid(),
  code: z.string().min(1).max(16),
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

    const { data, error } = await (sb.rpc as any)("confirm_bank_verification", {
      p_bank_verification_id: parsed.data.bankVerificationId,
      p_code: parsed.data.code,
    });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    const result = (data as any) ?? {};
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error ?? "Failed to verify" }, { status: 400 });

    return NextResponse.json({
      ok: true,
      status: result.status,
      last4: result.last4,
      upi_provider: result.upi_provider,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
