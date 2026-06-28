import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/admin/verification/asset-url?session=<id>&kind=<selfie|document>
 *
 * Returns a short-lived signed URL for an admin to view the underlying
 * selfie / document. Admins only (enforced via is_admin() inside the
 * RLS / RPC layer).
 */

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

    // Admin gate
    const { data: adminRow } = await sb.from("admin_users").select("admin_role").eq("user_id", user.id).maybeSingle();
    if (!adminRow) return NextResponse.json({ ok: false, error: "Not authorized" }, { status: 403 });

    const url = new URL(req.url);
    const sessionId = url.searchParams.get("session");
    const kind = url.searchParams.get("kind");
    if (!sessionId || !kind || (kind !== "selfie" && kind !== "document")) {
      return NextResponse.json({ ok: false, error: "Bad input" }, { status: 400 });
    }

    const admin = createAdminClient();
    // Find the most recent asset for this session + kind
    const { data: asset } = await (admin
      .from("verification_assets") as any)
      .select("storage_path, storage_bucket")
      .eq("session_id", sessionId)
      .eq("kind", kind)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!asset) return NextResponse.json({ ok: false, error: "Asset not found" }, { status: 404 });

    const { data: signed, error } = await admin.storage
      .from((asset as any).storage_bucket ?? "verification-assets")
      .createSignedUrl((asset as any).storage_path, 60 * 5);
    if (error || !signed) return NextResponse.json({ ok: false, error: error?.message ?? "Sign failed" }, { status: 500 });

    return NextResponse.json({ ok: true, url: signed.signedUrl });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
