import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BusinessOnboarding } from "./business-onboarding-wizard";

export const metadata = { title: "HiVR Business — onboarding" };
export const dynamic = "force-dynamic";

export default async function BusinessOnboardingPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/onboarding/business");

  // Confirm the user has the business role. If not, bounce them.
  const { data: userRow } = await sb
    .from("users")
    .select("roles, full_name, business_onboarding_step, phone_verified, email")
    .eq("id", user.id)
    .maybeSingle();
  const roles: string[] = (userRow?.roles as string[]) ?? [];
  if (!roles.includes("business") && !roles.includes("admin")) {
    redirect("/dashboard?error=business_role_required");
  }

  // Pull the existing business profile (created in trigger or upserted here).
  const { data: bp } = await sb
    .from("business_profiles")
    .select("*")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  return (
    <div className="container max-w-3xl py-8">
      <BusinessOnboarding
        initial={bp}
        phoneConfirmed={!!userRow?.phone_verified}
        email={userRow?.email ?? user.email ?? ""}
        currentStep={userRow?.business_onboarding_step as any}
      />
    </div>
  );
}
