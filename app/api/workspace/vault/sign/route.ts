import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const vaultId = String(body.vaultId ?? "");
  if (!vaultId) return NextResponse.json({ ok: false, error: "vaultId required" }, { status: 400 });

  const { data, error } = await sb.rpc("issue_vault_signed_url" as any, {
    p_vault_id: vaultId,
    p_expires_in: 60,
  } as any);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const result = data as any;
  if (!result || result.ok === false) return NextResponse.json({ ok: false, error: result?.error ?? "Failed" }, { status: 400 });

  const storageObjectId = String(result.storage_object_id ?? "");
  if (!storageObjectId) return NextResponse.json({ ok: false, error: "No storage object" }, { status: 400 });

  try {
    const admin = createAdminClient();
    const { data: signed, error: signErr } = await admin.storage
      .from("workspace-vault")
      .createSignedUrl(storageObjectId, 60);
    if (signErr) return NextResponse.json({ ok: false, error: signErr.message }, { status: 500 });
    if (!signed?.signedUrl) return NextResponse.json({ ok: false, error: "Failed to sign URL" }, { status: 500 });

    // Look up the item to log the event with workspace_id and name
    const { data: item } = await admin
      .from("workspace_vault")
      .select("workspace_id, name, file_size")
      .eq("id", vaultId)
      .maybeSingle();

    // Log the download event for the activity timeline
    await admin.from("vault_event_log").insert({
      workspace_id: (item as any)?.workspace_id ?? null,
      vault_item_id: vaultId,
      actor_id: user.id,
      actor_name: null,
      event: "download",
      file_name: (item as any)?.name ?? null,
      file_size: (item as any)?.file_size ?? null,
      metadata: { storage_object_id: storageObjectId },
    } as any);

    return NextResponse.json({ ok: true, url: signed.signedUrl, expiresIn: 60 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Sign failed" }, { status: 500 });
  }
}
