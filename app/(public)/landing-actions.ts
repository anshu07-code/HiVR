"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function toggleRoleAction(formData: FormData) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin");

  const next = formData.get("next") ? String(formData.get("next")) : "/";

  const { data: profile } = await sb
    .from("users")
    .select("roles, current_mode")
    .eq("id", user.id)
    .single();
  const roles: string[] = (profile?.roles as string[]) ?? [];
  const currentMode = profile?.current_mode;
  const hasEmployee = roles.includes("employee");
  const hasBuyer = roles.includes("buyer");
  const isAdmin = roles.includes("admin");

  if (isAdmin) {
    await sb.from("users").update({ current_mode: currentMode === "employee" ? "buyer" : "employee" }).eq("id", user.id);
    revalidatePath("/", "layout");
    redirect(next);
  }

  if (!hasEmployee) {
    redirect(`/onboarding/employee?next=${encodeURIComponent(next)}&reason=switch_to_employee`);
  }

  if (currentMode === "employee" && hasBuyer) {
    await sb.from("users").update({ current_mode: "buyer" }).eq("id", user.id);
  } else if (hasEmployee) {
    await sb.from("users").update({ current_mode: "employee" }).eq("id", user.id);
  } else if (!hasBuyer) {
    await sb.from("users").update({ roles: Array.from(new Set([...roles, "buyer"])), current_mode: "buyer" }).eq("id", user.id);
  }

  revalidatePath("/", "layout");
  redirect(next);
}
