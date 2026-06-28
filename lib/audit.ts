/**
 * lib/audit.ts
 *
 * Append-only audit log helpers for wallet and password-change operations.
 * Always uses the Supabase admin client (service_role) to bypass RLS when
 * writing (we want the audit log to be trustworthy). The tables themselves
 * have RLS policies that only permit INSERT and SELECT — never UPDATE or DELETE.
 *
 * Callers pass the user_id, action name, and optional metadata/IP.
 * The helper adds the timestamp server-side.
 */
import { createAdminClient } from "@/lib/supabase/admin";

type AuditTable = "wallet_audit_log" | "change_password_audit";

/**
 * Write an entry to an append-only audit table.
 * Returns the inserted row id, or null if the write failed.
 */
export async function writeAuditLog(
  table: AuditTable,
  params: {
    userId: string;
    action: string;
    metadata?: Record<string, unknown>;
    ipAddress?: string | null;
  },
): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from(table)
    .insert({
      user_id: params.userId,
      action: params.action,
      metadata: params.metadata ?? {},
      ip_address: params.ipAddress ?? null,
    } as any)
    .select("id")
    .single();

  if (error) {
    console.error(`[audit] Failed to write ${table} entry:`, error.message);
    return null;
  }
  return (data as any)?.id ?? null;
}

/**
 * Convenience: write a wallet audit log entry.
 */
export async function writeWalletAudit(
  userId: string,
  action: string,
  meta?: Record<string, unknown>,
  ip?: string | null,
): Promise<string | null> {
  return writeAuditLog("wallet_audit_log", {
    userId,
    action,
    metadata: meta,
    ipAddress: ip,
  });
}

/**
 * Convenience: write a change-password audit log entry.
 */
export async function writeChangePasswordAudit(
  userId: string,
  action: string,
  meta?: Record<string, unknown>,
  ip?: string | null,
): Promise<string | null> {
  return writeAuditLog("change_password_audit", {
    userId,
    action,
    metadata: meta,
    ipAddress: ip,
  });
}

/**
 * Read recent audit entries for a user (for the "recent activity" display).
 * Admins can read any user's audit log; users can only see their own
 * (RLS handles this constraint at the DB level).
 */
export async function readAuditLog(
  table: AuditTable,
  userId: string,
  limit = 20,
): Promise<Array<Record<string, unknown>>> {
  const admin = createAdminClient();
  const { data } = await admin
    .from(table)
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false } as any)
    .limit(limit) as any;

  return data ?? [];
}
