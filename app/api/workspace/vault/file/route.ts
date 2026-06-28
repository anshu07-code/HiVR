import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/workspace/vault/file
 *
 * Creates an empty placeholder file inside the workspace vault. The
 * file has no storage_object_id and 0 bytes — the user can edit it
 * later by uploading a real version. (Future: open the placeholder
 * in a built-in editor.)
 *
 * Body: { workspaceId: string, name: string, parentId?: string|null }
 */

const MAX_NAME_LEN = 120;

function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "_").slice(0, MAX_NAME_LEN);
}

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
  if (name.length > MAX_NAME_LEN || /[\\/:*?"<>|]/.test(name)) {
    return NextResponse.json({ ok: false, error: "Invalid file name" }, { status: 400 });
  }

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

  const safe = safeName(name);
  // Empty file: 0 bytes, no storage object. Future: this could be
  // hooked up to a built-in editor that writes content to the same
  // storage path on save.
  const { data: file, error } = await (admin.from("workspace_vault") as any)
    .insert({
      workspace_id: workspaceId,
      parent_id: parentId,
      name: safe,
      original_name: safe,
      is_folder: false,
      file_type: "document",
      uploaded_by: user.id,
      mime_type: "text/plain",
      storage_object_id: null,
      file_size: 0,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  await (admin.from("vault_event_log") as any).insert({
    workspace_id: workspaceId,
    vault_item_id: file.id,
    actor_id: user.id,
    actor_name: null,
    event: "upload",
    file_name: safe,
    file_size: 0,
    metadata: { placeholder: true, parent_id: parentId },
  });

  return NextResponse.json({ ok: true, file });
}
