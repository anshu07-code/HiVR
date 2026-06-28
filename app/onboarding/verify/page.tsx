import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { VerifyWizard } from "./verify-wizard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verify your identity — HiVR" };

/**
 * Server component shell. The actual wizard is a client island.
 *
 * The user must be signed in. We pull their name / email / dob from
 * `users` so the wizard can pre-populate the signup name for the
 * OCR name match.
 */
export default async function VerifyPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/onboarding/verify");

  const { data: u } = await sb.from("users").select("full_name, email").eq("id", user.id).maybeSingle();
  const fullName = (u as any)?.full_name ?? (user.email?.split("@")[0] ?? "there");
  const email = (u as any)?.email ?? user.email ?? "";

  return (
    <div className="container max-w-3xl py-8">
      <Card>
        <CardContent className="p-6">
          <VerifyWizard userFullName={fullName} userEmail={email} />
        </CardContent>
      </Card>
    </div>
  );
}
