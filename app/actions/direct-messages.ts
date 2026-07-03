"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export async function sendDirectMessage(receiverId: string, body: string) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  if (!body.trim()) return { ok: false, error: "Message cannot be empty" };

  const admin = createAdminClient();

  // Debug: check profile
  const { data: profile, error: profileErr } = await admin
    .from("users")
    .select("current_mode")
    .eq("id", user.id)
    .maybeSingle();
  console.log("[sendDirectMessage] profile:", JSON.stringify(profile), "err:", profileErr?.message);

  const isEmployee =
    (profile as any)?.current_mode === "employee" ||
    (profile as any)?.current_mode === "both";
  console.log("[sendDirectMessage] isEmployee:", isEmployee, "current_mode:", (profile as any)?.current_mode);

  if (!isEmployee) {
    const today = new Date().toISOString().slice(0, 10);
    console.log("[sendDirectMessage] checking msgs from today:", today);

    const { data: todayMsgs, error: countErr } = await admin
      .from("direct_messages")
      .select("id, created_at")
      .eq("sender_id", user.id)
      .eq("receiver_id", receiverId)
      .gte("created_at", today);

    console.log("[sendDirectMessage] todayMsgs count:", todayMsgs?.length, "data:", JSON.stringify(todayMsgs), "err:", countErr?.message);

    if (todayMsgs && todayMsgs.length >= 1) {
      console.log("[sendDirectMessage] BLOCKED — rate limit hit");
      return {
        ok: false,
        error: "You can only send one message per day to this person.",
      };
    }
    console.log("[sendDirectMessage] rate limit check passed");
  }

  const { error } = await admin.from("direct_messages").insert({
    sender_id: user.id,
    receiver_id: receiverId,
    body: body.trim(),
  } as any);

  if (error) {
    console.log("[sendDirectMessage] insert error:", error.message);
    return { ok: false, error: error.message };
  }
  console.log("[sendDirectMessage] insert ok");

  // Notify the receiver
  const { data: me } = await admin
    .from("users")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  const senderName = (me as any)?.full_name ?? "Someone";

  const notifErr = await (admin.rpc as any)("create_notification", {
    p_user_id: receiverId,
    p_type: "new_message",
    p_title: `New message from ${senderName}`,
    p_body: body.trim().substring(0, 100),
    p_link: "/dashboard/messages",
  });
  console.log("[sendDirectMessage] notification sent:", notifErr?.error?.message ?? "ok");

  revalidatePath("/dashboard/messages");
  return { ok: true };
}
