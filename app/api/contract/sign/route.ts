// POST /api/contract/sign — wrapper for the public.sign_contract RPC.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  SecurityError,
  requireUuid,
  enforceRateLimit,
} from "@/lib/security";

const MAX_SIGNATURE_NAME_LEN = 80;

export async function POST(req: NextRequest) {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
    enforceRateLimit(`contract_sign:${user.id}`, { max: 10, windowMs: 60_000 });

    const body = await req.json().catch(() => ({}));
    let contractId: string;
    try {
      contractId = requireUuid(body.contractId, "contractId");
    } catch (e) {
      if (e instanceof SecurityError) {
        return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
      }
      throw e;
    }
    const signatureName = String(body.signatureName ?? "").trim();
    if (!signatureName) return NextResponse.json({ ok: false, error: "signatureName is required" }, { status: 400 });
    if (signatureName.length > MAX_SIGNATURE_NAME_LEN) {
      return NextResponse.json({ ok: false, error: `signatureName too long (max ${MAX_SIGNATURE_NAME_LEN} chars)` }, { status: 400 });
    }

    const { data, error } = await sb.rpc("sign_contract" as any, {
      p_contract_id:    contractId,
      p_signature_name: signatureName,
    } as any);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (!data || data.ok === false) return NextResponse.json({ ok: false, error: data?.error ?? "Sign failed" }, { status: 400 });
    return NextResponse.json(data);
  } catch (e) {
    if (e instanceof SecurityError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
