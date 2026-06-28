import Link from "next/link";
import { ArrowRight, Briefcase, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CategoryIcon } from "@/components/marketing/category-icon";
import { createClient } from "@/lib/supabase/server";
import { formatINR, timeAgo } from "@/lib/utils";

/**
 * Featured open tasks — shown on the homepage, visible to everyone
 * (including non-logged-in visitors). This is what makes the platform look
 * "alive" before any real users post. The fallback (when no tasks exist)
 * calls out a "Post the first task" CTA so the marketplace isn't visually dead.
 */
export async function FeaturedTasks() {
  const sb = createClient();
  const { data: tasks } = await sb
    .from("task_posts")
    .select(`
      id, title, description, pricing_model, budget_min, budget_max, tier, created_at,
      category:skill_categories!inner(slug, name, icon)
    `)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(3);

  if (!tasks || tasks.length === 0) {
    return (
      <section className="border-t bg-muted/20 py-16">
        <div className="container">
          <div className="mb-6 flex items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">Open tasks</h2>
              <p className="mt-1 text-sm text-muted-foreground">Be the first to post — your task will be visible to every active employee on the platform.</p>
            </div>
          </div>
          <Card>
            <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
              <Briefcase className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No open tasks yet. Post the first one to kick things off.</p>
              <Button asChild variant="gradient"><Link href="/dashboard/post">Post the first task</Link></Button>
            </CardContent>
          </Card>
        </div>
      </section>
    );
  }

  return (
    <section className="border-t bg-muted/20 py-16">
      <div className="container">
        <div className="mb-6 flex items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">Open right now</h2>
            <p className="mt-1 text-sm text-muted-foreground">Real tasks from real buyers. Visible to everyone — no login required to browse.</p>
          </div>
          <Button asChild variant="ghost"><Link href="/browse">See all <ArrowRight className="h-4 w-4" /></Link></Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tasks.map((t: any) => (
            <Link key={t.id} href={`/browse/${t.id}`} className="block group">
              <Card className="h-full transition-all group-hover:border-primary/40 group-hover:shadow-sm">
                <CardContent className="flex h-full flex-col gap-3 p-5">
                  <div className="flex items-start gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <CategoryIcon name={t.category?.icon ?? "code"} className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={t.tier === "role_engagement" ? "tierB" : "tierA"}>
                          {t.tier === "role_engagement" ? "Tier B" : "Tier A"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{t.category?.name}</span>
                      </div>
                    </div>
                  </div>
                  <h3 className="line-clamp-2 font-display text-base font-semibold leading-snug">{t.title}</h3>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{t.description}</p>
                  <div className="mt-auto flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{formatINR(t.budget_min)}–{formatINR(t.budget_max)}</span>
                    <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{timeAgo(t.created_at)}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
