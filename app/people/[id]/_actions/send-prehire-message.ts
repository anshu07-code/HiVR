"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function sendPrehireMessage(employeeId: string, content: string) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  if (!content.trim()) return { ok: false, error: "Message cannot be empty" };

  const admin = createAdminClient();

  // Batch: fetch user profile + rate limit check in parallel
  const [profileRes, todayMsgsRes] = await Promise.all([
    admin.from("users").select("current_mode, full_name").eq("id", user.id).maybeSingle(),
    admin.from("direct_messages").select("id").eq("sender_id", user.id).eq("receiver_id", employeeId).gte("created_at", new Date().toISOString().slice(0, 10)),
  ]);

  const profile = profileRes.data as any;
  const isEmployee = profile?.current_mode === "employee" || profile?.current_mode === "both";
  const senderName = profile?.full_name ?? "A buyer";

  // Rate limit: 1 msg/day for non-employees
  if (!isEmployee && (todayMsgsRes.data ?? []).length >= 1) {
    return { ok: false, error: "You can only send one message per day to this person." };
  }

  // Parallel: insert message + create notification
  const [msgResult] = await Promise.all([
    admin.from("direct_messages").insert({ sender_id: user.id, receiver_id: employeeId, body: content.trim() } as any),
    (admin.rpc as any)("create_notification", {
      p_user_id: employeeId, p_type: "new_message",
      p_title: "New message from " + senderName,
      p_body: content.trim().substring(0, 100), p_link: "/dashboard/messages",
    }).then(() => {}),
  ]);

  if (msgResult.error) {
    return { ok: false, error: "Failed to save message: " + msgResult.error.message };
  }

  return { ok: true };
}
