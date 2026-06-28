import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notifications/helpers";

export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const workspaceId = String(body.workspaceId ?? "");
  const note = body.note ? String(body.note) : null;
  if (!workspaceId) return NextResponse.json({ ok: false, error: "workspaceId required" }, { status: 400 });

  const { data, error } = await sb.rpc("request_workspace_revision" as any, {
    p_workspace_id: workspaceId,
    p_note: note,
  } as any);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const result = data as any;
  if (!result || result.ok === false) return NextResponse.json({ ok: false, error: result?.error ?? "Failed" }, { status: 400 });

  // Notify the employee that the buyer wants changes. The note is
  // included so the employee has context without opening the
  // workspace.
  const { data: ws } = await (sb.from("workspaces") as any)
    .select("employee_id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (ws?.employee_id) {
    await notify({
      userId: ws.employee_id as string,
      kind: "workspace_revision_requested",
      title: "Buyer requested revisions",
      body: note?.slice(0, 200) ?? "The buyer has requested changes. Open the workspace to see what to fix.",
      link: `/dashboard/workspaces/${workspaceId}`,
    });
  }

  return NextResponse.json(result);
}
