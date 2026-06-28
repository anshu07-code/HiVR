import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  SecurityError,
  validateUploadedFile,
} from "@/lib/security";

/**
 * POST /api/profile/upload-avatar
 * Multipart form with a `file` field. The file must be a real image
 * (magic-byte sniffed) — JPEG / PNG / WebP / GIF. Max 5 MB.
 *
 * The avatars bucket is public, so we strictly forbid SVG (which can
 * contain inline `<script>` tags that execute in any viewer's browser
 * — a stored-XSS vector).
 */
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(req: NextRequest) {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    let fmt;
    try {
      fmt = await validateUploadedFile(file as File, "image", MAX_BYTES);
    } catch (e) {
      if (e instanceof SecurityError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }

    // Reject SVGs explicitly. (validateUploadedFile already does this since
    // SVG isn't in the image allow-list, but keep the explicit check as
    // belt-and-braces in case the allow-list ever changes.)
    if (fmt.mime === "image/svg+xml" || fmt.ext === "svg") {
      return NextResponse.json(
        { error: "SVG uploads are not allowed (stored-XSS risk)." },
        { status: 400 },
      );
    }

    // Storage path is the user id + the canonical extension we detected.
    // The original filename is dropped (could contain hostile characters)
    // and we use the safe extension from the magic-byte sniffer.
    const path = `${user.id}/avatar.${fmt.ext}`;
    const arrayBuf = await file!.arrayBuffer();
    const buf = Buffer.from(arrayBuf);

    const { error: uploadErr } = await sb.storage.from("avatars").upload(path, buf, {
      contentType: fmt.mime,
      upsert: true,
    });
    if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });

    const { data: { publicUrl } } = sb.storage.from("avatars").getPublicUrl(path);

    const { error: updateErr } = await sb.from("users").update({ avatar_url: publicUrl }).eq("id", user.id);
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, url: publicUrl });
  } catch (e) {
    if (e instanceof SecurityError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
