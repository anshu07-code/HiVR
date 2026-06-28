"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Switch the current user to a different mode (employee / buyer / both).
 *
 * The user must already have the corresponding role in `users.roles`. If
 * they don't, we redirect them to the appropriate onboarding flow instead
 * of letting them switch into a half-broken dashboard.
 *
 * "both" can only be selected once the user holds BOTH the "employee" and
 * "buyer" roles (employee role comes from completing /onboarding/employee).
 */
export async function switchModeAction(formData: FormData) {
  const target = String(formData.get("target") ?? "") as "employee" | "buyer" | "both";
  if (!["employee", "buyer", "both"].includes(target)) {
    throw new Error("Invalid mode");
  }

  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/dashboard");

  // Re-fetch fresh profile state — the form data may be stale.
  const { data: profile } = await sb
    .from("users")
    .select("roles, current_mode")
    .eq("id", user.id)
    .single();
  const roles: string[] = (profile?.roles as string[]) ?? [];
  const isAdmin = roles.includes("admin");
  const hasEmployee = roles.includes("employee");
  const hasBuyer = roles.includes("buyer");

  // Admins can switch freely between any mode.
  if (!isAdmin) {
    if (target === "employee" && !hasEmployee) {
      redirect("/onboarding/employee?next=/dashboard&reason=switch_to_employee");
    }
    if (target === "buyer" && !hasBuyer) {
      // The buyer role is granted at signup (everyone is a buyer by
      // default), but guard anyway in case the account predates this.
      await sb.from("users").update({ roles: Array.from(new Set([...roles, "buyer"])) }).eq("id", user.id);
    }
    if (target === "both" && (!hasEmployee || !hasBuyer)) {
      // Need the missing role first.
      if (!hasEmployee) {
        redirect("/onboarding/employee?next=/dashboard&reason=switch_to_both");
      }
      if (!hasBuyer) {
        await sb.from("users").update({ roles: Array.from(new Set([...roles, "buyer"])) }).eq("id", user.id);
      }
    }
  }

  // Update the current_mode field. "both" is a UI mode, not a role, so
  // we store the literal string.
  const { error } = await sb
    .from("users")
    .update({ current_mode: target })
    .eq("id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard", "layout");
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
