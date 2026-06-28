import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/security";

export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  enforceRateLimit(`workspace_send_msg:${user.id}`, { max: 30, windowMs: 60_000 });
  const body = await req.json().catch(() => ({}));
  const workspaceId = String(body.workspaceId ?? "");
  const messageBody = String(body.body ?? "");
  const vaultResourceId = body.vaultResourceId ? String(body.vaultResourceId) : null;
  if (!workspaceId || !messageBody.trim()) {
    return NextResponse.json({ ok: false, error: "workspaceId and body required" }, { status: 400 });
  }

  const { data, error } = await sb.rpc("send_workspace_message" as any, {
    p_workspace_id: workspaceId,
    p_body: messageBody,
    p_vault_resource_id: vaultResourceId,
  } as any);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const result = data as any;
  if (!result || result.ok === false) return NextResponse.json({ ok: false, error: result?.error ?? "Failed" }, { status: 400 });
  return NextResponse.json({
    ok: true,
    id: result.id,
    isFlagged: result.is_flagged,
    isGhosted: result.is_ghosted,
    createdAt: result.created_at,
  });
}
