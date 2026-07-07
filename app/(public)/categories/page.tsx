import { CategoriesHero } from "@/components/marketing/categories-hero";
import { BrickWallGallery } from "@/components/marketing/brick-wall-gallery";
import { CategoryStickyNav } from "@/components/marketing/category-sticky-nav";
import { ComingSoonZone } from "@/components/marketing/coming-soon-zone";
import { FindFreelancersCTA } from "@/components/marketing/find-freelancers-cta";
import { SuggestCategoryModal } from "@/components/marketing/suggest-category-modal";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "All categories — HiVR" };
export const revalidate = 0;

export default async function CategoriesPage() {
  const sb = createClient();
  const { data: categories } = await sb
    .from("skill_categories")
    .select("id, slug, name, icon, description, tier, status, sort_order, parent_category_id, wage_band_min_paise, wage_band_max_paise")
    .order("sort_order");

  const all = categories ?? [];
  const parents = all.filter(c => c.parent_category_id === null);
  const childrenByParent = all
    .filter(c => c.parent_category_id !== null)
    .reduce<Record<string, typeof all>>((acc, c) => {
      (acc[c.parent_category_id!] = acc[c.parent_category_id!] || []).push(c);
      return acc;
    }, {});

  const activeParents = parents.filter(p => p.status === "active");
  const comingParents = parents.filter(p => p.status === "coming_soon");

  // Fetch open task counts
  const allCategoryIds = all.filter(c => c.status === "active").map(c => c.id);
  let openTaskCounts: Record<string, number> = {};
  if (allCategoryIds.length > 0) {
    const { data: openTasks } = await sb
      .from("task_posts")
      .select("category_id")
      .eq("status", "open")
      .in("category_id", allCategoryIds);
    for (const t of (openTasks ?? [])) {
      openTaskCounts[t.category_id] = (openTaskCounts[t.category_id] ?? 0) + 1;
    }
  }
  const openTaskCountByParent: Record<string, number> = {};
  for (const c of all.filter(c => c.status === "active")) {
    const direct = openTaskCounts[c.id] ?? 0;
    if (!c.parent_category_id) {
      openTaskCountByParent[c.id] = direct;
    } else {
      openTaskCountByParent[c.parent_category_id] = (openTaskCountByParent[c.parent_category_id] ?? 0) + direct;
    }
  }

  return (
    <main>
      {/* Hero section with video background */}
      <div id="categories-hero">
        <CategoriesHero totalCategories={activeParents.length + comingParents.length} />
      </div>

      {/* Sticky nav — appears below main nav on scroll */}
      <CategoryStickyNav
        activeParents={activeParents.map(c => ({ id: c.id, slug: c.slug, name: c.name, icon: c.icon, tier: c.tier }))}
        childrenByParent={Object.fromEntries(
          activeParents.map(p => [
            p.id,
            (childrenByParent[p.id] ?? []).map(s => ({ id: s.id, slug: s.slug, name: s.name })),
          ])
        )}
      />

      {/* Brick wall gallery */}
      <section className="py-16 md:py-20">
        <div className="mx-auto max-w-7xl px-4">
          <BrickWallGallery
            activeParents={activeParents}
            childrenByParent={childrenByParent}
            openTaskCounts={openTaskCountByParent}
          />
        </div>
      </section>

      {/* Coming soon */}
      <div id="coming-soon">
        <ComingSoonZone comingParents={comingParents} />
      </div>

      {/* Suggest a category */}
      <section className="border-t py-16">
        <div className="mx-auto max-w-7xl px-4 text-center">
          <h2 className="font-display text-2xl font-semibold tracking-tight">Don&apos;t see what you&apos;re looking for?</h2>
          <p className="mt-2 text-muted-foreground text-pretty max-w-lg mx-auto">
            We add new categories every month based on what people like you request. Tell us what you need and we&apos;ll prioritise it.
          </p>
          <div className="mt-6">
            <SuggestCategoryModal />
          </div>
        </div>
      </section>

      {/* Find freelancers CTA */}
      <FindFreelancersCTA />
    </main>
  );
}
