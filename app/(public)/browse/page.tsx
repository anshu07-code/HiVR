import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LayoutList, Sparkles, Calendar, Clock, User, Plus, Users, Briefcase } from "lucide-react";
import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CategoryIcon } from "@/components/marketing/category-icon";
import { VoiceSearch } from "@/components/search/voice-search";
import { BrowseFilters } from "./filters";
import { FiltersDropdown } from "./filters-dropdown";
import { formatPaise, timeAgo, timeUntil } from "@/lib/utils";
import { cn } from "@/lib/utils";

export const metadata = { title: "Browse — HiVR" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

type TabKey = "all" | "open" | "upcoming" | "closed";

const TABS: { key: TabKey; label: string; icon: any; desc: string }[] = [
  { key: "all",      label: "All",      icon: LayoutList, desc: "All tasks regardless of status" },
  { key: "open",     label: "Open",     icon: Sparkles,   desc: "Live tasks accepting applications" },
  { key: "upcoming", label: "Upcoming", icon: Calendar,   desc: "Scheduled to publish later" },
  { key: "closed",   label: "Closed",   icon: Clock,      desc: "Past tasks (closed or filled)" },
];

export default async function BrowsePage({ searchParams }: { searchParams: { category?: string; tier?: string; pricing?: string; q?: string; sort?: string; budget?: string; posted?: string; verified?: string; remote?: string; experience?: string; status?: string; mine?: string; just_posted?: string } }) {
  const sb = createClient();
  noStore();

  // Fetch categories.
  const { data: categories } = await sb
    .from("skill_categories")
    .select("id, slug, name, icon, tier, status, parent_category_id")
    .order("sort_order");

  // Determine active tab. Default = "all" (no status filter).
  const activeTab: TabKey = TABS.find(t => t.key === searchParams.status)?.key ?? "all";

  // Identify signed-in user + profile
  let viewer = null;
  try {
    const res = await sb.auth.getUser();
    viewer = res.data.user;
  } catch {
    // fallback if token refresh races with middleware
  }
  const { data: profile } = viewer
    ? await sb.from("users").select("id, current_mode, roles").eq("id", viewer.id).maybeSingle()
    : { data: null };
  const userRoles: string[] = (profile?.roles as string[]) ?? [];
  const isAdmin = userRoles.includes("admin");
  const currentMode = profile?.current_mode as string | undefined;
  const isEmployeeOnly = !isAdmin && currentMode === "employee";

  const mine = searchParams.mine === "1" || searchParams.mine === "true";

  // Lazy: auto-promote scheduled tasks.
  try { await sb.rpc("promote_scheduled_tasks" as any); } catch { /* non-fatal */ }

  // Count tasks per category (all statuses) for sidebar
  const { data: taskRowsAll } = await sb.from("task_posts").select("category_id, status").limit(1000);
  const rawCounts: Record<string, number> = {};
  for (const t of (taskRowsAll ?? [])) {
    rawCounts[t.category_id] = (rawCounts[t.category_id] ?? 0) + 1;
  }
  // Roll subcategory counts into their parent for sidebar.
  const parentIds = new Set((categories ?? []).filter(c => !c.parent_category_id).map(c => c.id));
  const rolledCounts: Record<string, number> = {};
  for (const c of (categories ?? [])) {
    if (c.parent_category_id) {
      // Child: count only direct tasks
      rolledCounts[c.id] = rawCounts[c.id] ?? 0;
      // Add child's count to parent
      rolledCounts[c.parent_category_id] = (rolledCounts[c.parent_category_id] ?? 0) + (rawCounts[c.id] ?? 0);
    } else {
      rolledCounts[c.id] = (rolledCounts[c.id] ?? 0) + (rawCounts[c.id] ?? 0);
    }
  }

  // Build main query
  let query = sb
    .from("task_posts")
    .select("id, buyer_id, title, description, pricing_model, budget_min, budget_max, status, created_at, deadline, category:skill_categories!inner(slug, name, icon, tier)");

  if (mine && viewer) {
    if (isEmployeeOnly) {
      // Mine in employee mode = applied tasks
      const { data: myApps } = await sb.from("task_applications").select("task_id").eq("employee_id", viewer.id);
      const appliedTaskIds = (myApps ?? []).map((a: any) => a.task_id).filter(Boolean);
      query = query.in("id", appliedTaskIds.length > 0 ? appliedTaskIds : []);
    } else {
      query = query.eq("buyer_id", viewer.id);
    }
  } else if (activeTab !== "all") {
    // Status filter (skipped for "all" tab)
    if (activeTab === "open") {
      query = query.eq("status", "open");
    } else if (activeTab === "upcoming") {
      query = query.eq("status", "upcoming").eq("show_in_upcoming", true);
    } else if (activeTab === "closed") {
      query = query.in("status", ["closed", "cancelled", "in_contract"]);
    }
  }

  // Category filter — include subcategories when parent selected.
  if (searchParams.category) {
    const cat = (categories ?? []).find(c => c.slug === searchParams.category);
    if (cat) {
      const subIds = (categories ?? [])
        .filter(c => c.parent_category_id === cat.id)
        .map(c => c.id);
      const allIds = [cat.id, ...subIds];
      query = query.in("category_id", allIds);
    }
  }

  // Pricing filter
  if (searchParams.pricing && searchParams.pricing !== "any") {
    query = query.eq("pricing_model", searchParams.pricing as any);
  }

  // Budget range filter (values in rupees from dropdown, converted to paise)
  if (searchParams.budget && searchParams.budget !== "any") {
    const parts = searchParams.budget.split("-").map(Number);
    const bMin = parts[0];
    const bMax = parts[1];
    if (!isNaN(bMin)) {
      if (!isNaN(bMax)) {
        query = query.gte("budget_min", bMin * 100).lte("budget_max", bMax * 100);
      } else {
        query = query.gte("budget_min", bMin * 100);
      }
    }
  }

  // Posted within filter
  if (searchParams.posted && searchParams.posted !== "anytime") {
    const now = Date.now();
    const msMap: Record<string, number> = {
      "24h": 24 * 60 * 60 * 1000,
      "week": 7 * 24 * 60 * 60 * 1000,
      "month": 30 * 24 * 60 * 60 * 1000,
    };
    const ms = msMap[searchParams.posted];
    if (ms) {
      query = query.gte("created_at", new Date(now - ms).toISOString());
    }
  }

  // Search filter
  if (searchParams.q && searchParams.q.trim()) {
    const q = searchParams.q.trim();
    query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`);
  }

  // Sort
  const sort = searchParams.sort ?? "newest";
  if (sort === "budget_hi") query = query.order("budget_max", { ascending: false });
  else if (sort === "budget_lo") query = query.order("budget_min", { ascending: true });
  else query = query.order("created_at", { ascending: false });

  const { data: rawPosts } = await query.limit(50);

  // Post-filter by tier
  const tierFilter = searchParams.tier && searchParams.tier !== "any" ? searchParams.tier : null;
  const posts = (rawPosts ?? []).filter((p: any) => {
    if (tierFilter && p.category?.tier !== tierFilter) return false;
    return true;
  });

  // Check which tasks the user applied to (for "Applied" / "Shortlisted" badges)
  const appliedStatusByTask: Record<string, string> = {};
  if (viewer && posts.length > 0) {
    const { data: myApps } = await sb.from("task_applications").select("task_id, status").eq("employee_id", viewer.id).in("task_id", posts.map(p => p.id));
    for (const a of (myApps ?? [])) appliedStatusByTask[(a as any).task_id] = (a as any).status;
  }

  // Pull applicant counts
  const taskIds = posts.map((p: any) => p.id);
  const applicantCountByTask: Record<string, number> = {};
  if (taskIds.length > 0) {
    const { data: counts } = await sb.from("task_applicant_counts").select("task_id, applicant_count").in("task_id", taskIds);
    for (const row of counts ?? []) {
      applicantCountByTask[(row as any).task_id] = Number((row as any).applicant_count) || 0;
    }
  }

  const selectedCategory = searchParams.category
    ? (categories ?? []).find(c => c.slug === searchParams.category) ?? null
    : null;

  const dropdownActive = [
    sort !== "newest" ? sort : null,
    searchParams.tier && searchParams.tier !== "any" ? searchParams.tier : null,
    searchParams.pricing && searchParams.pricing !== "any" ? searchParams.pricing : null,
    searchParams.budget && searchParams.budget !== "any" ? searchParams.budget : null,
    searchParams.posted && searchParams.posted !== "anytime" ? searchParams.posted : null,
    searchParams.experience && searchParams.experience !== "any" ? searchParams.experience : null,
    searchParams.verified === "true" ? "verified" : null,
    searchParams.remote === "true" ? "remote" : null,
  ].filter(Boolean).length;

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 72px)" }}>
      {/* FIXED HEADER */}
      <div className="shrink-0 border-b bg-background">
        <div className="container py-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
                {selectedCategory ? selectedCategory.name : "Browse tasks"}
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {posts.length} task{posts.length === 1 ? "" : "s"}
                {activeTab !== "all" ? ` · ${activeTab}` : ""}
                {searchParams.q ? ` matching "${searchParams.q}"` : ""}
                {selectedCategory ? ` in ${selectedCategory.name}` : ""}
                {mine && viewer ? <> · <strong>yours only</strong></> : null}
              </p>
            </div>
            <div className="flex w-full max-w-2xl gap-2">
              <form id="browse-search" action="/browse" method="get" className="flex flex-1 gap-2">
                {searchParams.category && <input type="hidden" name="category" value={searchParams.category} />}
                {searchParams.tier && <input type="hidden" name="tier" value={searchParams.tier} />}
                {searchParams.pricing && <input type="hidden" name="pricing" value={searchParams.pricing} />}
                {searchParams.sort && <input type="hidden" name="sort" value={searchParams.sort} />}
                {searchParams.budget && <input type="hidden" name="budget" value={searchParams.budget} />}
                {searchParams.posted && <input type="hidden" name="posted" value={searchParams.posted} />}
                {searchParams.experience && <input type="hidden" name="experience" value={searchParams.experience} />}
                {searchParams.verified && <input type="hidden" name="verified" value={searchParams.verified} />}
                {searchParams.remote && <input type="hidden" name="remote" value={searchParams.remote} />}
                <VoiceSearch name="q" defaultValue={searchParams.q ?? ""} placeholder="Search tasks…" parentFormId="browse-search" className="flex-1" />
              </form>
              <FiltersDropdown initial={searchParams} activeCount={dropdownActive} />
              <div className="flex shrink-0 items-center gap-2">
                {!isEmployeeOnly && (
                  <Button asChild size="sm" variant="gradient" className="shrink-0">
                    <Link href="/dashboard/post"><Plus className="h-3.5 w-3.5" />Post a task</Link>
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="mt-3 flex flex-wrap items-center gap-1 border-b" role="tablist" aria-label="Task filter">
            {TABS.map(t => {
              const Icon = t.icon;
              const active = activeTab === t.key && !mine;
              const href = `/browse?${new URLSearchParams({ ...(searchParams as any), status: t.key, mine: "" }).toString()}`;
              return (
                <Link key={t.key} href={href} role="tab" aria-selected={active}
                  className={cn(
                    "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                    active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                  )}
                  title={t.desc}
                >
                  <Icon className="h-3.5 w-3.5" />{t.label}
                </Link>
              );
            })}
            {viewer && (
              <Link
                href={`/browse?${new URLSearchParams({ ...(searchParams as any), mine: mine ? "" : "1", status: mine ? "" : searchParams.status ?? "all" }).toString()}`}
                role="tab" aria-selected={mine}
                className={cn(
                  "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  mine ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                )}
                title={isEmployeeOnly ? "Show tasks you've applied to" : "Show only tasks you've posted"}
              >
                <User className="h-3.5 w-3.5" />{isEmployeeOnly ? "Applied" : "Mine"}
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Success banner */}
      {searchParams.just_posted === "1" && (
        <div className="shrink-0 border-b bg-success/10"><div className="container py-2.5"><p className="flex items-center gap-2 text-sm text-success"><Sparkles className="h-4 w-4" /><span className="font-medium">Task posted.</span><span className="text-success/80">It&apos;s live in the list below.</span></p></div></div>
      )}

      {/* TWO-PANEL BODY */}
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[280px] shrink-0 border-r md:block">
          <BrowseFilters categories={categories ?? []} initial={searchParams} openTaskCounts={rolledCounts} />
        </aside>

        <main className="scrollbar-thin min-w-0 flex-1 overflow-y-auto">
          <div className="container py-6">
            {posts.length === 0 ? (
              <EmptyState q={searchParams.q} category={selectedCategory} />
            ) : (
              <div className="space-y-3">
                {posts.map((p: any) => {
                  const apps = applicantCountByTask[p.id] ?? 0;
                  const skills: string[] = p.skills_required ?? [];
                  const isOwn = viewer && p.buyer_id === viewer.id;
                  const appStatus = appliedStatusByTask[p.id];
                  const isApplied = !!appStatus;
                  return (
                    <Link href={`/browse/${p.id}`} key={p.id} className="block group">
                      <Card className="transition-all group-hover:border-primary/40 group-hover:shadow-sm">
                        <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start">
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                            <CategoryIcon name={p.category?.icon ?? "code"} className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant={p.category?.tier === "role_engagement" ? "tierB" : "tierA"}>
                                {p.category?.tier === "role_engagement" ? "Tier B" : "Tier A"}
                              </Badge>
                              <span className="text-xs text-muted-foreground">{p.category?.name}</span>
                              {isOwn && <Badge variant="default" className="text-[10px]"><User className="mr-1 h-2.5 w-2.5" />Your task</Badge>}
                              {p.status === "open" && <Badge variant="success" className="text-[10px]">Open</Badge>}
                              {p.status === "upcoming" && <Badge variant="secondary" className="text-[10px] bg-purple-100 text-purple-800 hover:bg-purple-100">Upcoming</Badge>}
                              {p.status === "in_contract" && <Badge className="text-[10px] bg-emerald-100 text-emerald-800 hover:bg-emerald-100">In contract</Badge>}
                              {(p.status === "closed" || p.status === "cancelled") && <Badge variant="destructive" className="text-[10px]">Closed</Badge>}
                              {appStatus === "shortlisted" && <Badge className="text-[10px] bg-orange-100 text-orange-800 hover:bg-orange-100">Shortlisted</Badge>}
                              {isApplied && appStatus !== "shortlisted" && <Badge className="text-[10px] bg-blue-100 text-blue-800 hover:bg-blue-100">Applied</Badge>}
                            </div>
                            <h3 className="mt-1 font-display text-base font-semibold leading-snug">{p.title}</h3>
                            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
                            {skills.length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-1.5">
                                {skills.slice(0, 4).map((s: string) => (
                                  <span key={s} className="inline-flex items-center rounded-full border bg-muted/30 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{s}</span>
                                ))}
                                {skills.length > 4 && <span className="text-[10px] text-muted-foreground">+{skills.length - 4} more</span>}
                              </div>
                            )}
                            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <span className="font-semibold text-foreground">{formatPaise(p.budget_min)}–{formatPaise(p.budget_max)}</span>
                              <span>·</span>
                              <span className="capitalize">{p.pricing_model.replace("_", " ")}</span>
                              {p.status === "open" && <><span>·</span><span><Users className="mr-0.5 inline h-3 w-3" />{apps} applicant{apps === 1 ? "" : "s"}</span></>}
                              <span>·</span>
                              <span>{timeAgo(p.created_at)}</span>
                              {p.status === "open" && p.deadline && <><span>·</span><span className="text-amber-700 dark:text-amber-400">closes {timeUntil(p.deadline)}</span></>}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function EmptyState({ q, category }: { q?: string; category: any }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-muted"><Briefcase className="h-6 w-6 text-muted-foreground" /></div>
        <h3 className="font-display text-lg font-semibold">No tasks match your filters</h3>
        <p className="max-w-md text-sm text-muted-foreground">
          {q ? `Nothing matches "${q}". Try a different search term or clear your filters.`
            : category ? `No tasks found in ${category.name} with the selected filters.`
            : `No tasks found.`}
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <Button asChild variant="outline"><Link href="/browse">Clear all filters</Link></Button>
        </div>
      </CardContent>
    </Card>
  );
}
