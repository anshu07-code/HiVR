/**
 * lib/admin-auth.ts
 *
 * Shared admin authentication helpers for all /admin/* server pages
 * and route handlers. Every admin page should call `requireAdmin` at
 * the top of its server component to redirect non-admins to a friendly
 * "not authorised" screen (and avoid running 15+ expensive aggregate
 * queries for users who can't see the data anyway).
 *
 * Three role tiers, mirroring admin_users.admin_role:
 *   - super_admin, trust_safety_admin: can read everything
 *   - tech_executive: tech + system health (no financial data)
 *   - contact_admin: contact / support / chat moderation
 *   - finance_admin, support_admin, content_admin: subset pages
 *   - monitor_viewer: read-only across all
 *
 * The set of allowed roles is permissive by design (any admin role
 * can read any admin page). Tightening per-page role lists is a
 * follow-up — the goal of this helper is to keep the security
 * boundary (must be an admin) consistent and avoid the existing
 * "no check at all" pages.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AdminRole =
  | "super_admin"
  | "trust_safety_admin"
  | "tech_executive"
  | "contact_admin"
  | "finance_admin"
  | "support_admin"
  | "content_admin"
  | "monitor_viewer";

export type AdminUser = {
  userId: string;
  role: AdminRole;
};

/**
 * Returns the admin user record if the signed-in user is in admin_users.
 * Returns null if not signed in or not an admin (so the caller can render
 * its own not-authorised screen if it wants to). To redirect non-admins
 * to the home page, use `requireAdmin`.
 */
export async function getAdminUser(): Promise<AdminUser | null> {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: adminRow } = await sb
    .from("admin_users")
    .select("admin_role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!adminRow) return null;
  return { userId: user.id, role: (adminRow as any).admin_role as AdminRole };
}

/**
 * For server components: if the user is not an admin, render a
 * friendly "not authorised" screen. Returns the admin user record
 * otherwise.
 *
 * Usage:
 *   const admin = await requireAdmin();
 *   // admin is now non-null; safe to query admin tables
 */
export async function requireAdmin(): Promise<AdminUser> {
  const admin = await getAdminUser();
  if (!admin) {
    // We redirect rather than throw because the page is a React server
    // component — throwing would surface a 500. Redirect to a sign-in
    // page if not signed in, or a not-authorised page if signed in.
    redirect("/auth/signin?next=/admin");
  }
  return admin;
}

/**
 * Same as requireAdmin but allows the caller to render a custom
 * "not authorised" component instead of redirecting. Useful for
 * pages that want to show "HiVR admin team only" messaging.
 */
export async function getAdminUserOrNull(): Promise<AdminUser | null> {
  return getAdminUser();
}
