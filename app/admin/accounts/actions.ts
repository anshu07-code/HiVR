"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";
import { anonymousDisplayId } from "@/lib/crypto";

export async function approveAnonymousAction(requestId: string) {
  const adminUser = await getAdminUser();
  if (!adminUser) throw new Error("Not authorised");

  const admin = createAdminClient();

  const { data: reqRow } = await admin
    .from("anonymous_requests")
    .select("id, user_id, requested_tier, status")
    .eq("id", requestId)
    .single() as any;

  if (!reqRow || reqRow.status !== "pending") {
    throw new Error("Request not found or already processed");
  }

  const seqResult = await admin.rpc("nextval", { seq_name: "public.anonymous_display_seq" } as any) as any;
  const seqNum = typeof seqResult === "number" ? seqResult : Math.floor(Math.random() * 90000) + 10000;
  const displayId = anonymousDisplayId(seqNum);

  const { error: insertErr } = await admin
    .from("anonymous_profiles")
    .upsert({
      user_id: reqRow.user_id,
      display_id: displayId,
      display_label: "Top Pro",
      tier: reqRow.requested_tier,
      status: "approved",
      reviewed_by: adminUser.userId,
      reviewed_at: new Date().toISOString(),
    } as any);

  if (insertErr) throw new Error(insertErr.message);

  await admin
    .from("employee_profiles")
    .update({ is_anonymous: true } as any)
    .eq("user_id", reqRow.user_id);

  await admin
    .from("anonymous_requests")
    .update({
      status: "approved",
      reviewed_by: adminUser.userId,
      reviewed_at: new Date().toISOString(),
    } as any)
    .eq("id", requestId);

  revalidatePath("/admin/accounts");
}

export async function rejectAnonymousAction(requestId: string) {
  const adminUser = await getAdminUser();
  if (!adminUser) throw new Error("Not authorised");

  const admin = createAdminClient();

  const { data: reqRow } = await admin
    .from("anonymous_requests")
    .select("id, status")
    .eq("id", requestId)
    .single() as any;

  if (!reqRow || reqRow.status !== "pending") {
    throw new Error("Request not found or already processed");
  }

  await admin
    .from("anonymous_requests")
    .update({
      status: "rejected",
      reviewed_by: adminUser.userId,
      reviewed_at: new Date().toISOString(),
    } as any)
    .eq("id", requestId);

  revalidatePath("/admin/accounts");
}
