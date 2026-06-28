import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { CategoryIcon } from "@/components/marketing/category-icon";
import { WaitlistButton } from "./waitlist-button";
import { ArrowLeft, Briefcase, Clock, ArrowRight, Sparkles } from "lucide-react";
import { formatINR, timeAgo } from "@/lib/utils";
import { unstable_noStore as noStore } from "next/cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CategoryPage({ params }: { params: { slug: string } }) {
  noStore();
  const sb = createClient();

  // Fetch the category. If it's a parent (no parent_category_id), we'll also
  // pull in any tasks posted to its subcategories.
  const { data: cat } = await sb
    .from("skill_categories")
    .select("*")
    .eq("slug", params.slug)
    .single();
  if (!cat) notFound();

  // If the user landed on a PARENT, also load all child category ids so we
  // can show tasks posted to any subcategory under it.
  const isParent = !cat.parent_category_id;
  let childIds: string[] = [];
  if (isParent) {
    const { data: children } = await sb
      .from("skill_categories")
      .select("id")
      .eq("parent_category_id", cat.id);
    childIds = (children ?? []).map(c => c.id);
  }

  const targetIds = isParent ? [cat.id, ...childIds] : [cat.id];
  const { data: { user } } = await sb.auth.getUser();

  // Open tasks in this category (or its subcategories).
  const { data: tasks } = await sb
    .from("task_posts")
    .select("id, title, description, pricing_model, budget_min, budget_max, tier, status, created_at, category:skill_categories!inner(slug, name, icon, tier)")
    .eq("status", "open")
    .in("category_id", targetIds)
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <main className="container max-w-4xl py-8 space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/categories"><ArrowLeft className="h-4 w-4" />All categories</Link>
      </Button>

      {/* Category header */}
      <Card>
        <CardContent className="space-y-5 p-8">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-lg bg-primary/10 text-primary">
              <CategoryIcon name={cat.icon} className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h1 className="font-display text-3xl font-semibold tracking-tight">{cat.name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge variant={cat.tier === "role_engagement" ? "tierB" : "tierA"}>
                  {cat.tier === "role_engagement" ? "Tier B · Role Engagement" : "Tier A · Micro-Task"}
                </Badge>
                {cat.status === "active"
                  ? <Badge variant="live">Live now</Badge>
                  : <Badge variant="soon">Coming soon</Badge>}
                {cat.status === "active" && (tasks ?? []).length > 0 && (
                  <Badge variant="outline" className="font-mono">
                    {tasks.length} open task{tasks.length === 1 ? "" : "s"}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <p className="text-muted-foreground text-pretty">{cat.description}</p>

          {cat.status === "active" ? (
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="gradient">
                <Link href={`/browse?category=${cat.slug}`}>
                  Browse all open tasks
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/dashboard/post">Post a task</Link>
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-5">
              <h2 className="font-display text-lg font-semibold">Launching soon — join the waitlist</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                We're calibrating skill tests and wage bands for this category. Join the waitlist as a future
                buyer or future employee, and we'll notify you the day it goes live.
              </p>
              <WaitlistButton categoryId={cat.id} signedIn={!!user} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Open tasks in this category */}
      {cat.status === "active" && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">
              Open tasks in {cat.name}
              {(tasks ?? []).length > 0 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({tasks.length})
                </span>
              )}
            </h2>
            {(tasks ?? []).length > 5 && (
              <Button asChild variant="ghost" size="sm">
                <Link href={`/browse?category=${cat.slug}`}>
                  See all <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            )}
          </div>

          {(tasks ?? []).length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-muted">
                  <Briefcase className="h-5 w-5 text-muted-foreground" />
                </div>
                <h3 className="font-display text-lg font-semibold">No open tasks yet</h3>
                <p className="max-w-md text-sm text-muted-foreground">
                  No one has posted in {cat.name} yet. Be the first — your post will be visible to every
                  active employee in this category.
                </p>
                <Button asChild variant="gradient">
                  <Link href="/dashboard/post">Post the first task</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {tasks.slice(0, 5).map((p: any) => (
                <Link href={`/browse/${p.id}`} key={p.id} className="block group">
                  <Card className="transition-all group-hover:border-primary/40 group-hover:shadow-sm">
                    <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                        <CategoryIcon name={p.category?.icon ?? cat.icon} className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={p.tier === "role_engagement" ? "tierB" : "tierA"}>
                            {p.tier === "role_engagement" ? "Tier B" : "Tier A"}
                          </Badge>
                          {isParent && p.category?.slug !== cat.slug && (
                            <span className="text-xs text-muted-foreground">in {p.category?.name}</span>
                          )}
                        </div>
                        <h3 className="mt-1 font-display text-base font-semibold leading-snug">{p.title}</h3>
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span className="font-semibold text-foreground">{formatINR(p.budget_min)}–{formatINR(p.budget_max)}</span>
                          <span>·</span>
                          <span className="capitalize">{p.pricing_model.replace("_", " ")}</span>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{timeAgo(p.created_at)}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
