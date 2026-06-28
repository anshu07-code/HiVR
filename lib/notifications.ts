// Helper: drop a notification from server code (used in actions across the app).
// Calls the SECURITY DEFINER create_notification() function so it works from
// any user context (admin, employee, buyer).

import { createClient } from "@/lib/supabase/server";

export type NotificationType =
  | "interview_slot_created"
  | "interview_booked"
  | "interview_completed"
  | "interview_passed"
  | "interview_failed"
  | "contract_delivered"
  | "contract_completed"
  | "review_received"
  | "dispute_opened"
  | "dispute_resolved"
  | "points_earned"
  | "tier_promoted"
  | "category_launched"
  | "system";

export async function notify(opts: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
}) {
  try {
    const sb = createClient();
    await sb.rpc("create_notification", {
      p_user_id: opts.userId,
      p_type: opts.type,
      p_title: opts.title,
      p_body: opts.body,
      p_link: opts.link ?? null,
    });
  } catch (e) {
    // Don't let a failed notification break the action that triggered it.
    console.error("notify() failed:", e);
  }
}
