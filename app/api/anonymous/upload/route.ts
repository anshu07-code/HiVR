import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SecurityError, enforceRateLimit } from "@/lib/security";
import { secureRandomId } from "@/lib/security";

const ALLOWED_TYPES = ["resume", "portfolio", "certificate", "reference", "id_proof", "other"];

export async function POST(req: NextRequest) {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

    enforceRateLimit(`anonymous_upload:${user.id}`, { max: 10, windowMs: 60_000 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const documentType = (formData.get("document_type") as string ?? "other").toLowerCase();

    if (!file) return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });
    if (!ALLOWED_TYPES.includes(documentType)) {
      return NextResponse.json({ ok: false, error: "Invalid document type" }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ ok: false, error: "File too large (max 10MB)" }, { status: 400 });
    }

    const allowedMime = ["application/pdf", "image/jpeg", "image/png", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"];
    if (!allowedMime.includes(file.type)) {
      return NextResponse.json({ ok: false, error: "File type not allowed. Accepted: PDF, JPG, PNG, DOC, DOCX, TXT" }, { status: 400 });
    }

    const admin = createAdminClient();
    const fileId = secureRandomId();
    const ext = file.name.split(".").pop() ?? "pdf";
    const storagePath = `${user.id}/${fileId}.${ext}`;

    const bytes = await file.arrayBuffer();
    const { error: uploadError } = await admin.storage
      .from("anonymous-vault")
      .upload(storagePath, new Uint8Array(bytes), {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ ok: false, error: `Upload failed: ${uploadError.message}` }, { status: 500 });
    }

    const { error: dbError } = await admin
      .from("anonymous_documents")
      .insert({
        user_id: user.id,
        filename: file.name,
        storage_path: storagePath,
        file_size: file.size,
        mime_type: file.type,
        document_type: documentType,
        verification_status: "pending",
      } as any);

    if (dbError) {
      await admin.storage.from("anonymous-vault").remove([storagePath]);
      return NextResponse.json({ ok: false, error: `Database error: ${dbError.message}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true, fileId, filename: file.name });
  } catch (e) {
    if (e instanceof SecurityError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
