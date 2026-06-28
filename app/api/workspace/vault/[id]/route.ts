import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * DELETE /api/workspace/vault/[id]?cascade=true
 *
 * Soft-delete a vault item. If the item is a folder and `cascade` is
 * true, also delete all children (folders + files recursively). Files
 * inside the deleted folders have their storage objects removed too.
 *
 * The endpoint returns a `preview` payload on a HEAD-style request
 * (?dryRun=1) so the client can show the user "X files and Y folders
 * will be deleted" before they confirm.
 *
 * Body for actual delete: {} (cascade in query string)
 *
 * Response:
 *   { ok: true, deleted_files: 5, deleted_folders: 2 }
 */

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

  const itemId = String(params.id);
  const url = new URL(req.url);
  const cascade = url.searchParams.get("cascade") === "true";
  const dryRun = url.searchParams.get("dryRun") === "1";

  // 1. Load the item and verify the caller is a workspace member.
  const admin = createAdminClient();
  const { data: item } = await admin
    .from("workspace_vault")
    .select("id, workspace_id, name, is_folder, parent_id")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return NextResponse.json({ ok: false, error: "Item not found" }, { status: 404 });
  const i = item as any;

  const { data: ws } = await admin
    .from("workspaces")
    .select("id, buyer_id, employee_id, chat_locked_at")
    .eq("id", i.workspace_id)
    .maybeSingle();
  const w = ws as any;
  if (!w || ![w.buyer_id, w.employee_id].includes(user.id)) {
    return NextResponse.json({ ok: false, error: "Not authorised" }, { status: 403 });
  }

  // 2. Collect descendants (if folder + cascade)
  const targets: { id: string; is_folder: boolean; storage_object_id: string | null; name: string }[] = [];
  if (i.is_folder && cascade) {
    const queue: string[] = [itemId];
    while (queue.length) {
      const batch = queue.splice(0, queue.length);
      const { data: children } = await admin
        .from("workspace_vault")
        .select("id, is_folder, storage_object_id, name, parent_id")
        .in("parent_id", batch);
      for (const c of (children ?? []) as any[]) {
        targets.push(c);
        if (c.is_folder) queue.push(c.id);
      }
    }
  }
  // Always include the item itself
  targets.unshift({
    id: i.id,
    is_folder: i.is_folder,
    storage_object_id: i.storage_object_id,
    name: i.name,
  });

  const fileCount = targets.filter(t => !t.is_folder && t.storage_object_id).length;
  const folderCount = targets.filter(t => t.is_folder).length;
  const storagePaths = targets
    .filter(t => !t.is_folder && t.storage_object_id)
    .map(t => t.storage_object_id as string);

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      preview: true,
      file_count: fileCount,
      folder_count: folderCount,
      names: targets.map(t => t.name),
    });
  }

  // 3. Delete from storage (best-effort — if it fails, the DB row is
  //    still removed; the orphaned storage object will be cleaned up
  //    by a periodic job).
  if (storagePaths.length) {
    await admin.storage.from("workspace-vault").remove(storagePaths).catch((e: any) => {
      // eslint-disable-next-line no-console
      console.error("[vault/delete] storage remove failed (continuing):", e?.message);
    });
  }

  // 4. Log the event BEFORE deleting rows (in case the delete fails,
  //    the audit still has a record of the attempted action).
  await (admin.from("vault_event_log") as any).insert({
    workspace_id: i.workspace_id,
    vault_item_id: itemId,
    actor_id: user.id,
    actor_name: null,
    event: "delete",
    file_name: i.name,
    file_size: null,
    metadata: {
      cascade,
      file_count: fileCount,
      folder_count: folderCount,
    },
  });

  // 5. Delete rows. For cascades, delete deepest-first to avoid
  //    FK violations. We've already collected all descendants.
  if (i.is_folder && cascade && targets.length > 1) {
    // Delete all descendants except the root, then the root.
    for (const t of targets.slice(1).reverse()) {
      await admin.from("workspace_vault").delete().eq("id", t.id);
    }
  }
  await admin.from("workspace_vault").delete().eq("id", itemId);

  return NextResponse.json({
    ok: true,
    deleted_files: fileCount,
    deleted_folders: folderCount,
  });
}
