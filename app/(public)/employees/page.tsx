import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/server";
import { CategoryIcon } from "@/components/marketing/category-icon";
import { Star, MapPin, Award, Sparkles, Search, ChevronDown, X, Briefcase } from "lucide-react";
import { TopProsSection } from "@/components/find-people/top-pros-section";

export const metadata = { title: "Find people — HiVR" };
export const revalidate = 0;

type Cat = { id: string; slug: string; name: string; icon: string; tier: string; status: string; parent_category_id: string | null };

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: { category?: string; tier?: string; q?: string; min_rating?: string };
}) {
  const sb = createClient();

  // Fetch all categories and split them into parents + children for the
  // hierarchical filter UI.
  const { data: allCategories } = await sb
    .from("skill_categories")
    .select("id, slug, name, icon, tier, status, parent_category_id, sort_order")
    .order("sort_order");
  const parents = (allCategories ?? []).filter(c => c.parent_category_id === null && c.status === "active");
  const childByParent: Record<string, Cat[]> = {};
  for (const c of (allCategories ?? [])) {
    if (c.parent_category_id) {
      (childByParent[c.parent_category_id] ??= []).push(c);
    }
  }
  // Resolve selected category (could be parent OR child).
  const selectedCategory = (allCategories ?? []).find(c => c.slug === searchParams.category) ?? null;
  const selectedParent = selectedCategory
    ? (selectedCategory.parent_category_id
        ? (allCategories ?? []).find(c => c.id === selectedCategory.parent_category_id) ?? null
        : selectedCategory)
    : null;
  const selectedSubcats = selectedParent ? (childByParent[selectedParent.id] ?? []) : [];

  // Build the people query.
  // NOTE: query from `users` so both `profile:employee_profiles` and
  // `skills:employee_skills` embeds resolve (both FK to users.id).
  let peopleQuery = sb
    .from("users")
    .select(`
      id, full_name, avatar_url, current_mode,
      profile:employee_profiles(
        user_id, bio, headline, location, languages, avg_rating, total_reviews,
        completion_rate, experience_type, overall_trust_tier, response_time_avg_minutes
      ),
      skills:employee_skills(
        id, category_id, verification_status, tier, current_wage_band_min, current_wage_band_max, last_tested_at,
        category:skill_categories(id, slug, name, icon, tier, status, parent_category_id)
      )
    `)
    .in("current_mode", ["employee", "both"] as any);

  if (searchParams.q && searchParams.q.trim()) {
    const term = `%${searchParams.q.trim()}%`;
    peopleQuery = peopleQuery.or(`full_name.ilike.${term},profile.bio.ilike.${term},profile.location.ilike.${term}`);
  }
  if (searchParams.min_rating) {
    peopleQuery = peopleQuery.gte("profile.avg_rating", Number(searchParams.min_rating));
  }
  if (searchParams.tier === "tierA") {
    peopleQuery = peopleQuery.gte("profile.total_reviews", 1);
  }

  const { data: everyone } = await peopleQuery
    .order("profile.avg_rating", { ascending: false, nullsFirst: false })
    .order("profile.total_reviews", { ascending: false, nullsFirst: false })
    .limit(80);

  // If a category is selected, filter client-side: keep only people who
  // have a verified skill in the selected parent (or the specific child).
  const matchesCat = (p: any) => {
    if (!selectedCategory) return true;
    return (p.skills ?? []).some((s: any) => {
      if (!s.category) return false;
      if (s.category.id === selectedCategory.id) return true;
      // If the user selected a parent, any verified child skill counts.
      if (selectedCategory.parent_category_id === null) {
        return s.category.parent_category_id === selectedCategory.id;
      }
      return false;
    });
  };
  const filtered = (everyone ?? []).filter(matchesCat);

  // Split into featured (4.5+ stars, 3+ reviews) and rest.
  const featured = filtered.filter((p: any) => Number(p.profile?.avg_rating) >= 4.5 && Number(p.profile?.total_reviews) >= 3);
  const rest = filtered.filter((p: any) => !(Number(p.profile?.avg_rating) >= 4.5 && Number(p.profile?.total_reviews) >= 3));

  // Build the URL helper for chip links.
  const buildHref = (overrides: Partial<typeof searchParams> = {}) => {
    const params = new URLSearchParams();
    const merged = { ...searchParams, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v !== undefined && v !== "" && v !== "any") params.set(k, String(v));
    }
    const qs = params.toString();
    return qs ? `/employees?${qs}` : "/employees";
  };

  return (
    <div
      className="flex flex-col"
      style={{ height: "calc(100vh - 72px)" }}
    >
      {/* FIXED HEADER */}
      <div className="shrink-0 border-b bg-background">
        <div className="container py-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-primary" />
                <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
                  Find people
                </h1>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {selectedParent
                  ? <>Showing people with verified skills in <span className="font-medium text-foreground">{selectedParent.name}</span></>
                  : "Browse skill-verified people you can hire"}
              </p>
            </div>
            {/* Search */}
            <form action="/employees" method="get" className="flex w-full max-w-md gap-2">
              {searchParams.category && <input type="hidden" name="category" value={searchParams.category} />}
              {searchParams.tier && <input type="hidden" name="tier" value={searchParams.tier} />}
              {searchParams.min_rating && <input type="hidden" name="min_rating" value={searchParams.min_rating} />}
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  name="q"
                  defaultValue={searchParams.q ?? ""}
                  placeholder="Search by name, bio, or location…"
                  className="pl-9 pr-9"
                />
                {searchParams.q && (
                  <Link href={buildHref({ q: "" })} className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted" aria-label="Clear search">
                    <X className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
              <Button type="submit" size="sm">Search</Button>
            </form>
          </div>

          {/* COMPACT FILTER BAR — parent categories as chips, no messy subcategory list */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Link
              href="/employees"
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                !searchParams.category ? "border-primary bg-primary text-primary-foreground" : "hover:border-foreground/30"
              }`}
            >
              All
            </Link>
            {parents.map(p => {
              const active = selectedParent?.id === p.id;
              return (
                <Link
                  key={p.id}
                  href={buildHref({ category: p.slug, q: "" })}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    active ? "border-primary bg-primary text-primary-foreground" : "hover:border-foreground/30"
                  }`}
                >
                  <CategoryIcon name={p.icon} className="h-3.5 w-3.5" />
                  {p.name}
                </Link>
              );
            })}
            {/* Min-rating filter as inline chips */}
            <span className="mx-1 h-4 w-px bg-border" />
            {[4.5, 4.0, 3.5].map(r => {
              const active = Number(searchParams.min_rating) === r;
              return (
                <Link
                  key={r}
                  href={buildHref({ min_rating: active ? undefined : String(r) })}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                    active ? "border-amber-400 bg-amber-50 text-amber-700" : "hover:border-foreground/30"
                  }`}
                >
                  <Star className="h-3 w-3 fill-amber-400 text-amber-500" />
                  {r}+ stars
                </Link>
              );
            })}
          </div>

          {/* If a parent is selected, show its subcategories as a SECONDARY chip row
              so the page doesn't have a long flat list. */}
          {selectedParent && selectedSubcats.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-3 border-l-2 border-primary/30">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">In</span>
              <Link
                href={buildHref({ category: selectedParent.slug })}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/20"
              >
                Any {selectedParent.name}
              </Link>
              {selectedSubcats.map(s => {
                const active = selectedCategory?.id === s.id;
                return (
                  <Link
                    key={s.id}
                    href={buildHref({ category: s.slug })}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
                    }`}
                  >
                    {s.name}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* RESULTS — independently scrollable */}
      <main className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <div className="container py-6 space-y-8">
          {/* Top Pros — Anonymous */}
          <TopProsSection />

          {/* Featured */}
          {featured.length > 0 && (
            <section>
              <div className="mb-4 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h2 className="font-display text-lg font-semibold">Featured — top-rated</h2>
                <span className="text-xs text-muted-foreground">({featured.length})</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {featured.map((p: any) => (
                  <EmployeeCard key={p.user_id} p={p} featured />
                ))}
              </div>
            </section>
          )}

          {/* Rest */}
          {rest.length > 0 && (
            <section>
              <h2 className="mb-4 font-display text-lg font-semibold">
                {featured.length > 0 ? "More verified people" : "Verified people"}
                <span className="ml-2 text-xs font-normal text-muted-foreground">({rest.length})</span>
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((p: any) => (
                  <EmployeeCard key={p.user_id} p={p} />
                ))}
              </div>
            </section>
          )}

          {/* Empty state */}
          {filtered.length === 0 && (
            <Card>
              <CardContent className="p-12 text-center">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-muted">
                  <Search className="h-5 w-5 text-muted-foreground" />
                </div>
                <h3 className="mt-3 font-display text-lg font-semibold">No matches</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {searchParams.category
                    ? <>No verified people in <span className="font-medium text-foreground">{selectedParent?.name}</span> yet. Try clearing the filter.</>
                    : "No verified people match your search yet."}
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <Button asChild variant="outline"><Link href="/employees">Clear filters</Link></Button>
                  <Button asChild variant="gradient"><Link href="/dashboard/post">Post a task instead</Link></Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}

function EmployeeCard({ p, featured }: { p: any; featured?: boolean }) {
  const skills = (p.skills ?? []).filter((s: any) => s.category?.status === "active" && s.verification_status === "verified");
  const initials = ((p.full_name ?? "?").split(" ").map((w: string) => w[0]).slice(0, 2).join("") || "?").toUpperCase();
  const prof = p.profile;
  return (
    <Card className={featured ? "border-primary/30 ring-1 ring-primary/10" : ""}>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start gap-3">
          <Avatar className="h-12 w-12">
            <AvatarImage src={p.avatar_url ?? undefined} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-display text-base font-semibold">{p.full_name ?? "Anonymous"}</h3>
              {featured && <Badge variant="default" className="text-[10px]"><Sparkles className="mr-1 h-3 w-3" />Featured</Badge>}
            </div>
            {prof?.location && (
              <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" /><span>{prof?.location}</span>
              </div>
            )}
            <div className="mt-1 flex items-center gap-1.5 text-xs">
              <div className="flex items-center gap-0.5 text-amber-500">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={`h-3 w-3 ${i < Math.round(Number(prof?.avg_rating ?? 0)) ? "fill-current" : ""}`} />
                ))}
              </div>
              <span className="font-medium">{Number(prof?.avg_rating ?? 0).toFixed(2)}</span>
              <span className="text-muted-foreground">({prof?.total_reviews} review{prof?.total_reviews === 1 ? "" : "s"})</span>
            </div>
          </div>
        </div>

        {prof?.bio && <p className="line-clamp-2 text-sm text-muted-foreground">{prof?.bio}</p>}

        {skills.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {skills.slice(0, 3).map((s: any) => (
              <Badge key={s.category.id} variant={s.category.tier === "role_engagement" ? "tierB" : "tierA"} className="text-[10px]">
                {s.category.name}
              </Badge>
            ))}
            {skills.length > 3 && <span className="text-xs text-muted-foreground">+{skills.length - 3} more</span>}
          </div>
        )}

        <div className="flex items-center justify-between border-t pt-3">
          <span className="text-xs text-muted-foreground">
            {Number(prof?.completion_rate ?? 0) > 0 && <>{Math.round(Number(prof?.completion_rate) * 100)}% completion</>}
          </span>
          <Button asChild size="sm" variant={featured ? "gradient" : "outline"}>
            <Link href={`/people/${p.id}`}>View profile</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
