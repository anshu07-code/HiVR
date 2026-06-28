import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyWorkspaceParties } from "@/lib/notifications/helpers";

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

  // Notify the buyer that the delivery is in for review. The
  // employee is skipped (they're the actor). Other delivery events
  // (file approval, mark as done) generate their own notifications.
  await notifyWorkspaceParties(workspaceId, {
    kind: "workspace_delivered",
    title: "Delivery submitted for review",
    body: "The employee has submitted the work. Review the vault files and either approve or request changes.",
    link: `/dashboard/workspaces/${workspaceId}?tab=vault`,
  });

  return NextResponse.json(result);
}
