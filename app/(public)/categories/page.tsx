import { CategoryTree } from "@/components/marketing/category-tree";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Sparkles, Rocket, CheckCircle2, Clock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = { title: "All categories — HiVR" };
export const revalidate = 0;

export default async function CategoriesPage() {
  const sb = createClient();
  const { data: categories } = await sb
    .from("skill_categories")
    .select("id, slug, name, icon, description, tier, status, sort_order, parent_category_id, wage_band_min_paise, wage_band_max_paise")
    .order("sort_order");

  // Build the tree: parents first (no parent_category_id), then their children
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
  const activeChildrenCount = all.filter(c => c.parent_category_id !== null && c.status === "active").length;
  const tierACount = activeParents.filter(c => c.tier === "micro_task").length;
  const tierBCount = activeParents.filter(c => c.tier === "role_engagement").length;

  // Fetch live open-task counts per category (parent + child). This lets the
  // listing page show "3 open tasks" next to each active category, and
  // surface the categories that actually have work available right now.
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
  // Roll up child counts into the parent so "Spreadsheet & Data Work" shows
  // the sum of all its subcategories' open tasks.
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
    <>      <main className="container py-12">
        <header className="mb-10 max-w-3xl">
          <Badge variant="tierA" className="mb-3">{activeParents.length} live now · {comingParents.length} launching soon</Badge>
          <h1 className="font-display text-4xl font-semibold tracking-tight md:text-5xl">
            Every kind of small job, on one platform.
          </h1>
          <p className="mt-4 text-lg text-muted-foreground text-pretty">
            HiVR breaks work into hireable micro-tasks across <strong>{activeParents.length + comingParents.length} categories</strong> and <strong>{activeChildrenCount} specific subcategories</strong> — except medical and legal. Every subcategory exists because generic AI can't already do it well for free in under a minute. The rest are open for waitlist and convert to Live on a fixed monthly cadence.
          </p>
        </header>

        {/* PLATFORM-NOW SUMMARY */}
        <div className="mb-12 grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-success">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase">Live now</span>
              </div>
              <div className="mt-2 font-display text-2xl font-semibold">{activeParents.length} categories · {activeChildrenCount} subcategories</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Full skill tests, real contracts, escrow-protected payments.
              </p>
              <ul className="mt-3 space-y-1 text-sm">
                <li>• {tierACount} <strong>Tier A</strong> — micro-tasks (hourly / fixed)</li>
                <li>• {tierBCount} <strong>Tier B</strong> — role engagements (daily / milestone)</li>
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <Clock className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase">Launching soon</span>
              </div>
              <div className="mt-2 font-display text-2xl font-semibold">{comingParents.length} categories</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Open for waitlist. We activate one new category every month based on real demand.
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                Next up: <strong>Content &amp; Copywriting</strong> — then Finance &amp; Accounts, Design, VA/Ops.
              </p>
            </CardContent>
          </Card>
          <Card className="bg-primary/5 border-primary/30">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-primary">
                <Sparkles className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase">On the platform</span>
              </div>
              <div className="mt-2 font-display text-2xl font-semibold">What you can do today</div>
              <ul className="mt-3 space-y-1.5 text-sm">
                <li className="flex items-start gap-2"><Rocket className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />Post a task in any Live subcategory</li>
                <li className="flex items-start gap-2"><Rocket className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />Take a skill test and start earning</li>
                <li className="flex items-start gap-2"><Rocket className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />Join a category waitlist as a future buyer or employee</li>
                <li className="flex items-start gap-2"><Rocket className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />Browse the open task board</li>
              </ul>
              <Button asChild variant="gradient" size="sm" className="mt-4 w-full">
                <Link href="/browse">Browse open tasks <ArrowRight className="h-3.5 w-3.5" /></Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* LIVE TREE */}
        <section className="mb-14">
          <div className="mb-5 flex items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <h2 className="font-display text-2xl font-semibold tracking-tight">Live now</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Real skill tests, real wage bands, real contracts with escrow. Click a category to see its subcategories.
              </p>
            </div>
          </div>
          <CategoryTree parents={activeParents} childrenByParent={childrenByParent} openTaskCounts={openTaskCountByParent} />
        </section>

        {/* COMING SOON TREE */}
        <section className="mb-8">
          <div className="mb-5 flex items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
                <h2 className="font-display text-2xl font-semibold tracking-tight">Launching soon</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Visible now so you know what's coming. Join the waitlist to be first when it goes Live.
              </p>
            </div>
          </div>
          <CategoryTree parents={comingParents} childrenByParent={childrenByParent} />
        </section>
      </main>    </>
  );
}
