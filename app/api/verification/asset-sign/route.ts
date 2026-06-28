import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

/**
 * POST /api/verification/asset-sign
 *
 * Returns a signed upload URL for the `verification-assets` bucket
 * using the service role client. The client uploads the selfie /
 * document directly to storage with the signed URL.
 *
 * Path convention: <user_id>/<session_id>/<kind>.<ext>
 *
 * Body: { sessionId, kind, ext? }
 *   kind: 'selfie' | 'document'
 *   ext : file extension (defaults to 'jpg' / 'pdf' from mime)
 */

const Schema = z.object({
  sessionId: z.string().uuid(),
  kind: z.enum(["selfie", "document"]),
  ext: z.string().max(8).optional(),
});

const EXT_BY_KIND: Record<string, string> = {
  selfie_jpg: "jpg",
  selfie_png: "png",
  document_jpg: "jpg",
  document_png: "png",
  document_pdf: "pdf",
};

export async function POST(req: Request) {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    const v = parsed.data;

    // Confirm the session belongs to this user
    const { data: session } = await sb
      .from("verification_sessions")
      .select("id, user_id, status")
      .eq("id", v.sessionId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!session) return NextResponse.json({ ok: false, error: "Session not found" }, { status: 404 });

    const ext = (v.ext ?? "jpg").replace(/^\.+/, "").toLowerCase();
    const safeExt = /^[a-z0-9]{1,8}$/.test(ext) ? ext : "jpg";
    const path = `${user.id}/${v.sessionId}/${v.kind}.${safeExt}`;

    const admin = createAdminClient();
    const { data: signed, error } = await admin
      .storage
      .from("verification-assets")
      .createSignedUploadUrl(path);
    if (error || !signed) {
      return NextResponse.json({ ok: false, error: error?.message ?? "Failed to sign" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      bucket: "verification-assets",
      path,
      token: signed.token,
      signedUrl: signed.signedUrl,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
