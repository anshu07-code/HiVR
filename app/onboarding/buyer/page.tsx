import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BuyerOnboarding } from "./buyer-onboarding-wizard";

export const metadata = { title: "Buyer onboarding — HiVR" };
export const dynamic = "force-dynamic";

/**
 * Thin shell around the buyer onboarding wizard. We collect the
 * business profile bits (individual/business, GSTIN), then route
 * to /onboarding/verify for the identity check.
 */
export default async function BuyerOnboardingPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/onboarding/buyer");

  const { data: userRow } = await sb
    .from("users")
    .select("roles")
    .eq("id", user.id)
    .maybeSingle();
  const roles: string[] = (userRow?.roles as string[]) ?? [];
  if (!roles.includes("buyer") && !roles.includes("admin")) {
    if (roles.includes("employee")) redirect("/onboarding/employee");
    redirect("/dashboard?error=buyer_role_required");
  }

  // Auto-create buyer_profiles row if missing
  const { data: existingBp } = await sb
    .from("buyer_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!existingBp) {
    await sb.from("buyer_profiles").insert({ user_id: user.id, buyer_type: "individual" });
  }
  const bp = existingBp ?? (await sb.from("buyer_profiles").select("*").eq("user_id", user.id).maybeSingle()).data;

  // If the user already has a verified identity doc, skip them straight
  // to the dashboard.
  const { data: vs } = await sb
    .from("verifications")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "verified")
    .limit(1);
  if ((vs ?? []).length > 0) redirect("/dashboard?welcome=1");

  return (
    <div className="container max-w-3xl py-8">
      <BuyerOnboarding
        profile={bp}
        userEmail={user.email ?? ""}
      />
    </div>
  );
}
