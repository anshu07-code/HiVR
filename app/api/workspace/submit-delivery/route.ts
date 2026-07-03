import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const workspaceId = String(body.workspaceId ?? "");
  const note = body.note ? String(body.note) : null;
  if (!workspaceId) return NextResponse.json({ ok: false, error: "workspaceId required" }, { status: 400 });

  const { data, error } = await sb.rpc("submit_workspace_delivery" as any, {
    p_workspace_id: workspaceId,
    p_note: note,
  } as any);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const result = data as any;
  if (!result || result.ok === false) return NextResponse.json({ ok: false, error: result?.error ?? "Failed" }, { status: 400 });

  // Notification is sent inside submit_workspace_delivery (migration 0118)
  // — it includes the actual file count and link. Do NOT also send one
  // from here, or the buyer will get two notifications for the same event.

  return NextResponse.json(result);
}
