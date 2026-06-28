"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ALLOWED = new Set(["terms", "privacy", "grievance"]);

export async function updateLegalPage(formData: FormData) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: "Not signed in" };
  const { data: adminRow } = await sb.from("admin_users").select("admin_role").eq("user_id", user.id).maybeSingle();
  if (!adminRow) return { error: "Admin only" };

  const slug = String(formData.get("slug") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content_md") ?? "").trim();
  if (!ALLOWED.has(slug)) return { error: "Invalid slug" };
  if (!title || !content) return { error: "Title and content required" };

  const admin = createAdminClient();
  const { error } = await admin.from("legal_pages").update({
    title,
    content_md: content,
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  }).eq("slug", slug);
  if (error) return { error: error.message };

  await admin.from("admin_audit_log").insert({
    actor_id: user.id, action: "legal_page_update", target_table: "legal_pages", target_id: slug,
  });
  revalidatePath(`/legal/${slug}`);
  revalidatePath("/admin/legal");
  return { ok: true };
}
