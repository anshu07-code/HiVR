import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { FindPeopleResults } from "@/components/find-people/find-people-results";
import { FindPeopleFilters } from "@/components/find-people/find-people-filters";
import { FindPeopleSearchForm } from "@/components/find-people/find-people-search-form";
import { Button } from "@/components/ui/button";
import { Star, ShieldCheck, Zap, UserSearch, Users, ChevronLeft, X } from "lucide-react";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Find people — HiVR" };

type Cat = { id: string; slug: string; name: string; icon: string; tier: string; parent_category_id: string | null; status: string };

type SearchParams = {
  q?: string;
  skill?: string;
  tier?: string;
  avail?: string;
  tab?: string;
  min_rating?: string;
};

const TABS = [
  { key: "all",       label: "All people",     Icon: Users,       desc: "Every registered employee" },
  { key: "available", label: "Available now",  Icon: Zap,         desc: "Responds in under 4h" },
  { key: "top",       label: "Top rated",      Icon: Star,        desc: "4.5+ stars with 3+ reviews" },
  { key: "verified",  label: "Verified",       Icon: ShieldCheck, desc: "Identity-verified employees" },
] as const;

type TabKey = typeof TABS[number]["key"];

export default async function FindPeoplePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  noStore();
  const sb = createClient();

  const q = (searchParams.q ?? "").trim();
  const skillFilter = searchParams.skill ?? "";
  const tierFilter = searchParams.tier ?? "";
  const availFilter = searchParams.avail ?? "";
  const minRating = searchParams.min_rating ?? "";
  const tabRaw = (searchParams.tab ?? "all") as TabKey;
  const tab: TabKey = (TABS.find(t => t.key === tabRaw)?.key) ?? "all";

  const [{ data: categories }, { data: countsRaw, count: profileCount }] = await Promise.all([
    sb
      .from("skill_categories")
      .select("id, slug, name, icon, tier, status, parent_category_id, sort_order")
      .order("sort_order"),
    sb
      .from("employee_profiles")
      .select("user_id, availability_hours, avg_rating, total_reviews", { count: "exact" })
      .then(r => ({ data: r.data ?? [] as any[], count: r.count })),
  ]);

  const flatCategories: Cat[] = ((categories ?? []) as Cat[]).filter(c => c.parent_category_id);
  const parentCategories = ((categories ?? []) as Cat[]).filter(c => !c.parent_category_id);
  const counts = countsRaw as any[];
  const totalRegistered = profileCount ?? counts.length;
  const totalAvailable = counts.filter((c: any) => (c.availability_hours ?? 0) > 0).length;
  const totalTop = counts.filter((c: any) => Number(c.avg_rating ?? 0) >= 4.5 && Number(c.total_reviews ?? 0) >= 3).length;
  const tabCounts: Record<TabKey, number> = {
    all: totalRegistered,
    available: totalAvailable,
    top: totalTop,
    verified: totalRegistered,
  };

  // Look up the human-readable name of the currently-selected skill (for the chip).
  const selectedSkill = flatCategories.find(c => c.slug === skillFilter);
  const hasActiveFilters = !!(skillFilter || tierFilter || availFilter || minRating || q || tab !== "all");

  return (
    <div className="container max-w-7xl space-y-5 py-6">
      {/* Back button + page header */}
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/">
            <ChevronLeft className="h-4 w-4" />
            Back
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <UserSearch className="h-5 w-5 text-primary" />
            <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl" data-tour="find-people-header">Find people</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Search verified employees by name, skill, or trust tier. Use voice to speak your search.
          </p>
        </div>
        <FindPeopleSearchForm
          q={q}
          tab={tab}
          skillFilter={skillFilter}
          tierFilter={tierFilter}
          availFilter={availFilter}
          minRating={minRating}
        />
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1 border-b" role="tablist" aria-label="People filters">
        {TABS.map(t => {
          const Icon = t.Icon;
          const active = tab === t.key;
          const params = new URLSearchParams();
          if (q) params.set("q", q);
          if (skillFilter) params.set("skill", skillFilter);
          if (tierFilter) params.set("tier", tierFilter);
          if (availFilter) params.set("avail", availFilter);
          if (minRating) params.set("min_rating", minRating);
          if (t.key !== "all") params.set("tab", t.key);
          const href = `/find-people${params.toString() ? `?${params.toString()}` : ""}`;
          const count = tabCounts[t.key];
          return (
            <Link
              key={t.key}
              href={href}
              role="tab"
              aria-selected={active}
              title={t.desc}
              className={cn(
                "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
              <span className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
              )}>
                {count}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Auto-submitting filter form. Each <select> submits the form
          on change, so the user never has to click "Apply". */}
      <FindPeopleFilters
        q={q}
        tab={tab}
        skillFilter={skillFilter}
        tierFilter={tierFilter}
        availFilter={availFilter}
        minRating={minRating}
        flatCategories={flatCategories}
        parentCategories={parentCategories}
        allCategories={categories as any[]}
      />

      {/* Active filter chips with X to remove individually */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Active filters:</span>
          {q && <FilterChip label={`"${q}"`} removeHref={buildHref({ q: undefined, tab, skill: skillFilter, tier: tierFilter, avail: availFilter, min_rating: minRating })} />}
          {tab !== "all" && <FilterChip label={`Tab: ${TABS.find(t => t.key === tab)?.label}`} removeHref={buildHref({ q, tab: undefined, skill: skillFilter, tier: tierFilter, avail: availFilter, min_rating: minRating })} />}
          {tierFilter && <FilterChip label={`Tier: ${tierFilter === "micro_task" ? "Tier A" : "Tier B"}`} removeHref={buildHref({ q, tab, skill: skillFilter, tier: undefined, avail: availFilter, min_rating: minRating })} />}
          {skillFilter && <FilterChip label={`Skill: ${selectedSkill?.name ?? skillFilter}`} removeHref={buildHref({ q, tab, skill: undefined, tier: tierFilter, avail: availFilter, min_rating: minRating })} />}
          {minRating && <FilterChip label={`Rating: ${minRating}+`} removeHref={buildHref({ q, tab, skill: skillFilter, tier: tierFilter, avail: availFilter, min_rating: undefined })} />}
          {availFilter && <FilterChip label={["online","offline","away","busy"].includes(availFilter) ? `Status: ${availFilter}` : "Available now"} removeHref={buildHref({ q, tab, skill: skillFilter, tier: tierFilter, avail: undefined, min_rating: minRating })} />}
          <Link href="/find-people" className="text-xs text-muted-foreground underline hover:text-foreground">
            Clear all
          </Link>
        </div>
      )}

      <FindPeopleResults
        searchParams={searchParams}
        tab={tab}
        q={q}
        skillFilter={skillFilter}
        tierFilter={tierFilter}
        availFilter={availFilter}
        minRating={minRating}
        totalRegistered={totalRegistered}
        allCategories={categories as any[]}
      />
    </div>
  );
}

function FilterChip({ label, removeHref }: { label: string; removeHref: string }) {
  return (
    <Link
      href={removeHref}
      className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/20"
    >
      {label}
      <X className="h-3 w-3" />
    </Link>
  );
}

function buildHref(parts: {
  q?: string | undefined;
  tab?: string | undefined;
  skill?: string | undefined;
  tier?: string | undefined;
  avail?: string | undefined;
  min_rating?: string | undefined;
}) {
  const p = new URLSearchParams();
  if (parts.q) p.set("q", parts.q);
  if (parts.tab) p.set("tab", parts.tab);
  if (parts.skill) p.set("skill", parts.skill);
  if (parts.tier) p.set("tier", parts.tier);
  if (parts.avail) p.set("avail", parts.avail);
  if (parts.min_rating) p.set("min_rating", parts.min_rating);
  const qs = p.toString();
  return qs ? `/find-people?${qs}` : "/find-people";
}
