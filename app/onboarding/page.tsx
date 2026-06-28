import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Get started — HiVR" };

/**
 * /onboarding — main entry. Detects the user's verification status
 * and forwards to the right place:
 *   * Not signed in   → /auth/signin
 *   * Not verified    → /onboarding/verify
 *   * Verified        → /dashboard
 *
 * We use a "verified" heuristic = the user has at least one
 * `verifications` row with status='verified' OR the user has a `dob`
 * set on `public.users` AND the most recent verification session is
 * approved/auto-approved.
 */
export default async function OnboardingIndexPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/onboarding");

  const { data: vs } = await sb
    .from("verifications")
    .select("status")
    .eq("user_id", user.id)
    .eq("status", "verified")
    .limit(1);

  const hasVerified = (vs ?? []).length > 0;

  if (hasVerified) {
    redirect("/dashboard?welcome=1");
  } else {
    redirect("/onboarding/verify");
  }
}
