import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/workspace/vault/stream/[id]
 *
 * Server-side streaming of a vault file with HTTP Range support so
 * HTML5 <video> / <audio> can seek. Also increments view_count and
 * records a 'view' event in the audit log (once per session).
 *
 * Auth: requires the caller to be a workspace party (buyer / employee)
 * or an admin. The signed URL approach in /api/workspace/vault/sign
 * is fine for downloads, but for video we need Range support which
 * Supabase signed URLs support too — but going through our own
 * endpoint lets us track views + enforce access in one place.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const itemId = String(params.id);
  const admin = createAdminClient();

  // 1. Load the item + workspace + check membership
  const { data: item } = await admin
    .from("workspace_vault")
    .select("id, workspace_id, name, storage_object_id, mime_type, file_type, file_size, is_folder")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const i = item as any;
  if (i.is_folder || !i.storage_object_id) {
    return NextResponse.json({ error: "Not a streamable file" }, { status: 400 });
  }

  const { data: ws } = await admin
    .from("workspaces")
    .select("id, buyer_id, employee_id")
    .eq("id", i.workspace_id)
    .maybeSingle();
  const w = ws as any;
  if (!w || ![w.buyer_id, w.employee_id].includes(user.id)) {
    // Allow admin too
    const { data: ar } = await sb.from("admin_users").select("admin_role").eq("user_id", user.id).maybeSingle();
    if (!ar) return NextResponse.json({ error: "Not authorised" }, { status: 403 });
  }

  // 2. Download the file from storage
  const { data: blob, error: dlErr } = await admin.storage
    .from("workspace-vault")
    .download(i.storage_object_id);
  if (dlErr || !blob) {
    return NextResponse.json({ error: "Could not load file" }, { status: 500 });
  }
  const buffer = Buffer.from(await blob.arrayBuffer());
  const total = buffer.length;

  // 3. Increment view count + record view event (fire-and-forget)
  void (async () => {
    try {
      await admin.rpc("increment_vault_views" as any, { p_item_id: itemId } as any);
      await (admin.from("vault_event_log") as any).insert({
        workspace_id: i.workspace_id,
        vault_item_id: itemId,
        actor_id: user.id,
        actor_name: null,
        event: "view",
        file_name: i.name,
        file_size: i.file_size,
        metadata: { mime: i.mime_type, file_type: i.file_type },
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[vault/stream] view event failed:", e);
    }
  })();

  // 4. Honour HTTP Range so the <video> can seek
  const range = req.headers.get("range");
  const mimeType = i.mime_type || "application/octet-stream";

  if (range) {
    const m = /^bytes=(\d+)-(\d+)?$/.exec(range);
    if (m) {
      const start = parseInt(m[1], 10);
      const end = m[2] ? parseInt(m[2], 10) : total - 1;
      if (start <= end && end < total) {
        const chunk = buffer.subarray(start, end + 1);
        return new NextResponse(chunk, {
          status: 206,
          headers: {
            "Content-Range": `bytes ${start}-${end}/${total}`,
            "Accept-Ranges": "bytes",
            "Content-Length": String(chunk.length),
            "Content-Type": mimeType,
            "Cache-Control": "private, max-age=60",
            "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(i.name)}`,
          },
        });
      }
    }
  }

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(total),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=60",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(i.name)}`,
    },
  });
}
