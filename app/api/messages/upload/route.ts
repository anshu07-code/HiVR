import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  SecurityError,
  validateUploadedFile,
  sanitizeFilename,
  requireUuid,
} from "@/lib/security";

/**
 * POST /api/messages/upload
 * Multipart form: contract_id, kind ("file" | "image" | "voice"), folder_id?, file.
 * Uploads the file to the contract-chat bucket and writes a `messages` row.
 *
 * Security:
 *   - Caller must be a party (buyer or employee) of the contract.
 *   - `folder_id`, if present, must belong to the SAME contract. We check
 *     that the folder's contract_id matches; otherwise a malicious party
 *     could set a folder from another contract.
 *   - File is magic-byte-sniffed against the right allow-list:
 *       image  → JPEG / PNG / WebP / GIF  (no SVG, no HTML)
 *       voice  → MP3 / M4A / WAV / OGG / WebM (audio)
 *       file   → PDF / image / video (depending on mime, but no SVG/HTML)
 *   - Max sizes: 25 MB for files/images/videos, 5 MB for voice.
 */
const MAX_FILE = 25 * 1024 * 1024;
const MAX_VOICE = 5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const form = await req.formData();
    let contractId: string;
    try {
      contractId = requireUuid(form.get("contract_id"), "contract_id");
    } catch (e) {
      if (e instanceof SecurityError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }
    const file = form.get("file") as File | null;
    const kind = String(form.get("kind") ?? "file");
    if (kind !== "file" && kind !== "image" && kind !== "voice") {
      return NextResponse.json({ error: "kind must be file | image | voice" }, { status: 400 });
    }

    // H7: validate folder_id belongs to this contract, if provided.
    let folderId: string | null = null;
    const rawFolder = form.get("folder_id");
    if (rawFolder && String(rawFolder).trim() !== "") {
      try {
        folderId = requireUuid(rawFolder, "folder_id");
      } catch (e) {
        if (e instanceof SecurityError) {
          return NextResponse.json({ error: e.message }, { status: e.status });
        }
        throw e;
      }
      const { data: f } = await sb
        .from("contract_folders")
        .select("contract_id")
        .eq("id", folderId)
        .maybeSingle();
      if (!f) {
        return NextResponse.json({ error: "folder_id not found" }, { status: 404 });
      }
      if ((f as any).contract_id !== contractId) {
        return NextResponse.json(
          { error: "folder_id does not belong to this contract" },
          { status: 403 },
        );
      }
    }

    // Auth: must be a party to the contract.
    const { data: c } = await sb
      .from("contracts")
      .select("buyer_id, employee_id")
      .eq("id", contractId)
      .single();
    if (!c || ((c as any).buyer_id !== user.id && (c as any).employee_id !== user.id)) {
      return NextResponse.json({ error: "not a party" }, { status: 403 });
    }

    // Magic-byte sniff the file.
    const maxBytes = kind === "voice" ? MAX_VOICE : MAX_FILE;
    const allowedGroup = kind === "image" ? "image" : kind === "voice" ? "audio" : "document";
    let fmt;
    try {
      fmt = await validateUploadedFile(file as File, allowedGroup, maxBytes);
    } catch (e) {
      if (e instanceof SecurityError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }
    if (fmt.mime === "image/svg+xml" || fmt.ext === "svg") {
      return NextResponse.json({ error: "SVG not allowed" }, { status: 400 });
    }

    const safeName = sanitizeFilename(file!.name || "file");
    // Storage path: {contractId}/{kind}_{random}.{ext} — use the safe ext
    // (not the user-supplied one). The path segment uses a UUID, not
    // any user-controlled string.
    const random = crypto.randomUUID();
    const path = `${contractId}/${kind}_${random}.${fmt.ext}`;
    const arrayBuf = await file!.arrayBuffer();

    const { error: upErr } = await sb.storage.from("contract-chat").upload(path, arrayBuf, {
      contentType: fmt.mime,
    });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    const { data, error } = await sb
      .from("messages")
      .insert({
        contract_id: contractId,
        sender_id: user.id,
        content: kind === "voice" ? "Voice message" : safeName,
        kind,
        storage_path: path,
        file_name: safeName,
        file_size: file!.size,
        folder_id: folderId,
      })
      .select("*, sender:users!messages_sender_id_fkey(id, full_name, avatar_url)")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, message: data });
  } catch (e) {
    if (e instanceof SecurityError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
