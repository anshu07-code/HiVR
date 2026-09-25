import Link from "next/link";
import { Heart, Briefcase, Clock, ListChecks, IndianRupee, Image as ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth-context";
import { formatPaise } from "@/lib/utils";
import { UnsaveButton } from "./unsave-button";

export const dynamic = "force-dynamic";

export default async function SavedPage() {
  const { user } = await requireUser("/dashboard/saved");
  const sb = createClient();

  let tableMissing = false;
  let queryError: string | null = null;

  const [gigLikesRes, taskLikesRes] = await Promise.all([
    sb.from("gig_likes")
      .select("id, gig_id, gig:gigs(id, title, slug, images, price, pricing_model, package_basic_price, delivery_days, category:skill_categories(name))")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    sb.from("task_likes")
      .select("id, task_id, task:task_posts(id, title, budget_min, budget_max, status, created_at, category:skill_categories(name))")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  if (gigLikesRes.error) {
    queryError = gigLikesRes.error.message;
    tableMissing = true;
  }
  if (taskLikesRes.error && !queryError) queryError = taskLikesRes.error.message;

  const savedGigs = (gigLikesRes.data ?? []) as any[];
  const savedTasks = (taskLikesRes.data ?? []) as any[];

  // Count likes per gig from the gig_likes table (saved_count column may not exist)
  const gigIds = savedGigs.map((g: any) => g.gig_id).filter(Boolean);
  const likeCounts = new Map<string, number>();
  if (gigIds.length > 0) {
    const { data: counts } = await sb
      .from("gig_likes")
      .select("gig_id")
      .in("gig_id", gigIds);
    if (counts) {
      for (const row of counts as any[]) {
        likeCounts.set(row.gig_id, (likeCounts.get(row.gig_id) ?? 0) + 1);
      }
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Heart className="h-6 w-6 text-red-500" />
          Saved
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Your saved gigs and tasks</p>
      </div>

      {tableMissing && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <strong>Could not load saved gigs.</strong> The <code>gig_likes</code> table may not exist yet. Run migration <code>0140_gig_likes_saved_dashboard.sql</code> in your Supabase SQL editor.
          {queryError && <p className="mt-1 text-[11px] opacity-75">Error: {queryError}</p>}
        </div>
      )}

      {queryError && !tableMissing && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <strong>Query error:</strong> {queryError}
        </div>
      )}

      {/* Saved Gigs */}
      <section className="mb-10">
        <h2 className="font-display text-lg font-semibold mb-4 flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-muted-foreground" />
          Gigs
          <span className="text-sm font-normal text-muted-foreground">({savedGigs.length})</span>
        </h2>
        {savedGigs.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
            <Heart className="mb-3 h-10 w-10 text-muted-foreground/50" />
            <h3 className="text-base font-semibold">No saved gigs</h3>
            <p className="mt-1 text-sm text-muted-foreground">Save gigs you&apos;re interested in to find them later.</p>
            <Button asChild className="mt-4">
              <Link href="/categories">Browse gigs</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {savedGigs.map((item: any) => {
              const gig = item.gig;
              const likeId = item.id;
              if (!gig) return null;
              return (
                <div key={gig.id} className="group relative overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-lg">
                  <Link href={`/gigs/${gig.slug}`}>
                    <div className="aspect-[16/9] bg-muted">
                      {gig.images && gig.images.length > 0 ? (
                        <img src={gig.images[0]} alt={gig.title} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-muted-foreground/30">
                          <ImageIcon className="h-8 w-8" />
                        </div>
                      )}
                    </div>
                  </Link>
                  <UnsaveButton likeId={likeId} type="gig" />
                  <Link href={`/gigs/${gig.slug}`}>
                    <div className="p-4 pt-2">
                      <div className="mb-2 flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{gig.category?.name}</Badge>
                      </div>
                      <h3 className="font-semibold leading-tight text-sm group-hover:text-primary transition-colors">{gig.title}</h3>
                      <p className="mt-1 text-base font-bold text-primary">
                        {gig.pricing_model === "package"
                          ? `${formatPaise(gig.package_basic_price ?? 0)}+`
                          : formatPaise(gig.price ?? 0)}
                      </p>
                      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                        {gig.delivery_days && (
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{gig.delivery_days}d</span>
                        )}
                        <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{likeCounts.get(gig.id) ?? 0}</span>
                      </div>
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Saved Tasks */}
      <section>
        <h2 className="font-display text-lg font-semibold mb-4 flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-muted-foreground" />
          Tasks
          <span className="text-sm font-normal text-muted-foreground">({savedTasks.length})</span>
        </h2>
        {savedTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
            <ListChecks className="mb-3 h-10 w-10 text-muted-foreground/50" />
            <h3 className="text-base font-semibold">No saved tasks</h3>
            <p className="mt-1 text-sm text-muted-foreground">Save tasks you&apos;d like to apply for later.</p>
            <Button asChild className="mt-4">
              <Link href="/browse">Browse tasks</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {savedTasks.map((item: any) => {
              const task = item.task;
              const likeId = item.id;
              if (!task) return null;
              return (
                <div key={task.id} className="group relative rounded-xl border bg-card transition-shadow hover:shadow-lg">
                  <Link href={`/browse/${task.id}`} className="block p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <Badge variant="outline" className="text-[10px] mb-1.5">{task.category?.name}</Badge>
                        <h3 className="font-semibold text-sm leading-snug group-hover:text-primary transition-colors">{task.title}</h3>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {task.budget_min && (
                            <span className="flex items-center gap-1"><IndianRupee className="h-3 w-3" />₹{Math.round(task.budget_min / 100).toLocaleString("en-IN")}{task.budget_max ? ` – ₹${Math.round(task.budget_max / 100).toLocaleString("en-IN")}` : ""}</span>
                          )}
                          <Badge variant="secondary" className="text-[10px]">{task.status}</Badge>
                        </div>
                      </div>
                    </div>
                  </Link>
                  <UnsaveButton likeId={likeId} type="task" />
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
