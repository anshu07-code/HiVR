import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  SecurityError,
  validateUploadedFile,
  sanitizeFilename,
  requireUuid,
  secureRandomId,
  enforceRateLimit,
} from "@/lib/security";

/**
 * POST /api/workspace/vault/upload
 * Multipart form: workspaceId, parentId?, file.
 * Uploads to the workspace-vault bucket and records via `record_vault_file`.
 *
 * Security:
 *   - Caller must be a member of the workspace (enforced server-side
 *     via the `record_vault_file` RPC).
 *   - File is magic-byte-sniffed. Accepts all vault-supported formats:
 *     images, video, audio, PDF, Office docs, CSV, code, archives.
 *   - Storage path uses crypto.randomUUID() — not Math.random().
 *   - 25 MB cap.
 *   - 20 uploads per hour per user (per-user rate limit).
 */
const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    // Per-user rate limit: 20 uploads per hour. Vault uploads are heavy
    // (server-side parsing) so we cap them aggressively.
    enforceRateLimit(`vault_upload:${user.id}`, { max: 20, windowMs: 60 * 60_000 });

    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "Invalid form data" }, { status: 400 });

    const file = form.get("file");
    let workspaceId: string;
    try {
      workspaceId = requireUuid(form.get("workspaceId"), "workspaceId");
    } catch (e) {
      if (e instanceof SecurityError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }
    const parentIdRaw = form.get("parentId");
    let parentId: string | null = null;
    if (parentIdRaw && String(parentIdRaw).trim() !== "") {
      try {
        parentId = requireUuid(parentIdRaw, "parentId");
      } catch (e) {
        if (e instanceof SecurityError) {
          return NextResponse.json({ error: e.message }, { status: e.status });
        }
        throw e;
      }
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }

    let fmt;
    try {
      fmt = await validateUploadedFile(file, "vault", MAX_BYTES);
    } catch (e) {
      if (e instanceof SecurityError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }

    const original = sanitizeFilename(file.name || "file");
    // H6: always use crypto.randomUUID() — never fall back to Math.random.
    const storageObjectId = `${workspaceId}/${secureRandomId()}-${original}`;

    const admin = createAdminClient();
    const arrayBuf = await file.arrayBuffer();

    const { error: upErr } = await admin.storage
      .from("workspace-vault")
      .upload(storageObjectId, arrayBuf, { contentType: fmt.mime, upsert: false });
    if (upErr) {
      // eslint-disable-next-line no-console
      console.error("[vault/upload] storage upload failed:", {
        workspaceId,
        original,
        size: file.size,
        error: upErr.message,
      });
      return NextResponse.json({ ok: false, error: `Upload failed: ${upErr.message}` }, { status: 500 });
    }

    const { data, error } = await sb.rpc("record_vault_file" as any, {
      p_workspace_id: workspaceId,
      p_parent_id: parentId,
      p_name: original,
      p_original_name: original,
      p_storage_object_id: storageObjectId,
      p_file_size: file.size,
      p_mime_type: fmt.mime,
    } as any);
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[vault/upload] record_vault_file failed:", { workspaceId, original, error: error.message });
      return NextResponse.json({ ok: false, error: `Could not register file: ${error.message}` }, { status: 500 });
    }
    const result = data as any;
    if (!result || result.ok === false) {
      return NextResponse.json({ ok: false, error: result?.error ?? "Failed" }, { status: 400 });
    }

    // Log the upload event for the activity timeline
    await (admin.from("vault_event_log") as any).insert({
      workspace_id: workspaceId,
      vault_item_id: result.id,
      actor_id: user.id,
      actor_name: null,
      event: "upload",
      file_name: original,
      file_size: file.size,
      metadata: { parent_id: parentId ?? null, mime_type: fmt.mime },
    });

    return NextResponse.json({
      ok: true,
      id: result.id,
      name: result.name,
      originalName: result.original_name ?? original,
      size: file.size,
      mimeType: fmt.mime,
    });
  } catch (e) {
    if (e instanceof SecurityError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
