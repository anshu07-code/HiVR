import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { CategoryIcon } from "@/components/marketing/category-icon";
import { CategoryFreelancerMarquee } from "@/components/marketing/category-freelancer-marquee";
import { CategoryStickyNavWrapper } from "@/components/marketing/category-sticky-nav-wrapper";
import { WaitlistButton } from "./waitlist-button";
import { SubcategoryGrid } from "./subcategory-grid";
import { formatINR, timeAgo, cn } from "@/lib/utils";
import {
  ArrowLeft, Briefcase, Clock, ArrowRight, Users,
  CheckCircle2, TrendingUp, Search, MessageSquare, Zap,
  Star, ChevronRight, GraduationCap, BadgeCheck, Handshake, Award, Sparkles, PlusCircle,
} from "lucide-react";
import { unstable_noStore as noStore } from "next/cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CategoryPage({ params, searchParams }: { params: { slug: string }; searchParams?: { tier?: string; employee?: string } }) {
  noStore();
  const sb = createClient();

  const { data: cat } = await sb
    .from("skill_categories")
    .select("*, parent:parent_category_id(slug, name)")
    .eq("slug", params.slug)
    .single();
  if (cat && cat.parent) {
    (cat as any).parent_slug = cat.parent.slug;
    (cat as any).parent_name = cat.parent.name;
  }
  if (!cat) notFound();
  if (cat.status === "hidden") notFound();

  const isParent = !cat.parent_category_id;

  // For subcategories, determine effective status from parent
  let effectiveStatus = cat.status;
  if (!isParent && cat.parent_category_id) {
    const { data: parentCat } = await sb
      .from("skill_categories")
      .select("status")
      .eq("id", cat.parent_category_id)
      .single();
    if (parentCat && (parentCat as any).status !== "active") {
      effectiveStatus = (parentCat as any).status;
    }
  }

  // Children (subcategories)
  let children: any[] = [];
  if (isParent) {
    const { data: ch } = await sb
      .from("skill_categories")
      .select("id, slug, name, icon, description, tier, status, sort_order, wage_band_min_paise, wage_band_max_paise")
      .eq("parent_category_id", cat.id)
      .order("sort_order");
    children = ch ?? [];
  }

  const childIds = children.map(c => c.id);
  const targetIds = isParent ? [cat.id, ...childIds] : [cat.id];

  // Open tasks
  const { data: tasks, error: tasksErr } = await sb
    .from("task_posts")
    .select("id, title, description, pricing_model, budget_min, budget_max, status, created_at, category:skill_categories(slug, name, icon, tier)")
    .eq("status", "open")
    .in("category_id", targetIds)
    .order("created_at", { ascending: false })
    .limit(8);

  if (tasksErr) {
    console.error("[category] tasks fetch failed:", tasksErr);
  }

  const activeTier = searchParams?.tier ?? "all";
  const filteredTasks = activeTier === "all"
    ? (tasks ?? [])
    : (tasks ?? []).filter((t: any) => t.category?.tier === activeTier);

  // Open task count per category
  let taskCountByCat: Record<string, number> = {};
  if (targetIds.length > 0) {
    const { data: counts } = await sb
      .from("task_posts")
      .select("category_id")
      .eq("status", "open")
      .in("category_id", targetIds);
    for (const t of (counts ?? [])) {
      taskCountByCat[t.category_id] = (taskCountByCat[t.category_id] ?? 0) + 1;
    }
  }

  // Gig count per subcategory
  let gigCountByCat: Record<string, number> = {};
  if (childIds.length > 0) {
    const { data: gCounts } = await sb
      .from("gigs")
      .select("category_id")
      .eq("status", "active")
      .in("category_id", childIds);
    for (const g of (gCounts ?? [])) {
      gigCountByCat[g.category_id] = (gigCountByCat[g.category_id] ?? 0) + 1;
    }
  }

  // Gigs for subcategories
  let gigs: any[] = [];
  let allGigs: any[] = [];
  let employeeGigFilter = searchParams?.employee ?? null;
  if (!isParent && effectiveStatus === "active") {
    const { data: g } = await sb
      .from("gigs")
      .select("id, title, slug, description, tip, price, delivery_days, images, pricing_model, package_basic_price, package_basic_title, package_standard_price, package_premium_price, employee_id, created_at")
      .eq("category_id", cat.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(20);
    allGigs = g ?? [];

    // Fetch employee profiles for all gigs
    const empIds = [...new Set(allGigs.map((g: any) => g.employee_id))];
    let empMap = new Map();
    if (empIds.length > 0) {
      const { data: emps } = await sb
        .from("users")
        .select("id, full_name, avatar_url, profile:employee_profiles(avg_rating, total_reviews, overall_trust_tier)")
        .in("id", empIds);
      empMap = new Map((emps ?? []).map((e: any) => [e.id, e]));
      for (const gig of allGigs) {
        (gig as any).employee = empMap.get(gig.employee_id);
      }
    }

    // If employee filter is active, show their gigs first, but keep all gigs for fallback
    if (employeeGigFilter) {
      gigs = allGigs.filter((g: any) => g.employee_id === employeeGigFilter);
    } else {
      gigs = allGigs;
    }
  }

  // Related subcategories (siblings of this subcategory)
  let siblingSubs: any[] = [];
  if (!isParent && cat.parent_category_id) {
    const { data: sibs } = await sb
      .from("skill_categories")
      .select("id, slug, name, icon, tier, description")
      .eq("parent_category_id", cat.parent_category_id)
      .eq("status", "active")
      .neq("id", cat.id)
      .order("sort_order")
      .limit(6);
    siblingSubs = sibs ?? [];
  }

  // Employee count and top employees
  let employeeCount = 0;
  let topEmployees: any[] = [];
  if (targetIds.length > 0) {
    const { count: empCount } = await sb
      .from("employee_skills")
      .select("employee_id", { count: "exact", head: true })
      .in("category_id", targetIds);
    employeeCount = empCount ?? 0;

    const { data: empSkillRows } = await sb
      .from("employee_skills")
      .select("employee_id")
      .in("category_id", targetIds)
      .limit(50);

    const empIds = [...new Set((empSkillRows ?? []).map((r: any) => r.employee_id))];

    if (empIds.length > 0) {
      const { data: emps } = await sb
        .from("users")
        .select(`
          id, full_name, avatar_url,
          profile:employee_profiles(
            user_id, bio, headline, location, avg_rating, total_reviews, completion_rate, experience_type, overall_trust_tier
          ),
          skills:employee_skills(
            id, category_id, verification_status, is_primary, years_experience, current_wage_band_min, current_wage_band_max,
            category:skill_categories(id, slug, name, icon, tier, parent_category_id)
          )
        `)
        .in("id", empIds)
        .limit(12);
      topEmployees = (emps ?? [])
        .filter((p: any) =>
          (p.skills ?? []).some((s: any) => s.category && targetIds.includes(s.category_id))
        )
        .sort((a: any, b: any) => (b.profile?.avg_rating ?? 0) - (a.profile?.avg_rating ?? 0))
        .slice(0, 12);
    }
  }

  const { data: { user } } = await sb.auth.getUser();
  let canCreateGig = false;
  let isEmployee = false;

  // Waitlist count for coming_soon categories
  let waitlistCount = 0;
  if (effectiveStatus !== "active") {
    const { count: wlCount } = await sb
      .from("category_waitlist")
      .select("id", { count: "exact", head: true })
      .eq("category_id", cat.id);
    waitlistCount = wlCount ?? 0;
  }
  if (user) {
    const { data: me } = await sb.from("users").select("current_mode, roles").eq("id", user.id).single();
    if (me) {
      const roles = (me as any).roles ?? [];
      isEmployee = (me as any).current_mode === "employee";
      canCreateGig = isEmployee || roles.includes("employee") || roles.includes("admin") || roles.includes("business");
    }
  }

  const themeColors: Record<string, string> = {
    "graphic-design-creative": "from-violet-500 via-purple-500 to-pink-500",
    "programming-tech": "from-blue-600 via-indigo-500 to-violet-500",
    "digital-marketing": "from-emerald-400 via-teal-400 to-cyan-400",
    "writing-translation": "from-rose-400 via-pink-400 to-fuchsia-400",
    "video-animation": "from-orange-400 via-red-400 to-rose-400",
    "ai-services": "from-purple-500 via-violet-500 to-indigo-500",
    "business-services": "from-sky-400 via-blue-400 to-indigo-400",
    "finance-accounting": "from-green-500 via-emerald-500 to-teal-500",
    "data-analytics": "from-cyan-400 via-blue-400 to-indigo-400",
    photography: "from-yellow-400 via-amber-400 to-orange-400",
    "personal-growth-consulting": "from-teal-400 via-cyan-400 to-sky-400",
    sales: "from-green-400 via-emerald-400 to-teal-400",
    "qa-testing": "from-red-400 via-rose-400 to-pink-400",
    "music-audio": "from-amber-400 via-yellow-400 to-orange-400",
  };
  const heroGrad = themeColors[cat.slug] ?? "from-primary via-primary/80 to-primary/60";

  return (
    <main>
      <CategoryStickyNavWrapper />

      {/* ===== HERO ===== */}
      <section id="categories-hero" className={`relative overflow-hidden ${!isParent ? 'border-b' : ''} bg-gradient-to-br ${heroGrad}`}>
        <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-white/10 blur-3xl animate-pulse" style={{ animationDuration: "6s" }} />
        <div className="pointer-events-none absolute -bottom-32 -right-32 h-80 w-80 rounded-full bg-white/5 blur-3xl animate-pulse" style={{ animationDuration: "8s", animationDelay: "2s" }} />
        <div className="pointer-events-none absolute left-1/2 top-0 h-px w-1/2 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
        <div className="pointer-events-none absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyek0zNiAyNHYySDI0di0yaDEyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-30" />

        {isParent ? (
          /* ---- Parent hero (existing full design) ---- */
          <div className="container relative py-14 md:py-28">
            <Button asChild variant="ghost" size="sm" className="mb-8 -ml-2 text-white/70 hover:text-white hover:bg-white/10">
              <Link href="/categories"><ArrowLeft className="h-4 w-4" />All categories</Link>
            </Button>

            <div className="flex flex-col gap-10 md:flex-row md:items-center md:justify-between">
              <div className="flex-1 max-w-2xl">
                <div className="flex items-center gap-4 mb-5">
                  <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-white/15 text-white backdrop-blur-md ring-1 ring-white/25 shadow-lg shadow-black/10">
                    <CategoryIcon name={cat.icon} className="h-8 w-8" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <Badge variant="outline" className="border-white/25 text-white/80 text-[11px] font-medium px-2.5 py-0.5">
                        {isParent ? "Tier A + Tier B" : cat.tier === "role_engagement" ? "Tier B" : "Tier A"}
                      </Badge>
                      {effectiveStatus === "active" ? (
                        <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-400/30 text-[11px] font-medium px-2.5 py-0.5">
                          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />Live
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-500/20 text-amber-300 border-amber-400/30 text-[11px] font-medium px-2.5 py-0.5">
                          Coming soon
                        </Badge>
                      )}
                    </div>
                    <h1 className="font-display text-2xl font-bold tracking-tight text-white md:text-5xl lg:text-6xl">
                      {cat.name}
                    </h1>
                  </div>
                </div>
                <p className="text-lg text-white/80 text-pretty leading-relaxed max-w-xl">
                  {cat.description}
                </p>

                {effectiveStatus === "active" && (
                  <div className="mt-8 flex gap-3 overflow-x-auto pb-2 md:flex-wrap md:gap-6 md:overflow-visible md:pb-0 scrollbar-hide">
                    <div className="flex shrink-0 items-center gap-2.5 rounded-xl bg-white/10 backdrop-blur-sm px-3 py-2 md:px-4 md:py-2.5 ring-1 ring-white/10">
                      <Briefcase className="h-3.5 w-3.5 md:h-4 md:w-4 text-emerald-300" />
                      <div>
                        <p className="text-base md:text-lg font-bold text-white leading-none">{(tasks ?? []).length}</p>
                        <p className="text-[10px] md:text-[11px] text-white/60">open tasks</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2.5 rounded-xl bg-white/10 backdrop-blur-sm px-3 py-2 md:px-4 md:py-2.5 ring-1 ring-white/10">
                      <Users className="h-3.5 w-3.5 md:h-4 md:w-4 text-blue-300" />
                      <div>
                        <p className="text-base md:text-lg font-bold text-white leading-none">{employeeCount}</p>
                        <p className="text-[10px] md:text-[11px] text-white/60">{employeeCount === 1 ? "employee" : "employees"}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2.5 rounded-xl bg-white/10 backdrop-blur-sm px-3 py-2 md:px-4 md:py-2.5 ring-1 ring-white/10">
                      <CheckCircle2 className="h-3.5 w-3.5 md:h-4 md:w-4 text-emerald-300" />
                      <div>
                        <p className="text-base md:text-lg font-bold text-white leading-none">{children.length}</p>
                        <p className="text-[10px] md:text-[11px] text-white/60">subcategories</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-8 flex flex-wrap gap-3 items-center">
                  {effectiveStatus === "active" ? (
                    <>
                      <Button asChild size="lg" className="bg-white text-primary hover:bg-white/90 shadow-xl shadow-black/20 font-semibold px-8">
                        <Link href="/find-people">
                          Explore freelancers
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                      </Button>
                      <Button asChild size="lg" variant="outline" className="border-white/30 text-white hover:bg-white/10 hover:text-white">
                        <Link href={`/browse?category=${cat.slug}`}>Browse tasks</Link>
                      </Button>
                    </>
                  ) : user ? (
                    <WaitlistButton categoryId={cat.id} signedIn={!!user} />
                  ) : (
                    <Button asChild size="lg" className="bg-white text-primary hover:bg-white/90 shadow-xl shadow-black/20 font-semibold px-8">
                      <Link href="/auth/signup">
                        Join HiVR
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  )}
                </div>
              </div>

              {effectiveStatus === "active" && (tasks ?? []).length > 0 && (
                <div className="hidden md:flex shrink-0 items-center justify-center">
                  <div className="relative animate-float">
                    <div className="h-52 w-52 rounded-full bg-white/5 ring-1 ring-white/10 backdrop-blur-sm flex items-center justify-center">
                      <div className="h-40 w-40 rounded-full bg-white/10 ring-1 ring-white/15 flex items-center justify-center">
                        <div className="text-center">
                          <TrendingUp className="mx-auto h-8 w-8 text-emerald-300" />
                          <p className="mt-1 text-3xl font-bold text-white">{(tasks ?? []).length}</p>
                          <p className="text-xs text-white/60">open tasks</p>
                          <p className="text-[10px] text-white/40 mt-0.5">in {cat.name}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ---- Subcategory hero (compact Fiverr-style) ---- */
          <div className="container relative py-8 md:py-14">
            <nav className="flex items-center gap-2 text-xs text-white/60 mb-4">
              <Link href="/categories" className="hover:text-white transition-colors">Categories</Link>
              <span>/</span>
              {cat.parent_slug && (
                <>
                  <Link href={`/categories/${cat.parent_slug}`} className="hover:text-white transition-colors capitalize">{cat.parent_name}</Link>
                  <span>/</span>
                </>
              )}
              <span className="text-white/90">{cat.name}</span>
            </nav>

            <div className="flex items-center gap-3 mb-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/15 text-white backdrop-blur-md ring-1 ring-white/25">
                <CategoryIcon name={cat.icon} className="h-6 w-6" />
              </div>
              <div>
                <h1 className="font-display text-2xl font-bold tracking-tight text-white md:text-3xl">
                  {cat.name}
                </h1>
              </div>
            </div>
            <p className="text-sm text-white/70 max-w-2xl leading-relaxed">
              {cat.description || `Browse professional ${cat.name.toLowerCase()} services from verified freelancers on HiVR`}
            </p>

            {effectiveStatus === "active" && (
              <div className="mt-5 flex flex-wrap gap-3">
                <div className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 backdrop-blur-sm px-3 py-1.5 ring-1 ring-white/10">
                  <Briefcase className="h-3.5 w-3.5 text-emerald-300" />
                  <span className="text-sm font-bold text-white">{gigs.length}</span>
                  <span className="text-[11px] text-white/60">gigs</span>
                </div>
                <div className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 backdrop-blur-sm px-3 py-1.5 ring-1 ring-white/10">
                  <Users className="h-3.5 w-3.5 text-blue-300" />
                  <span className="text-sm font-bold text-white">{employeeCount}</span>
                  <span className="text-[11px] text-white/60">freelancers</span>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-background to-transparent" />
      </section>

      <div className="container py-12 space-y-20">

        {/* ===== SUBCATEGORIES ===== */}
        {isParent && children.length > 0 && (
          <SubcategoryGrid
            subcategories={children as any}
            categorySlug={cat.slug}
            categoryName={cat.name}
            taskCountByCat={taskCountByCat}
            gigCountByCat={gigCountByCat}
            parentStatus={effectiveStatus}
            parentCategoryId={cat.id}
            signedIn={!!user}
          />
        )}

        {/* ===== GIGS (subcategory view — Fiverr-style) ===== */}
        {!isParent && effectiveStatus === "active" && (
          <section>
            {/* Filter / sort bar */}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{gigs.length}</span> {gigs.length === 1 ? "service" : "services"} available
              </p>
              <div className="flex items-center gap-2">
                {canCreateGig && (
                  <Button asChild size="sm" variant="default" className="h-9">
                    <Link href={`/gigs/new?category=${params.slug}`}><Briefcase className="mr-1 h-3.5 w-3.5" />Create Gig</Link>
                  </Button>
                )}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search in this category..."
                    className="h-9 w-48 rounded-lg border border-input bg-background pl-8 pr-3 text-xs outline-none transition-colors focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                  />
                </div>
                <select className="h-9 rounded-lg border border-input bg-background px-2.5 text-xs outline-none focus:border-primary/50">
                  <option>Best selling</option>
                  <option>Newest</option>
                  <option>Price: Low to High</option>
                  <option>Price: High to Low</option>
                </select>
              </div>
            </div>

            {employeeGigFilter && gigs.length === 0 ? (
              <>
                <Card className="mb-8">
                  <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
                    <div className="grid h-14 w-14 place-items-center rounded-full bg-muted ring-1 ring-border">
                      <Briefcase className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-display text-base font-semibold">No gigs posted by this freelancer</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        This freelancer hasn't published any gigs in {cat.name} yet.
                      </p>
                    </div>
                  </CardContent>
                </Card>
                {allGigs.length > 0 && (
                  <>
                    <h3 className="mb-4 font-display text-lg font-semibold">Related gigs in {cat.name}</h3>
                    <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {allGigs.map((gig: any) => {
                        const imgSrc = (gig.images ?? []).length > 0 ? gig.images[0] : null;
                        const price = gig.pricing_model === "package" ? gig.package_basic_price : gig.price;
                        const rating = gig.employee?.profile?.avg_rating;
                        const reviews = gig.employee?.profile?.total_reviews;
                        return (
                          <Link
                            key={gig.id}
                            href={`/gigs/${gig.slug}`}
                            className="group block overflow-hidden rounded-xl border bg-card transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
                          >
                            <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                              {imgSrc ? (
                                <img src={imgSrc} alt={gig.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                              ) : (
                                <div className="flex h-full items-center justify-center">
                                  <Briefcase className="h-10 w-10 text-muted-foreground/40" />
                                </div>
                              )}
                            </div>
                            <div className="p-3.5">
                              <h4 className="truncate text-sm font-medium">{gig.title}</h4>
                              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{gig.description}</p>
                              <div className="mt-3 flex items-center justify-between">
                                <p className="text-sm font-semibold">₹{price ? Math.round(price / 100).toLocaleString() : "—"}</p>
                                {rating != null && (
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                                    {rating.toFixed(1)} ({reviews ?? 0})
                                  </div>
                                )}
                              </div>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            ) : gigs.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-4 p-16 text-center">
                  <div className="grid h-16 w-16 place-items-center rounded-full bg-muted ring-1 ring-border">
                    <Briefcase className="h-7 w-7 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-semibold">No gigs yet</h3>
                    <p className="mt-1 max-w-md text-sm text-muted-foreground">
                      Be the first freelancer to offer a service in {cat.name}.
                    </p>
                  </div>
                  {canCreateGig && (
                    <Button asChild variant="gradient">
                      <Link href={`/gigs/new?category=${params.slug}`}>Create a gig</Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <>
                {employeeGigFilter && (
                  <div className="mb-4 flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-2.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      Showing gigs by this freelancer in <span className="text-foreground">{cat.name}</span>
                    </p>
                    <Button asChild variant="outline" size="sm" className="h-7 text-[11px]">
                      <Link href={`/categories/${params.slug}`}>Show all</Link>
                    </Button>
                  </div>
                )}
                <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {gigs.map((gig: any) => {
                  const imgSrc = (gig.images ?? []).length > 0 ? gig.images[0] : null;
                  const price = gig.pricing_model === "package" ? gig.package_basic_price : gig.price;
                  const rating = gig.employee?.profile?.avg_rating;
                  const reviews = gig.employee?.profile?.total_reviews;
                  return (
                    <Link
                      key={gig.id}
                      href={`/gigs/${gig.slug}`}
                      className="group block overflow-hidden rounded-xl border bg-card transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
                    >
                      {/* Image */}
                      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                        {imgSrc ? (
                          <img src={imgSrc} alt={gig.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                        ) : (
                          <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary/5 to-primary/10">
                            <CategoryIcon name={cat.icon} className="h-10 w-10 text-muted-foreground/20" />
                          </div>
                        )}
                        {gig.pricing_model === "package" && (
                          <span className="absolute left-2 top-2 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-foreground shadow-sm backdrop-blur-sm">
                            Packages
                          </span>
                        )}
                      </div>
                      {/* Body */}
                      <div className="p-4 space-y-2.5">
                        {/* Seller info */}
                        {gig.employee && (
                          <div className="flex items-center gap-2">
                            <div className="h-6 w-6 shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-border">
                              {gig.employee.avatar_url ? (
                                <img src={gig.employee.avatar_url} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full items-center justify-center bg-primary/10 text-[10px] font-medium text-primary">
                                  {gig.employee.full_name?.charAt(0)?.toUpperCase()}
                                </div>
                              )}
                            </div>
                            <span className="truncate text-[13px] font-medium text-foreground">{gig.employee.full_name}</span>
                            {(gig.employee?.profile?.overall_trust_tier === "verified" || gig.employee?.profile?.overall_trust_tier === "top_rated") && (
                              <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                            )}
                          </div>
                        )}
                        {/* Title */}
                        <p className="line-clamp-2 text-sm leading-snug text-foreground/90 group-hover:text-primary transition-colors">
                          {gig.title}
                        </p>
                        {/* Rating */}
                        {rating && (
                          <div className="flex items-center gap-1.5">
                            <div className="flex items-center gap-0.5">
                              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                              <span className="text-xs font-semibold">{Number(rating).toFixed(1)}</span>
                            </div>
                            {reviews && (
                              <span className="text-[11px] text-muted-foreground">({reviews})</span>
                            )}
                          </div>
                        )}
                        {/* Delivery + price */}
                        <div className="flex items-center justify-between pt-1.5 border-t border-border/40">
                          <span className="text-[12px] text-muted-foreground">
                            {gig.delivery_days ? `Up to ${gig.delivery_days} days` : "Flexible"}
                          </span>
                          <span className="text-sm font-bold text-foreground">
                            {price ? `From ₹${price.toLocaleString("en-IN")}` : ""}
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
              </>
            )}
          </section>
        )}

        {/* ===== EXPERT TIPS (subcategory view) ===== */}
        {!isParent && effectiveStatus === "active" && gigs.length > 0 && (
          <section className="rounded-2xl border bg-card/50 p-6 md:p-10">
            <div className="mb-6 text-center">
              <h2 className="font-display text-2xl font-semibold tracking-tight">{cat.name} tips from top freelancers</h2>
              <p className="mt-1 text-sm text-muted-foreground">Insights and advice from verified professionals</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {gigs.slice(0, 3).map((gig: any, i: number) => (
                <div key={gig.id} className="rounded-xl border bg-background p-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 overflow-hidden rounded-full bg-muted ring-1 ring-border">
                      {gig.employee?.avatar_url ? (
                        <img src={gig.employee.avatar_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center bg-primary/10 text-sm font-medium text-primary">
                          {gig.employee?.full_name?.charAt(0)?.toUpperCase() || "?"}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{gig.employee?.full_name || "Anonymous"}</p>
                      {gig.employee?.profile?.overall_trust_tier === "top_rated" && (
                        <p className="text-[11px] text-yellow-600 dark:text-yellow-400">Top Rated</p>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed italic">
                    &ldquo;{gig.tip?.slice(0, 150) || "I focus on delivering quality work that exceeds expectations."}
                    {(gig.tip?.length || 0) > 150 ? "..." : ""}&rdquo;
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ===== RELATED SERVICES (subcategory view) ===== */}
        {!isParent && effectiveStatus === "active" && siblingSubs.length > 0 && (
          <section>
            <div className="mb-6">
              <h2 className="font-display text-2xl font-semibold tracking-tight">Explore more in {cat.parent_name || "this category"}</h2>
              <p className="mt-1 text-sm text-muted-foreground">Related services you might need</p>
            </div>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {siblingSubs.map((sib: any) => (
                <Link key={sib.id} href={`/categories/${sib.slug}`} className="group block">
                  <Card className="h-full overflow-hidden border-0 bg-card shadow-sm ring-1 ring-border transition-all duration-300 hover:shadow-xl hover:ring-primary/30 hover:-translate-y-1">
                    <CardContent className="p-5">
                      <div className="flex items-start gap-3">
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                          <CategoryIcon name={sib.icon} className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-display text-sm font-semibold">{sib.name}</h3>
                          {sib.description && (
                            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{sib.description}</p>
                          )}
                          <div className="mt-2 flex items-center gap-1 text-[11px] font-medium text-primary">
                            Browse services <ChevronRight className="h-3 w-3" />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ===== HOW IT WORKS (parent only) ===== */}
        {isParent && effectiveStatus === "active" && (
          <section>
            <div className="text-center mb-10">
              <h2 className="font-display text-3xl font-semibold tracking-tight">How {cat.name} works on HiVR</h2>
              <p className="mt-2 text-muted-foreground max-w-xl mx-auto">
                Whether you&apos;re hiring or looking for work, we&apos;ve got you covered
              </p>
            </div>
            <div className="grid gap-4 md:gap-6 md:grid-cols-2">
              <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                      <Briefcase className="h-5 w-5" />
                    </div>
                    <h3 className="font-display text-lg font-semibold">For buyers</h3>
                  </div>
                  <ul className="space-y-3 text-sm text-muted-foreground">
                    {[
                      { icon: Search, text: "Browse open tasks posted by verified buyers, or post your own task with clear requirements." },
                      { icon: MessageSquare, text: "Review applicants, chat in real-time, and agree on scope, timeline, and price." },
                      { icon: Zap, text: "Release payments via escrow — only pay when work is delivered and approved." },
                    ].map((step, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <div className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-primary/5 text-primary">
                          <step.icon className="h-3.5 w-3.5" />
                        </div>
                        <span>{step.text}</span>
                      </li>
                    ))}
                  </ul>
                  <Button asChild variant="gradient" size="sm" className="w-full">
                    <Link href="/dashboard/post">Post a task in {cat.name}</Link>
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-transparent">
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600">
                      <GraduationCap className="h-5 w-5" />
                    </div>
                    <h3 className="font-display text-lg font-semibold">For freelancers</h3>
                  </div>
                  <ul className="space-y-3 text-sm text-muted-foreground">
                    {[
                      { icon: Search, text: "Browse open tasks that match your skills. Apply to the ones you find interesting." },
                      { icon: Handshake, text: "Negotiate directly with buyers. Set your rates, availability, and terms." },
                      { icon: Award, text: "Get verified, build your reputation, and unlock higher-paying opportunities." },
                    ].map((step, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <div className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-emerald-500/5 text-emerald-600">
                          <step.icon className="h-3.5 w-3.5" />
                        </div>
                        <span>{step.text}</span>
                      </li>
                    ))}
                  </ul>
                  <Button asChild variant="outline" size="sm" className="w-full border-emerald-500/30 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950">
                    <Link href={`/browse?category=${cat.slug}`}>Browse tasks in {cat.name}</Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </section>
        )}

        {/* ===== OPEN TASKS (parent only) with tier filter ===== */}
        {isParent && effectiveStatus === "active" && (
          <section>
            <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-3xl font-semibold tracking-tight">Open tasks in {cat.name}</h2>
                <p className="mt-1 text-muted-foreground">{filteredTasks.length} task{filteredTasks.length === 1 ? "" : "s"} waiting for proposals</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 rounded-lg border bg-background p-0.5 shadow-sm">
                  {["all", "micro_task", "role_engagement"].map((tier) => {
                    const href = tier === "all" ? `/categories/${cat.slug}` : `/categories/${cat.slug}?tier=${tier}`;
                    const label = tier === "all" ? "All" : tier === "micro_task" ? "Tier A" : "Tier B";
                    return (
                      <Link
                        key={tier}
                        href={href}
                        className={cn(
                          "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                          activeTier === tier
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {label}
                      </Link>
                    );
                  })}
                </div>
                {(tasks ?? []).length >= 5 && (
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/browse?category=${cat.slug}`}>
                      View all <ArrowRight className="ml-1 h-4 w-4" />
                    </Link>
                  </Button>
                )}
              </div>
            </div>

            {filteredTasks.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-4 p-16 text-center">
                  <div className="grid h-16 w-16 place-items-center rounded-full bg-muted ring-1 ring-border">
                    <Briefcase className="h-7 w-7 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-semibold">No {activeTier !== "all" ? (activeTier === "micro_task" ? "Tier A" : "Tier B") + " " : ""}tasks yet</h3>
                    <p className="mt-1 max-w-md text-sm text-muted-foreground">
                      {activeTier === "all"
                        ? isEmployee
                          ? "No open tasks in " + cat.name + " yet. Check back later for new opportunities."
                          : "Be the first to post in " + cat.name + " and get matched with vetted freelancers."
                        : "No " + (activeTier === "micro_task" ? "Tier A" : "Tier B") + " tasks available yet. Try the other filter."}
                    </p>
                  </div>
                  {!isEmployee && (
                    <Button asChild variant="gradient">
                      <Link href="/dashboard/post">Post a task</Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                {filteredTasks.map((p: any) => (
                  <Link href={`/browse/${p.id}`} key={p.id} className="block group">
                    <Card className="h-full transition-all duration-200 group-hover:border-primary/30 group-hover:shadow-lg group-hover:-translate-y-0.5">
                      <CardContent className="p-5 space-y-3">
                        <div className="flex items-start gap-3">
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                            <CategoryIcon name={p.category?.icon ?? cat.icon} className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge variant={p.tier === "role_engagement" ? "tierB" : "tierA"} className="text-[10px]">
                                {p.tier === "role_engagement" ? "Role" : "Micro"}
                              </Badge>
                              {isParent && p.category?.slug !== cat.slug && (
                                <span className="text-[10px] text-muted-foreground">in {p.category?.name}</span>
                              )}
                            </div>
                            <h3 className="mt-1.5 font-display text-sm font-semibold leading-snug line-clamp-1 group-hover:text-primary transition-colors">{p.title}</h3>
                          </div>
                        </div>
                        <p className="line-clamp-2 text-xs text-muted-foreground leading-relaxed">{p.description}</p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground pt-1 border-t border-border/50">
                          <span className="font-semibold text-foreground">{formatINR(p.budget_min)}–{formatINR(p.budget_max)}</span>
                          <span className="capitalize text-[10px]">{p.pricing_model.replace("_", " ")}</span>
                          <span className="inline-flex items-center gap-1 ml-auto"><Clock className="h-3 w-3" />{timeAgo(p.created_at)}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ===== FREELANCER MARQUEE ===== */}
        {effectiveStatus === "active" && topEmployees.length > 0 && (
          <CategoryFreelancerMarquee
            employees={topEmployees as any}
            categoryName={cat.name}
            categorySlug={cat.slug}
            targetIds={targetIds}
          />
        )}

        {/* ===== CTA BANNER (parent only) ===== */}
        {isParent && effectiveStatus === "active" && (
          <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 border p-10 md:p-14 text-center">
            <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-primary/5 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-20 h-60 w-60 rounded-full bg-primary/5 blur-3xl" />
            <div className="relative">
              <h2 className="font-display text-3xl font-semibold tracking-tight">Ready to get started in {cat.name}?</h2>
              <p className="mt-3 max-w-lg mx-auto text-muted-foreground">
                {user
                  ? "Post a task and get matched with vetted freelancers, or browse open opportunities and start earning."
                  : "Join HiVR today and connect with top talent or find your next project."}
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                {user ? (
                  <>
                    {!isEmployee && (
                      <Button asChild variant="gradient" size="lg">
                        <Link href="/dashboard/post">Post a task</Link>
                      </Button>
                    )}
                    <Button asChild variant="outline" size="lg">
                      <Link href={`/browse?category=${cat.slug}`}>Browse open tasks</Link>
                    </Button>
                  </>
                ) : (
                  <Button asChild size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/25 font-semibold px-10">
                    <Link href="/auth/signup">
                      Join HiVR free
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ===== COMING SOON ===== */}
        {effectiveStatus !== "active" && (
          <section className="text-center py-12">
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-10 md:p-14 max-w-2xl mx-auto">
              <div className="grid h-16 w-16 mx-auto place-items-center rounded-full bg-amber-500/10">
                <Clock className="h-8 w-8 text-amber-500" />
              </div>
              <h2 className="mt-4 font-display text-2xl font-semibold">{cat.name} is coming soon</h2>
              <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
                We&apos;re calibrating skill tests and wage bands for this category. Join the waitlist and we&apos;ll
                notify you the day it goes live.
              </p>
              {waitlistCount > 0 && (
                <p className="mt-3 text-sm text-amber-600 font-medium">
                  {waitlistCount} {waitlistCount === 1 ? "person" : "people"} already on the waitlist
                </p>
              )}
              <div className="mt-6">
                <WaitlistButton categoryId={cat.id} signedIn={!!user} />
              </div>
            </div>
          </section>
        )}

      </div>
    </main>
  );
}
