import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PostJobForm } from "./post-job-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR } from "@/lib/utils";

export const metadata = { title: "HiVR Business — Post a job" };
export const dynamic = "force-dynamic";

export default async function NewBusinessJobPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/business/jobs/new");

  const { data: bp } = await sb.from("business_profiles")
    .select("id, legal_name, brand_name, kyc_status, is_suspended, total_spend_paise")
    .eq("owner_user_id", user.id).maybeSingle();
  if (!bp) redirect("/onboarding/business");

  if (bp.is_suspended) {
    return (
      <div className="container max-w-3xl py-12">
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>Your business is suspended</CardTitle>
            <CardDescription>You cannot post jobs while suspended. Contact support to appeal.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Plan limits
  const { data: sub } = await sb.from("business_subscriptions")
    .select("plan_key, status, active_jobs_count").eq("business_id", bp.id)
    .in("status", ["active", "trialing"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const planKey = (sub as any)?.plan_key ?? "business_free";
  const activeJobs = (sub as any)?.active_jobs_count ?? 0;
  const planLimits: Record<string, number> = { business_free: 1, business_pro: 10, business_enterprise: -1 };
  const limit = planLimits[planKey];
  const overLimit = limit > 0 && activeJobs >= limit;

  // Categories for the dropdown
  const { data: parents } = await sb.from("skill_categories")
    .select("id, name, slug, is_active, skill_categories!parent_id (id, name, slug, is_active)")
    .is("parent_id", null).order("display_order", { ascending: true });

  // Filter to active parents and their active subcategories
  const categories = (parents as any[] ?? [])
    .filter(p => p.is_active)
    .map(p => ({
      id: p.id, name: p.name,
      sub: (p.skill_categories as any[] ?? []).filter(s => s.is_active).map(s => ({ id: s.id, name: s.name })),
    }));

  return (
    <div className="container max-w-3xl space-y-4 py-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Post a job</h1>
        <p className="text-sm text-muted-foreground">
          HiVR will hold your advance in escrow. The first 1% platform fee is deducted on contract sign.
        </p>
      </header>

      {overLimit && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader>
            <CardTitle>Plan limit reached</CardTitle>
            <CardDescription>
              You're on the Free plan and have reached the {limit}-active-jobs limit. Upgrade to Pro for 10 active jobs.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Job details</CardTitle>
          <CardDescription>Once posted, your job will be visible to all matching employees in the Browse feed.</CardDescription>
        </CardHeader>
        <CardContent>
          <PostJobForm
            businessId={bp.id}
            categories={categories}
            disabled={overLimit}
          />
        </CardContent>
      </Card>
    </div>
  );
}
