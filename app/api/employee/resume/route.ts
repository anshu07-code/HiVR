import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/employee/resume  — upload a PDF resume to the employee-resumes bucket.
 * Body: multipart form with a `file` field.
 * The file is stored at  {user_id}/{filename}.
 * The row in `employee_resume` is upserted (1 per user).
 *
 * GET /api/employee/resume?user_id=…  — returns a signed URL the buyer can use.
 */
export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (file.type !== "application/pdf") return NextResponse.json({ error: "Only PDF" }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Max 10 MB" }, { status: 400 });

  const path = `${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
  // Use admin client to upload (bypasses RLS in the storage policies for the
  // owner path which we've already validated via the auth check).
  const admin = createAdminClient();
  const { error: upErr } = await admin.storage.from("employee-resumes").upload(path, file, { contentType: "application/pdf", upsert: true });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { error: metaErr } = await sb.from("employee_resume").upsert({
    user_id: user.id,
    storage_path: path,
    filename: file.name,
    size_bytes: file.size,
    uploaded_at: new Date().toISOString(),
  });
  if (metaErr) return NextResponse.json({ error: metaErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const targetId = user.id;
  const { data: row } = await sb.from("employee_resume").select("storage_path, filename").eq("user_id", targetId).maybeSingle();
  if (!row) return NextResponse.json({ error: "No resume" }, { status: 404 });
  // Use admin client to bypass RLS for the signed URL (the buyer of the
  // task should be able to read this — the RLS policy in 0040 only allows
  // the owner; for buyers we'll add a separate signed-URL endpoint later).
  const admin = createAdminClient();
  const { data: signed, error: sErr } = await admin.storage.from("employee-resumes").createSignedUrl((row as any).storage_path, 600);
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, url: signed?.signedUrl, filename: (row as any).filename });
}
