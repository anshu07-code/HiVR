import { redirect } from "next/navigation";
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink, Users } from "lucide-react";
import { ProfileBuilder } from "./profile-builder";
import { BuyerProfileBuilder } from "./buyer-profile-builder";

export const dynamic = "force-dynamic";
export const metadata = { title: "Build your profile — HiVR" };

export default async function ProfilePage() {
  noStore();
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/dashboard/profile");

  // Pull everything in parallel
  const [
    { data: userRow },
    { data: ep },
    { data: skills },
    { data: categories },
    { data: education },
    { data: experience },
    { data: projects },
    { data: certifications },
    { data: resume },
    { data: resumeParsed },
    { data: socialLinks },
    { data: instantProfile },
    { data: availability },
    { data: standingRates },
    { data: bp },
  ] = await Promise.all([
    sb.from("users").select("id, full_name, email, avatar_url, cover_url, phone, roles, current_mode").eq("id", user.id).maybeSingle(),
    sb.from("employee_profiles").select("*").eq("user_id", user.id).maybeSingle(),
    sb.from("employee_skills").select("id, category_id, is_primary, years_experience, rate_per_hour_paise, rate_per_task_paise, rate_per_day_paise, rate_per_week_paise, category:skill_categories(name, slug, icon, tier)").eq("employee_id", user.id),
    sb.from("skill_categories").select("id, name, slug, icon, tier, parent_category_id, status").eq("status", "active").order("sort_order"),
    sb.from("employee_education").select("*").eq("user_id", user.id).order("sort_order", { ascending: false }),
    sb.from("employee_experience").select("*").eq("user_id", user.id).order("sort_order", { ascending: false }),
    sb.from("employee_projects").select("*").eq("user_id", user.id).order("sort_order", { ascending: false }),
    sb.from("employee_certifications").select("*").eq("user_id", user.id).order("sort_order", { ascending: false }),
    sb.from("employee_resume").select("*").eq("user_id", user.id).maybeSingle(),
    sb.from("resumes").select("id, parsed_skills, parsed_years, parsed_projects, parse_status, parse_error").eq("user_id", user.id).maybeSingle(),
    sb.from("employee_social_links").select("*").eq("user_id", user.id),
    sb.from("employee_instant_profile").select("*").eq("user_id", user.id).maybeSingle(),
    sb.from("employee_availability").select("*").eq("user_id", user.id).maybeSingle(),
    sb.from("employee_standing_rates").select("user_id, category_id, tier, standing_rate, rate_per_hour_paise, rate_per_task_paise, rate_per_day_paise, rate_per_week_paise").eq("user_id", user.id),
    sb.from("buyer_profiles").select("buyer_type, company_name, kyc_completed").eq("user_id", user.id).maybeSingle(),
  ]);

  const roles: string[] = (userRow as any)?.roles ?? [];
  const currentMode = (userRow as any)?.current_mode ?? null;
  const isBuyerMode = currentMode === "buyer" || (!roles.includes("employee") && roles.includes("buyer"));

  // Group categories by parent for the picker
  const parents = (categories ?? []).filter(c => c.parent_category_id === null);
  const childrenByParent: Record<string, any[]> = {};
  for (const c of categories ?? []) {
    if (c.parent_category_id) {
      (childrenByParent[c.parent_category_id] ??= []).push(c);
    }
  }

  // Compute a basic completeness score (server-side, optimistic)
  let completeness = 0;
  if (userRow?.full_name) completeness += 5;
  if (userRow?.avatar_url) completeness += 5;
  if (ep?.headline) completeness += 5;
  if (ep?.bio && (ep.bio as string).length > 20) completeness += 15;
  if (ep?.location) completeness += 5;
  if (ep?.hourly_rate_paise) completeness += 5;
  if ((skills ?? []).length >= 1) completeness += 15;
  if ((skills ?? []).length >= 3) completeness += 5;
  if ((education ?? []).length >= 1) completeness += 10;
  if ((experience ?? []).length >= 1) completeness += 15;
  if ((projects ?? []).length >= 1) completeness += 10;
  if ((certifications ?? []).length >= 1) completeness += 5;
  if ((socialLinks ?? []).length >= 1) completeness += 5;
  completeness = Math.min(100, completeness);

  const avatarUrl = (userRow as any)?.avatar_url ?? null;
  const fullName = (userRow as any)?.full_name ?? "";

  return isBuyerMode ? (
    <div className="container max-w-4xl space-y-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Buyer profile</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your public identity as a buyer. Add a photo and company details so employees know who they&apos;re working with.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to dashboard
            </Link>
          </Button>
        </div>
      </div>
      <BuyerProfileBuilder
        userId={user.id}
        avatarUrl={avatarUrl}
        fullName={fullName}
        email={(userRow as any)?.email ?? ""}
        buyerProfile={bp as any}
      />
    </div>
  ) : (
    <div className="container max-w-4xl space-y-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Build your profile</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Profiles are reviewed by buyers while shortlisting and hiring. Take your time — save anytime, come back later.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/people/${user.id}`}>
              <ExternalLink className="h-3.5 w-3.5" />
              Preview public profile
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to dashboard
            </Link>
          </Button>
        </div>
      </div>

      <ProfileBuilder
        userId={user.id}
        initial={{
          fullName,
          email: (userRow as any)?.email ?? "",
          avatarUrl,
          phone: (userRow as any)?.phone ?? null,
          headline: (ep as any)?.headline ?? "",
          bio: (ep as any)?.bio ?? "",
          location: (ep as any)?.location ?? "",
          experienceType: (ep as any)?.experience_type ?? "fresher",
          hourlyRatePaise: (ep as any)?.hourly_rate_paise ?? null,
          availabilityHours: (ep as any)?.availability_hours ?? null,
          timezone: (ep as any)?.timezone ?? "Asia/Kolkata",
          skills: (skills ?? []).map((s: any) => ({ category_id: s.category_id, name: s.category?.name, slug: s.category?.slug, icon: s.category?.icon, tier: s.category?.tier, is_primary: s.is_primary, years_experience: s.years_experience, rate_per_hour_paise: s.rate_per_hour_paise, rate_per_task_paise: s.rate_per_task_paise, rate_per_day_paise: s.rate_per_day_paise, rate_per_week_paise: s.rate_per_week_paise })),
          education: (education ?? []) as any[],
          experience: (experience ?? []) as any[],
          projects: (projects ?? []) as any[],
          certifications: (certifications ?? []) as any[],
          resume: resume as any,
          resumeParsed: resumeParsed as any,
          socialLinks: (socialLinks ?? []) as any[],
          // Instant Hire section
          avgRating: (ep as any)?.avg_rating ?? 0,
          totalReviews: (ep as any)?.total_reviews ?? 0,
          completionRate: (ep as any)?.completion_rate ?? 0,
          trustTier: (ep as any)?.overall_trust_tier ?? "provisional",
          instantProfile: instantProfile as any,
          availability: availability as any,
          standingRates: (standingRates ?? []) as any[],
        }}
        categories={parents as any[]}
        childrenByParent={childrenByParent}
        initialCompleteness={completeness}
      />
    </div>
  );
}
