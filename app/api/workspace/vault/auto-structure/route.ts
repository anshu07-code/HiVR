import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import crypto from "crypto";

/**
 * POST /api/workspace/vault/auto-structure
 *
 * Accepts a multipart upload with multiple files + their original
 * paths (from a directory upload via the `webkitdirectory` attribute).
 * Creates the folder hierarchy on the server and places each file
 * into the right folder.
 *
 *   Body (multipart/form-data):
 *     workspaceId: string
 *     files[]:    File          (with webkitRelativePath in the File)
 *     paths[]:    string        (one per file, parallel array — the
 *                                relative path within the uploaded
 *                                directory; e.g. "src/index.ts")
 *
 *   Or simpler: just send files[] and use the File.webkitRelativePath
 *   if the browser supports it (Chromium / Edge / Opera). For Safari
 *   / Firefox, the client also sends the `paths` array.
 *
 *   Response:
 *     { ok: true, created: { folders: N, files: N }, items: [...] }
 */

const MAX_TOTAL_BYTES = 100 * 1024 * 1024;  // 100 MB cap per directory
const MAX_FILES = 200;

function safeName(s: string): string {
  return s.replace(/[^A-Za-z0-9._\- ]/g, "_").slice(0, 120) || "file";
}

function classifyByExt(name: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "heic", "heif"].includes(ext)) return "image";
  if (["mp4", "mov", "webm", "mkv", "avi", "m4v"].includes(ext)) return "video";
  if (["mp3", "wav", "m4a", "ogg", "flac"].includes(ext)) return "audio";
  if (ext === "pdf") return "pdf";
  if (["doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "rtf", "csv", "md"].includes(ext)) return "document";
  if (["zip", "rar", "7z", "tar", "gz", "tgz", "bz2"].includes(ext)) return "archive";
  if (["js", "jsx", "ts", "tsx", "json", "py", "rb", "go", "rs", "java", "kt", "swift", "c", "cpp", "h", "hpp", "cs", "php", "sh", "yaml", "yml", "toml", "ini", "cfg", "html", "css", "scss", "sql"].includes(ext)) return "code";
  return "other";
}

function randomId(): string {
  return (typeof crypto !== "undefined" && (crypto as any).randomUUID)
    ? (crypto as any).randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, error: "Invalid form data" }, { status: 400 });

  const workspaceId = String(form.get("workspaceId") ?? "");
  if (!workspaceId) return NextResponse.json({ ok: false, error: "workspaceId required" }, { status: 400 });

  const files = form.getAll("files[]") as unknown as File[];
  const paths = form.getAll("paths[]") as unknown as string[];
  if (!files || files.length === 0) {
    return NextResponse.json({ ok: false, error: "No files" }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ ok: false, error: `Too many files (max ${MAX_FILES})` }, { status: 400 });
  }

  // paths[] is parallel to files[]. If the client didn't send any
  // (e.g. multi-file upload via regular file input without webkitdirectory),
  // we fall back to the file name as the path.
  const filePaths: string[] = files.map((_, i) => paths[i] || files[i].name);

  // Optional parent folder (when uploading via the "Folder" button
  // while inside a folder, the new folders/files should go into the
  // current folder).
  const parentFolderId = form.get("parentId") ? String(form.get("parentId")) : null;

  // Verify party membership
  const admin = createAdminClient();
  const { data: ws } = await admin
    .from("workspaces")
    .select("id, buyer_id, employee_id, chat_locked_at")
    .eq("id", workspaceId)
    .maybeSingle();
  const w = ws as any;
  if (!w || ![w.buyer_id, w.employee_id].includes(user.id)) {
    return NextResponse.json({ ok: false, error: "Not a workspace member" }, { status: 403 });
  }
  if (w.chat_locked_at) {
    return NextResponse.json({ ok: false, error: "Workspace is locked" }, { status: 400 });
  }

  // Total size cap
  const totalSize = files.reduce((s, f) => s + f.size, 0);
  if (totalSize > MAX_TOTAL_BYTES) {
    return NextResponse.json({ ok: false, error: `Total size ${(totalSize / 1024 / 1024).toFixed(1)} MB exceeds 100 MB cap` }, { status: 413 });
  }

  // If a parent folder is set, prefix every file's path with it.
  // This way, files dropped while inside a folder go into that folder
  // rather than to root.
  const adjustedPaths = parentFolderId
    ? filePaths.map((p) => {
        // The client already supplies a relative path (within the
        // parent folder). We don't need to look up the parent name —
        // we just record parent_id at insert time.
        return p;
      })
    : filePaths;

  // Build folder map: every distinct folder path → vault item id
  // Path format: "src/components" → two folders: "src" (parent_id=null),
  // "components" (parent_id=src.id)
  const folderIdByPath = new Map<string, string>();     // resolved paths
  const createdFolders: { path: string; id: string }[] = [];
  const createdFiles: any[] = [];

  // 1. Collect all unique folder paths from the file paths
  const folderPaths = new Set<string>();
  for (const p of adjustedPaths) {
    const parts = p.split("/").filter(Boolean);
    for (let i = 1; i < parts.length; i++) {
      folderPaths.add(parts.slice(0, i).join("/"));
    }
  }
  const sortedPaths = Array.from(folderPaths).sort();

  // 2. Insert folders in BFS order (parent first)
  for (const path of sortedPaths) {
    const parts = path.split("/");
    const name = parts[parts.length - 1];
    const parentPath = parts.length > 1 ? parts.slice(0, -1).join("/") : null;
    const parentId = parentPath
      ? folderIdByPath.get(parentPath) ?? null
      : parentFolderId;   // top-level folder inside a parent
    const safe = safeName(name);
    const { data: folder, error: fErr } = await (admin.from("workspace_vault") as any)
      .insert({
        workspace_id: workspaceId,
        parent_id: parentId,
        name: safe,
        original_name: name,
        is_folder: true,
        file_type: "folder",
        uploaded_by: user.id,
        mime_type: "inode/directory",
        storage_object_id: null,
        file_size: 0,
      })
      .select("id")
      .single();
    if (fErr) return NextResponse.json({ ok: false, error: `Failed to create folder ${path}: ${fErr.message}` }, { status: 500 });
    folderIdByPath.set(path, folder.id);
    createdFolders.push({ path, id: folder.id });
  }

  // 3. Upload files + create rows
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const rawPath = adjustedPaths[i];
    const parts = rawPath.split("/").filter(Boolean);
    const fileName = parts[parts.length - 1] || file.name;
    const folderPath = parts.length > 1 ? parts.slice(0, -1).join("/") : null;
    const fileParentId = folderPath
      ? folderIdByPath.get(folderPath) ?? null
      : parentFolderId;   // file directly inside the parent folder
    const safe = safeName(fileName);

    const storageObjectId = `${workspaceId}/${randomId()}-${safe}`;
    const arrayBuf = await file.arrayBuffer();
    const { error: upErr } = await admin.storage
      .from("workspace-vault")
      .upload(storageObjectId, arrayBuf, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (upErr) {
      // eslint-disable-next-line no-console
      console.error("[auto-structure] storage upload failed:", { name: fileName, error: upErr.message });
      continue;
    }
    const { data: row, error: rErr } = await (admin.from("workspace_vault") as any)
      .insert({
        workspace_id: workspaceId,
        parent_id: fileParentId,
        name: safe,
        original_name: fileName,
        is_folder: false,
        file_type: classifyByExt(fileName),
        uploaded_by: user.id,
        mime_type: file.type || "application/octet-stream",
        storage_object_id: storageObjectId,
        file_size: file.size,
        original_path: rawPath,
      })
      .select("*")
      .single();
    if (rErr) {
      // eslint-disable-next-line no-console
      console.error("[auto-structure] row insert failed:", rErr.message);
      continue;
    }
    createdFiles.push(row);
  }

  // 4. Record a single audit event summarising the upload
  await (admin.from("vault_event_log") as any).insert({
    workspace_id: workspaceId,
    vault_item_id: null,
    actor_id: user.id,
    actor_name: null,
    event: "upload",
    file_name: `${createdFiles.length} files in ${createdFolders.length} folders`,
    file_size: totalSize,
    metadata: {
      batch: true,
      folders: createdFolders.length,
      files: createdFiles.length,
    },
  });

  return NextResponse.json({
    ok: true,
    created: {
      folders: createdFolders.length,
      files: createdFiles.length,
    },
    folders: createdFolders,
    items: createdFiles,
  });
}
