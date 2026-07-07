import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  SecurityError,
  validateUploadedFile,
} from "@/lib/security";

/**
 * POST /api/profile/upload-cover
 * Multipart form with a `file` field. Image only (JPEG/PNG/WebP/GIF),
 * max 8 MB (covers are larger than avatars). Magic-byte sniffed.
 * SVGs explicitly forbidden.
 */
const MAX_BYTES = 8 * 1024 * 1024;

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
    if (fmt.mime === "image/svg+xml" || fmt.ext === "svg") {
      return NextResponse.json(
        { error: "SVG uploads are not allowed (stored-XSS risk)." },
        { status: 400 },
      );
    }

    const path = `${user.id}/cover.${fmt.ext}`;
    const arrayBuf = await file!.arrayBuffer();
    const buf = Buffer.from(arrayBuf);

    const { error: uploadErr } = await sb.storage.from("avatars").upload(path, buf, {
      contentType: fmt.mime,
      upsert: true,
    });
    if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });

    const { data: { publicUrl } } = sb.storage.from("avatars").getPublicUrl(path);
    const versionedUrl = publicUrl + "?v=" + Date.now();

    const { error: updateErr } = await sb.from("users").update({ cover_url: versionedUrl }).eq("id", user.id);
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, url: versionedUrl });
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
