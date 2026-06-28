/**
 * Server-only notification helpers.
 *
 * This file uses next/headers (via the Supabase server client), so
 * it must NOT be imported from a client component. Client
 * components should import types/icons from
 * `lib/notifications/types.ts` instead.
 */
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { NotificationKind } from "./types";

// Re-export the client-safe bits so any callers importing from
// "helpers" still work, but they can only use the types / maps at
// runtime if their bundler treats them as erased types.
export { KIND_ICON, KIND_TONE } from "./types";
export type { NotificationKind } from "./types";

type NotifyArgs = {
  /** Primary user to notify (e.g. the employee) */
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  /** Where the bell's "open" handler navigates to */
  link?: string;
  /** Group key for de-duplication (e.g. `workspace:<id>:funded`) */
  dedupeKey?: string;
};

const DEDUPE_WINDOW_MS = 30_000; // 30s

export async function notify(args: NotifyArgs): Promise<{ ok: boolean; skipped?: boolean }> {
  const sb = createServerClient();
  const admin = createAdminClient();
  if (args.dedupeKey) {
    const cutoff = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString();
    const { data: recent } = await admin
      .from("notifications")
      .select("id")
      .eq("user_id", args.userId)
      .eq("type", args.kind)
      .gte("created_at", cutoff)
      .limit(1);
    if (recent && recent.length > 0) {
      return { ok: true, skipped: true };
    }
  }
  const { error } = await (sb.rpc as any)("create_notification", {
    p_user_id: args.userId,
    p_type: args.kind,
    p_title: args.title,
    p_body: args.body ?? null,
    p_link: args.link ?? null,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[notify] failed:", error, args);
    return { ok: false };
  }
  return { ok: true };
}

/** Notify both parties of a contract */
export async function notifyContractParties(
  contractId: string,
  args: Omit<NotifyArgs, "userId" | "dedupeKey">,
): Promise<{ ok: boolean }> {
  const admin = createAdminClient();
  const { data: c } = await (admin.from("contracts") as any)
    .select("buyer_id, employee_id")
    .eq("id", contractId)
    .maybeSingle();
  if (!c) return { ok: false };
  const ids = [c.buyer_id, c.employee_id].filter(Boolean) as string[];
  let allOk = true;
  for (const userId of ids) {
    const r = await notify({ ...args, userId, dedupeKey: `contract:${contractId}:${args.kind}` });
    if (!r.ok) allOk = false;
  }
  return { ok: allOk };
}

/** Notify both parties of a workspace */
export async function notifyWorkspaceParties(
  workspaceId: string,
  args: Omit<NotifyArgs, "userId" | "dedupeKey">,
): Promise<{ ok: boolean }> {
  const admin = createAdminClient();
  const { data: w } = await (admin.from("workspaces") as any)
    .select("buyer_id, employee_id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (!w) return { ok: false };
  const ids = [w.buyer_id, w.employee_id].filter(Boolean) as string[];
  let allOk = true;
  for (const userId of ids) {
    const r = await notify({ ...args, userId, dedupeKey: `workspace:${workspaceId}:${args.kind}` });
    if (!r.ok) allOk = false;
  }
  return { ok: allOk };
}
