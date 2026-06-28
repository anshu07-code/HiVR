import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NotificationsCenter } from "@/components/notifications/notifications-center";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/dashboard/notifications");

  const { data: notifs } = await sb
    .from("notifications")
    .select("id, type, title, body, link, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <NotificationsCenter
      userId={user.id}
      initial={(notifs ?? []) as any[]}
    />
  );
}
