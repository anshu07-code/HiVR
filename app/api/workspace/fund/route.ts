import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const workspaceId = String(body.workspaceId ?? "");
  const provider = body.provider ? String(body.provider) : "manual_sandbox";
  const paymentId = body.paymentId ? String(body.paymentId) : null;
  if (!workspaceId) return NextResponse.json({ ok: false, error: "workspaceId required" }, { status: 400 });

  const { data, error } = await sb.rpc("fund_workspace_escrow" as any, {
    p_workspace_id: workspaceId,
    p_provider: provider,
    p_payment_id: paymentId,
  } as any);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const result = data as any;
  if (!result || result.ok === false) return NextResponse.json({ ok: false, error: result?.error ?? "Failed" }, { status: 400 });
  return NextResponse.json(result);
}
