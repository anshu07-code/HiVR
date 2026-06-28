import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";
import { PersonCard } from "./person-card";

type Props = {
  searchParams: {
    q?: string;
    skill?: string;
    tier?: string;
    avail?: string;
    tab?: string;
    min_rating?: string;
  };
  tab: string;
  q: string;
  skillFilter: string;
  tierFilter: string;
  availFilter: string;
  minRating: string;
  totalRegistered: number;
};

type Person = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  current_mode: string | null;
  employee_profile: any;
  skills: any[];
};

export async function FindPeopleResults({
  tab, q, skillFilter, tierFilter, availFilter, minRating,
}: Props) {
  const sb = createClient();

  // Base query: only employee-mode users.
  let query = sb
    .from("users")
    .select(`
      id, full_name, avatar_url, current_mode, created_at,
      employee_profile:employee_profiles(
        headline, bio, location, experience_type, overall_trust_tier,
        hourly_rate_paise, availability_hours, lifetime_earnings,
        completion_rate, avg_rating, total_reviews
      ),
      skills:employee_skills(
        id, category_id, verification_status,
        category:skill_categories(name, slug, icon, tier, status)
      )
    `)
    .in("current_mode", ["employee", "both"] as any);

  if (q) {
    query = query.or(`full_name.ilike.%${q}%`);
  }

  const { data: users } = await query.limit(120);
  let list: Person[] = (users ?? []) as any[];

  // Skill filter
  if (skillFilter) {
    list = list.filter(u => (u.skills ?? []).some((s: any) => s.category?.slug === skillFilter));
  }
  // Tier filter (tier_a / tier_b from URL)
  if (tierFilter) {
    list = list.filter(u => {
      const subTiers = (u.skills ?? []).map((s: any) => s.category?.tier).filter(Boolean);
      if (subTiers.length > 0) return subTiers.includes(tierFilter);
      return true;
    });
  }
  // Availability
  if (availFilter === "1" || tab === "available") {
    list = list.filter(u => (u.employee_profile?.availability_hours ?? 0) > 0);
  }
  // Min rating
  if (minRating) {
    const min = Number(minRating);
    list = list.filter(u => Number(u.employee_profile?.avg_rating ?? 0) >= min);
  } else if (tab === "top") {
    list = list.filter(u => Number(u.employee_profile?.avg_rating ?? 0) >= 4.5 && Number(u.employee_profile?.total_reviews ?? 0) >= 3);
  }
  // Verified tab
  if (tab === "verified") {
    list = list.filter(u => (u.skills ?? []).some((s: any) => s.verification_status === "verified" || s.verification_status === "experienced" || s.verification_status === "top_rated"));
  }

  // q expansion: also match headline / bio / location / skill names
  if (q) {
    const t = q.toLowerCase();
    list = list.filter(u => {
      if ((u.full_name ?? "").toLowerCase().includes(t)) return true;
      if ((u.employee_profile?.headline ?? "").toLowerCase().includes(t)) return true;
      if ((u.employee_profile?.bio ?? "").toLowerCase().includes(t)) return true;
      if ((u.employee_profile?.location ?? "").toLowerCase().includes(t)) return true;
      if ((u.skills ?? []).some((s: any) => (s.category?.name ?? "").toLowerCase().includes(t))) return true;
      return false;
    });
  }

  // Sort: rating desc, then reviews desc
  list.sort((a, b) => {
    const ra = Number(a.employee_profile?.avg_rating ?? 0);
    const rb = Number(b.employee_profile?.avg_rating ?? 0);
    if (rb !== ra) return rb - ra;
    return Number(b.employee_profile?.total_reviews ?? 0) - Number(a.employee_profile?.total_reviews ?? 0);
  });

  if (list.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-muted">
            <Search className="h-5 w-5 text-muted-foreground" />
          </div>
          <h3 className="mt-3 font-display text-lg font-semibold">No matches</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {q
              ? <>No one matches <strong>&quot;{q}&quot;</strong> with the current filters.</>
              : tab === "available"
                ? <>No employees are currently listed as available. Try the All people tab.</>
                : tab === "top"
                  ? <>No employees have a 4.5+ rating with 3+ reviews yet. Be the first to hire and leave a review!</>
                  : tab === "verified"
                    ? <>No verified employees match the current filters.</>
                    : <>No people match your filters yet.</>}
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <Button asChild variant="outline"><Link href="/find-people">Clear all filters</Link></Button>
            <Button asChild variant="gradient"><Link href="/dashboard/post">Post a task instead</Link></Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <p className="mb-3 text-xs text-muted-foreground">
        Showing <strong>{list.length}</strong> {list.length === 1 ? "person" : "people"}
        {q ? <> matching <strong>&quot;{q}&quot;</strong></> : null}
        {tab === "top" ? " · top rated" : tab === "available" ? " · available now" : tab === "verified" ? " · verified" : null}
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {list.map(u => {
          const ep = u.employee_profile;
          const rating = ep?.avg_rating != null ? Number(ep.avg_rating) : null;
          const isTop = rating != null && rating >= 4.5 && Number(ep?.total_reviews ?? 0) >= 3;
          const isAvailable = (ep?.availability_hours ?? 0) > 0;
          const isVerified = (u.skills ?? []).some((s: any) =>
            s.verification_status === "verified" || s.verification_status === "experienced" || s.verification_status === "top_rated"
          );
          return (
            <PersonCard
              key={u.id}
              id={u.id}
              full_name={u.full_name}
              avatar_url={u.avatar_url}
              headline={ep?.headline}
              bio={ep?.bio}
              location={ep?.location}
              avg_rating={rating}
              total_reviews={ep?.total_reviews}
              experience_type={ep?.experience_type}
              hourly_rate_paise={ep?.hourly_rate_paise}
              availability_hours={ep?.availability_hours}
              is_top={isTop}
              is_available={isAvailable}
              is_verified={isVerified}
              skills={u.skills}
            />
          );
        })}
      </div>
    </>
  );
}

// Suppress unused-imports warning when X is referenced only by JSX
void X;
