import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth-context";
import { InstantHireLanding, type IHCategory, type IHCandidate, type IHTopPro } from "@/components/instant-hire/instant-hire-landing";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Instant Hire — HiVR" };

export default async function InstantHirePage() {
  noStore();
  const sb = createClient();

  const ctx = await getCurrentUserContext();
  const signedIn = !!ctx.user;
  const profile = ctx.profile as any;
  const isBuyer = signedIn && profile?.current_mode !== "employee";

  const [{ data: cats }, { data: topProsRaw }, { data: settingEnabled }] = await Promise.all([
    sb.from("skill_categories")
      .select("id, slug, name, icon, tier, parent_category_id, status, sort_order")
      .order("sort_order"),
    sb.from("employee_profiles")
      .select(`
        user_id, headline, location, avg_rating, total_reviews, completion_rate,
        user:users!employee_profiles_user_id_fkey(id, full_name, avatar_url, current_mode, is_suspended),
        skills:employee_skills(
          verification_status,
          category:skill_categories(name, slug, status, tier)
        )
      `)
      .gte("avg_rating", 4.0)
      .gte("total_reviews", 1)
      .order("avg_rating", { ascending: false })
      .order("total_reviews", { ascending: false })
      .limit(6),
    sb.from("platform_settings").select("value").eq("key", "instant_hire_enabled").maybeSingle(),
  ]);

  const platformEnabled = (settingEnabled as any)?.value?.value !== false;

  const categories: IHCategory[] = ((cats ?? []) as any[]).map(c => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    icon: c.icon,
    tier: c.tier,
    parent_category_id: c.parent_category_id,
    status: c.status,
  }));

  const topPros: IHTopPro[] = ((topProsRaw ?? []) as any[])
    .filter(p => p.user?.current_mode !== "buyer" && !p.user?.is_suspended)
    .map(p => {
      const skills = (p.skills ?? []).filter((s: any) => s.category?.status === "active" && s.verification_status !== "provisional");
      const primary = skills[0]?.category?.name ?? null;
      return {
        user_id: p.user_id,
        full_name: p.user?.full_name ?? null,
        avatar_url: p.user?.avatar_url ?? null,
        headline: p.headline,
        location: p.location,
        avg_rating: p.avg_rating != null ? Number(p.avg_rating) : null,
        total_reviews: p.total_reviews,
        completed_contracts: p.completion_rate != null ? Math.round(Number(p.completion_rate) * 10) : null,
        primary_skill_name: primary,
      };
    });

  const firstSubcat = categories.find(c => c.parent_category_id && c.status === "active") ?? null;
  let initialCandidates: IHCandidate[] = [];
  let initialCategoryId: string | null = null;

  if (firstSubcat) {
    initialCategoryId = firstSubcat.id;
    // Use the new Smart Match v2 (considers availability, price, urgency,
    // response time, etc) — not the legacy list_instant_hire_candidates.
    const { data: matchData } = await (sb.rpc as any)("get_instant_hire_candidates", {
      p_category_id: firstSubcat.id,
      p_budget_max: null,
      p_urgency: "normal",
      p_limit: 5,
    });
    const raw = (matchData as any)?.candidates ?? [];
    initialCandidates = await enrichCandidatesWithSkills(sb, raw);
  }

  return (
    <InstantHireLanding
      signedIn={signedIn}
      isBuyer={isBuyer}
      categories={categories}
      topPros={topPros}
      initialCandidates={initialCandidates}
      initialCategoryId={initialCategoryId}
      platformEnabled={platformEnabled}
    />
  );
}

async function enrichCandidatesWithSkills(sb: ReturnType<typeof createClient>, list: any[]): Promise<IHCandidate[]> {
  if (list.length === 0) return [];
  const userIds = list.map(c => c.user_id);
  const { data: skills } = await sb
    .from("employee_skills")
    .select("employee_id, is_primary, verification_status, category:skill_categories(id, slug, name, icon, tier, status)")
    .in("employee_id", userIds);
  const byUser: Record<string, any> = {};
  for (const s of (skills ?? []) as any[]) {
    if (s.category?.status !== "active") continue;
    if (s.verification_status === "provisional") continue;
    const cur = byUser[s.employee_id];
    if (!cur || s.is_primary) byUser[s.employee_id] = s;
  }
  return list.map(c => ({
    user_id: c.user_id,
    full_name: c.full_name,
    avatar_url: c.avatar_url,
    headline: c.headline,
    location: c.location,
    avg_rating: c.rating != null ? Number(c.rating) : null,
    total_reviews: null,
    completion_rate: c.completion_rate,
    standing_rate: c.standing_rate != null ? Number(c.standing_rate) : null,
    tier: c.category_tier,
    response_time_min: c.response_time_minutes,
    match_score: c.match_score_v2 != null ? Number(c.match_score_v2) : null,
    availability_status: c.availability_status ?? null,
    available_until: c.available_until ?? null,
    active_contracts: c.active_contracts != null ? Number(c.active_contracts) : null,
    can_hire_instantly: !!c.can_hire_instantly,
    auto_accept: !!c.auto_accept,
    primary_skill: byUser[c.user_id]
      ? {
          id: byUser[c.user_id].category.id,
          slug: byUser[c.user_id].category.slug,
          name: byUser[c.user_id].category.name,
          icon: byUser[c.user_id].category.icon,
          tier: byUser[c.user_id].category.tier,
        }
      : null,
  }));
}
