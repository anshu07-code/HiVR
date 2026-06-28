import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/workspace/vault/folder
 *
 * Create a new folder inside the workspace vault. The folder is
 * represented as a row in workspace_vault with is_folder = true and
 * no storage_object_id. Folders can be nested via parent_id.
 *
 * Body: { workspaceId: string, name: string, parentId?: string|null }
 */

export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const workspaceId = String(body.workspaceId ?? "");
  const name = String(body.name ?? "").trim();
  const parentId = body.parentId ? String(body.parentId) : null;
  if (!workspaceId || !name) {
    return NextResponse.json({ ok: false, error: "workspaceId and name required" }, { status: 400 });
  }
  if (name.length > 80 || /[\\/:*?"<>|]/.test(name)) {
    return NextResponse.json({ ok: false, error: "Invalid folder name" }, { status: 400 });
  }

  // Verify party membership
  const admin = createAdminClient();
  const { data: ws } = await admin
    .from("workspaces")
    .select("id, buyer_id, employee_id, status, chat_locked_at")
    .eq("id", workspaceId)
    .maybeSingle();
  const w = ws as any;
  if (!w) return NextResponse.json({ ok: false, error: "Workspace not found" }, { status: 404 });
  if (![w.buyer_id, w.employee_id].includes(user.id)) {
    return NextResponse.json({ ok: false, error: "Not a workspace member" }, { status: 403 });
  }
  if (w.chat_locked_at) {
    return NextResponse.json({ ok: false, error: "Workspace is locked" }, { status: 400 });
  }

  // Create folder via service_role to bypass RLS, then record event
  const { data: folder, error } = await (admin.from("workspace_vault") as any)
    .insert({
      workspace_id: workspaceId,
      parent_id: parentId,
      name,
      original_name: name,
      is_folder: true,
      file_type: "folder",
      uploaded_by: user.id,
      mime_type: "inode/directory",
      storage_object_id: null,
      file_size: 0,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  await (admin.from("vault_event_log") as any).insert({
    workspace_id: workspaceId,
    vault_item_id: folder.id,
    actor_id: user.id,
    actor_name: null,
    event: "folder_create",
    file_name: name,
    metadata: { parent_id: parentId },
  });

  return NextResponse.json({ ok: true, folder });
}
