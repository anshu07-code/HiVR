import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/notifications/test
 *
 * Diagnostic endpoint: reads the current user's notifications and
 * returns them along with the unread count, so we can confirm the
 * bell's data path works.
 *
 * Also tests that:
 *   1. RLS lets us read our own notifications
 *   2. The unread_notification_count RPC is callable
 *   3. (Optional) we can insert a test notification via the
 *      create_notification RPC
 */

export async function GET(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

  // 1. Try to list notifications via the user client (RLS)
  const { data: list, error: listErr } = await sb
    .from("notifications")
    .select("id, type, title, body, link, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(15);

  // 2. Try the RPC
  const { data: count, error: countErr } = await (sb.rpc as any)("unread_notification_count", { p_user_id: user.id });

  // 3. Try the insert RPC (admin client, bypasses RLS)
  const admin = createAdminClient();
  let insertResult: any = null;
  if (req.nextUrl.searchParams.get("insert") === "1") {
    const { data, error } = await (admin.rpc as any)("create_notification", {
      p_user_id: user.id,
      p_type: "admin_message",
      p_title: "Test notification",
      p_body: "If you can see this in the bell, the realtime pipe is wired correctly.",
      p_link: "/dashboard",
    });
    insertResult = { ok: !error, error: error?.message ?? null, returned: data };
  }

  return NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email },
    list: {
      ok: !listErr,
      error: listErr?.message ?? null,
      count: list?.length ?? 0,
      sample: (list ?? []).slice(0, 3),
    },
    unreadCount: {
      ok: !countErr,
      error: countErr?.message ?? null,
      value: count,
    },
    insert: insertResult,
  });
}
