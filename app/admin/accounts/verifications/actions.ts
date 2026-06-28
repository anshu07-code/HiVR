"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";

export async function verifyItemAction(table: string, itemId: string, action: string) {
  const adminUser = await getAdminUser();
  if (!adminUser) throw new Error("Not authorised");

  const admin = createAdminClient();

  const { error } = await admin
    .from(table as any)
    .update({
      verification_status: action === "verify" ? "verified" : "rejected",
      verified_by: adminUser.userId,
      verified_at: new Date().toISOString(),
    } as any)
    .eq("id", itemId);

  if (error) throw new Error(error.message);
  revalidatePath("/admin/accounts/verifications");
}
