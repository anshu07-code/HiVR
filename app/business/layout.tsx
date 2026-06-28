import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BusinessSidebar } from "@/components/business/sidebar";
import { MobileBottomTabs } from "@/components/layout/mobile-bottom-tabs";
import { AssistantLauncher } from "@/components/assistant/launcher";

export default async function BusinessLayout({ children }: { children: React.ReactNode }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/business");

  // Confirm the user has the business role
  const { data: u } = await sb
    .from("users")
    .select("roles, business_onboarding_step, is_suspended")
    .eq("id", user.id)
    .maybeSingle();
  const roles: string[] = (u?.roles as string[]) ?? [];
  if (!roles.includes("business") && !roles.includes("admin")) {
    redirect("/dashboard?error=business_role_required");
  }

  // If the user hasn't completed business onboarding, send them to it
  // (admins are exempted)
  if (!roles.includes("admin") && u?.business_onboarding_step !== "done") {
    redirect("/onboarding/business");
  }

  // Pull the business profile for the sidebar
  const { data: bp } = await sb
    .from("business_profiles")
    .select("id, legal_name, brand_name, is_suspended")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  // Pull the current subscription for the plan badge
  const { data: sub } = await sb
    .from("business_subscriptions")
    .select("plan_key, status")
    .eq("business_id", bp?.id ?? "_")
    .in("status", ["active", "trialing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div className="flex min-h-screen bg-background">
      <BusinessSidebar
        businessId={bp?.id}
        businessName={bp?.brand_name || bp?.legal_name || "Your business"}
        planKey={(sub as any)?.plan_key ?? "business_free"}
        isSuspended={!!(bp as any)?.is_suspended}
      />
      <main className="flex-1 min-w-0 pb-20 md:pb-0">
        {children}
      </main>
      <MobileBottomTabs />
      <AssistantLauncher />
    </div>
  );
}
