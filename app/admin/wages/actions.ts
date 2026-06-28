"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function updateWageBand(formData: FormData) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: "Not signed in" };
  const { data: adminRow } = await sb.from("admin_users").select("admin_role").eq("user_id", user.id).maybeSingle();
  if (!adminRow) return { error: "Admin only" };

  const categoryId = String(formData.get("category_id") ?? "");
  const minRupees = Number(formData.get("min_rupees") ?? 0);
  const maxRupees = Number(formData.get("max_rupees") ?? 0);
  if (!categoryId) return { error: "category_id required" };
  if (minRupees < 0 || maxRupees < minRupees) return { error: "Invalid range" };

  const admin = createAdminClient();
  const { error } = await admin.from("skill_categories")
    .update({ wage_band_min_paise: minRupees * 100, wage_band_max_paise: maxRupees * 100 })
    .eq("id", categoryId);
  if (error) return { error: error.message };

  await admin.from("admin_audit_log").insert({
    actor_id: user.id,
    action: "wage_band_update",
    target_table: "skill_categories",
    target_id: categoryId,
    metadata: { min_rupees: minRupees, max_rupees: maxRupees },
  });

  revalidatePath("/admin/wages");
  revalidatePath("/categories");
  revalidatePath("/browse");
  return { ok: true };
}
