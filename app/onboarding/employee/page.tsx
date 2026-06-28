import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmployeeOnboarding } from "./onboarding-wizard";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Become an employee — HiVR" };
export const dynamic = "force-dynamic";

/**
 * Thin shell. We pull what we need to render the wizard, then defer
 * the actual identity verification to /onboarding/verify (a free,
 * in-app flow that replaces the old DigiLocker-based step).
 */
export default async function OnboardingPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/onboarding/employee");

  const [{ data: ep }, { data: skills }, { data: categories }, { data: userRow }, { data: vs }] = await Promise.all([
    sb.from("employee_profiles").select("*").eq("user_id", user.id).maybeSingle(),
    sb.from("employee_skills").select("*, category:skill_categories(name, slug, icon, tier)").eq("employee_id", user.id),
    sb.from("skill_categories").select("id, slug, name, icon, tier, status").eq("status", "active").order("sort_order"),
    sb.from("users").select("roles, current_mode").eq("id", user.id).maybeSingle(),
    sb.from("verifications").select("id, status").eq("user_id", user.id),
  ]);

  const roles: string[] = (userRow?.roles as string[]) ?? [];
  const isAdmin = roles.includes("admin");
  const alreadyEmployee = isAdmin || roles.includes("employee");
  const hasProfile = !!ep;
  const hasVerifiedId = (vs ?? []).some((v: any) => v.status === "verified");

  if (!alreadyEmployee && (hasProfile || hasVerifiedId)) {
    const nextRoles = Array.from(new Set([...roles, "employee"]));
    const nextMode = (userRow?.current_mode === "buyer" || !userRow?.current_mode) ? "employee" : userRow?.current_mode;
    await sb.from("users").update({ roles: nextRoles, current_mode: nextMode ?? "employee" }).eq("id", user.id);
  } else if (alreadyEmployee && userRow?.current_mode === "buyer") {
    await sb.from("users").update({ current_mode: "employee" }).eq("id", user.id);
  }

  return (
    <div className="container max-w-3xl py-8">
      <Card>
        <CardContent className="p-6">
          <EmployeeOnboarding
            profile={ep}
            skills={skills ?? []}
            categories={categories ?? []}
          />
        </CardContent>
      </Card>
    </div>
  );
}
