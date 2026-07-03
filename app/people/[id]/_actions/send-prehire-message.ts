"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function sendPrehireMessage(employeeId: string, content: string) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  if (!content.trim()) return { ok: false, error: "Message cannot be empty" };

  const admin = createAdminClient();

  // Rate limit: 1 message per day per receiver for non-employees
  const { data: profile } = await admin
    .from("users")
    .select("current_mode")
    .eq("id", user.id)
    .maybeSingle();
  const isEmployee =
    (profile as any)?.current_mode === "employee" ||
    (profile as any)?.current_mode === "both";
  console.log("[sendPrehireMessage] isEmployee:", isEmployee, "profile:", JSON.stringify(profile));

  if (!isEmployee) {
    const today = new Date().toISOString().slice(0, 10);
    const { data: todayMsgs } = await admin
      .from("direct_messages")
      .select("id, created_at")
      .eq("sender_id", user.id)
      .eq("receiver_id", employeeId)
      .gte("created_at", today);

    if (todayMsgs && todayMsgs.length >= 1) {
      return {
        ok: false,
        error: "You can only send one message per day to this person.",
      };
    }
  }

  try {
    const { data: me } = await admin
      .from("users")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    const senderName = (me as any)?.full_name ?? "A buyer";

    const { error: msgErr } = await admin.from("direct_messages").insert({
      sender_id: user.id,
      receiver_id: employeeId,
      body: content.trim(),
    } as any);

    if (msgErr) {
      return { ok: false, error: "Failed to save message: " + msgErr.message };
    }

    await (admin.rpc as any)("create_notification", {
      p_user_id: employeeId,
      p_type: "new_message",
      p_title: "New message from " + senderName,
      p_body: content.trim().substring(0, 100),
      p_link: "/dashboard/messages",
    });

    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
