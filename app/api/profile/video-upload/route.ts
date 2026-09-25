import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomUUID } from "node:crypto";

/**
 * POST /api/profile/video-upload
 *
 * Multipart form-data:
 *   file              — the video file (mp4 / webm / mov)
 *   caption           — text caption
 *   skillCategoryId   — optional skill_categories.id
 *   durationSeconds   — optional; the client reads it off the
 *                       <video> element on play. We trust it.
 *   isPublic          — "true" / "false" (defaults to true)
 *
 * The route:
 *   1. Authenticates the user.
 *   2. Validates size (max 50 MB) and MIME type.
 *   3. Uploads to the public `profile-videos` bucket.
 *   4. Inserts a `profile_videos` row.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB
const ALLOWED = new Set(["video/mp4", "video/webm", "video/quicktime"]);

export async function POST(req: Request) {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

    const fd = await req.formData();
    const file = fd.get("file");
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "No file" }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: "Max 50 MB" }, { status: 400 });
    if (!ALLOWED.has(file.type)) return NextResponse.json({ ok: false, error: "Use mp4 / webm / mov" }, { status: 400 });

    const caption = String(fd.get("caption") ?? "").trim().slice(0, 200);
    if (!caption) return NextResponse.json({ ok: false, error: "Caption is required" }, { status: 400 });

    const skillCategoryId = (() => {
      const v = fd.get("skillCategoryId");
      return typeof v === "string" && v.length > 0 ? v : null;
    })();

    const durationSeconds = (() => {
      const v = Number(fd.get("durationSeconds"));
      if (!Number.isFinite(v) || v <= 0) return 1;
      return Math.min(180, Math.max(1, Math.round(v)));
    })();

    const isPublic = String(fd.get("isPublic") ?? "true") !== "false";

    const ext = (() => {
      if (file.type === "video/mp4") return "mp4";
      if (file.type === "video/webm") return "webm";
      if (file.type === "video/quicktime") return "mov";
      return "mp4";
    })();
    const path = `${user.id}/${randomUUID()}.${ext}`;

    const admin = createAdminClient();
    const buf = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await admin.storage.from("profile-videos").upload(path, buf, {
      contentType: file.type,
      cacheControl: "31536000",
      upsert: false,
    });
    if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

    const { data: row, error: insErr } = await (admin
      .from("profile_videos") as any)
      .insert({
        user_id: user.id,
        storage_bucket: "profile-videos",
        storage_path: path,
        caption,
        skill_category_id: skillCategoryId,
        duration_seconds: durationSeconds,
        byte_size: file.size,
        is_public: isPublic,
      })
      .select("id, storage_path, caption, duration_seconds")
      .single();
    if (insErr) {
      console.error("[video-upload] insert error:", insErr);
      // best-effort: roll back the storage upload
      await admin.storage.from("profile-videos").remove([path]).catch(() => undefined);
      return NextResponse.json({ ok: false, error: insErr.message, details: insErr.details ?? null, hint: insErr.hint ?? null }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: (row as any).id, storagePath: (row as any).storage_path });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
