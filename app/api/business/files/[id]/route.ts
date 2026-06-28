import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: bp } = await sb.from("business_profiles").select("id").eq("owner_user_id", user.id).maybeSingle();
  if (!bp) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  // Pull the file + verify ownership
  const { data: file } = await sb.from("business_files")
    .select("id, storage_path, storage_bucket, business_id, uploaded_by")
    .eq("id", params.id).maybeSingle();
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if ((file as any).business_id !== bp.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Only the owner or the original uploader can delete (defence in depth).
  if ((file as any).uploaded_by !== user.id) {
    return NextResponse.json({ error: "Only the uploader can delete this file." }, { status: 403 });
  }

  // Delete from storage first
  const { error: storageErr } = await sb.storage.from((file as any).storage_bucket).remove([(file as any).storage_path]);
  if (storageErr) {
    return NextResponse.json({ error: `Storage delete failed: ${storageErr.message}` }, { status: 500 });
  }

  // Then delete the metadata row
  const { error: dbErr } = await sb.from("business_files").delete().eq("id", params.id);
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
