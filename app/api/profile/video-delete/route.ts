import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * DELETE /api/profile/video-delete?id=<id>&path=<path>
 *
 * Deletes a profile_videos row (RLS ensures only the owner) and
 * best-effort removes the underlying object from storage.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req: Request) {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const path = url.searchParams.get("path");
    if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

    // RLS on profile_videos restricts deletes to the owner.
    const { error: delErr } = await (sb.from("profile_videos") as any).delete().eq("id", id).eq("user_id", user.id);
    if (delErr) return NextResponse.json({ ok: false, error: delErr.message }, { status: 400 });

    if (path) {
      const admin = createAdminClient();
      await admin.storage.from("profile-videos").remove([path]).catch(() => undefined);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
