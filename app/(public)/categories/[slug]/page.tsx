import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/server";
import { CategoryIcon } from "@/components/marketing/category-icon";
import { CategoryFreelancerMarquee } from "@/components/marketing/category-freelancer-marquee";
import { WaitlistButton } from "./waitlist-button";
import {
  ArrowLeft, Briefcase, Clock, ArrowRight, Sparkles, Users,
  CheckCircle2, Search, MessageSquare, Star, TrendingUp,
  ChevronRight, Zap, MapPin, Award, BadgeCheck, DollarSign,
  GraduationCap, Handshake
} from "lucide-react";
import { formatINR, formatPaise, timeAgo } from "@/lib/utils";
import { unstable_noStore as noStore } from "next/cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CategoryPage({ params }: { params: { slug: string } }) {
  noStore();
  const sb = createClient();

  const { data: cat } = await sb
    .from("skill_categories")
    .select("*")
    .eq("slug", params.slug)
    .single();
  if (!cat) notFound();

  const isParent = !cat.parent_category_id;

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
    .select("id, title, description, pricing_model, budget_min, budget_max, tier, status, created_at, category:skill_categories(slug, name, icon, tier)")
    .eq("status", "open")
    .in("category_id", targetIds)
    .order("created_at", { ascending: false })
    .limit(8);

  if (tasksErr) {
    console.error("[category] tasks fetch failed:", tasksErr);
  }

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

  const themeColors: Record<string, string> = {
    design: "from-violet-500 via-purple-500 to-pink-500",
    development: "from-blue-600 via-indigo-500 to-violet-500",
    marketing: "from-emerald-400 via-teal-400 to-cyan-400",
    writing: "from-rose-400 via-pink-400 to-fuchsia-400",
    video: "from-orange-400 via-red-400 to-rose-400",
    music: "from-amber-400 via-yellow-400 to-orange-400",
    business: "from-sky-400 via-blue-400 to-indigo-400",
    lifestyle: "from-green-400 via-emerald-400 to-teal-400",
  };
  const heroGrad = themeColors[cat.slug] ?? "from-primary via-primary/80 to-primary/60";

  return (
    <main>
      {/* ===== HERO ===== */}
      <section className={`relative overflow-hidden bg-gradient-to-br ${heroGrad}`}>
        <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-white/10 blur-3xl animate-pulse" style={{ animationDuration: "6s" }} />
        <div className="pointer-events-none absolute -bottom-32 -right-32 h-80 w-80 rounded-full bg-white/5 blur-3xl animate-pulse" style={{ animationDuration: "8s", animationDelay: "2s" }} />
        <div className="pointer-events-none absolute left-1/2 top-0 h-px w-1/2 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
        <div className="pointer-events-none absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyek0zNiAyNHYySDI0di0yaDEyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-30" />

        <div className="container relative py-20 md:py-28">
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
                      {cat.tier === "role_engagement" ? "Role Engagement" : "Micro-Task"}
                    </Badge>
                    {cat.status === "active" ? (
                      <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-400/30 text-[11px] font-medium px-2.5 py-0.5">
                        <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />Live
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-500/20 text-amber-300 border-amber-400/30 text-[11px] font-medium px-2.5 py-0.5">
                        Coming soon
                      </Badge>
                    )}
                  </div>
                  <h1 className="font-display text-4xl font-bold tracking-tight text-white md:text-5xl lg:text-6xl">
                    {cat.name}
                  </h1>
                </div>
              </div>
              <p className="text-lg text-white/80 text-pretty leading-relaxed max-w-xl">
                {cat.description}
              </p>

              {cat.status === "active" && (
                <div className="mt-8 flex flex-wrap gap-6">
                  <div className="flex items-center gap-2.5 rounded-xl bg-white/10 backdrop-blur-sm px-4 py-2.5 ring-1 ring-white/10">
                    <Briefcase className="h-4 w-4 text-emerald-300" />
                    <div>
                      <p className="text-lg font-bold text-white leading-none">{(tasks ?? []).length}</p>
                      <p className="text-[11px] text-white/60">open tasks</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 rounded-xl bg-white/10 backdrop-blur-sm px-4 py-2.5 ring-1 ring-white/10">
                    <Users className="h-4 w-4 text-blue-300" />
                    <div>
                      <p className="text-lg font-bold text-white leading-none">{employeeCount}</p>
                      <p className="text-[11px] text-white/60">{employeeCount === 1 ? "employee" : "employees"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 rounded-xl bg-white/10 backdrop-blur-sm px-4 py-2.5 ring-1 ring-white/10">
                    <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                    <div>
                      <p className="text-lg font-bold text-white leading-none">{Math.max((tasks ?? []).length, 1)}</p>
                      <p className="text-[11px] text-white/60">categories</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-8 flex flex-wrap gap-3 items-center">
                {!user && (
                  <Button asChild size="lg" className="bg-white text-primary hover:bg-white/90 shadow-xl shadow-black/20 font-semibold px-8">
                    <Link href="/join">
                      Join HiVR
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                )}
                {cat.status === "active" && (
                  <Button asChild size="lg" variant="outline" className="border-white/30 text-white hover:bg-white/10 hover:text-white">
                    <Link href={`/browse?category=${cat.slug}`}>Browse tasks</Link>
                  </Button>
                )}
              </div>
            </div>

            {cat.status === "active" && (tasks ?? []).length > 0 && (
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

        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-background to-transparent" />
      </section>

      <div className="container py-12 space-y-20">

        {/* ===== SUBCATEGORIES ===== */}
        {isParent && children.length > 0 && (
          <section>
            <div className="mb-8 text-center">
              <h2 className="font-display text-3xl font-semibold tracking-tight">Explore {cat.name}</h2>
              <p className="mt-2 text-muted-foreground max-w-xl mx-auto">
                Choose a subcategory to browse tasks or find the right freelancer for your project
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {children.map((ch: any) => {
                const taskCount = taskCountByCat[ch.id] ?? 0;
                return (
                  <Card key={ch.id} className="group overflow-hidden border-0 bg-card shadow-sm ring-1 ring-border transition-all duration-300 hover:shadow-xl hover:ring-primary/30 hover:-translate-y-1">
                    <div className="relative h-40 overflow-hidden bg-gradient-to-br from-primary/5 to-primary/20">
                      <img
                        src={`https://picsum.photos/seed/${ch.slug}/600/300`}
                        alt={ch.name}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                      <div className="absolute bottom-3 left-3 flex items-center gap-2">
                        <div className="grid h-8 w-8 place-items-center rounded-lg bg-white/20 backdrop-blur-md text-white ring-1 ring-white/20">
                          <CategoryIcon name={ch.icon} className="h-4 w-4" />
                        </div>
                        <h3 className="font-display font-semibold text-white drop-shadow-sm">{ch.name}</h3>
                      </div>
                    </div>

                    <CardContent className="p-4 space-y-3">
                      {ch.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                          {ch.description}
                        </p>
                      )}
                      <div className="flex items-center justify-between text-xs">
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {taskCount} open task{taskCount === 1 ? "" : "s"}
                        </Badge>
                        {ch.wage_band_min_paise && (
                          <span className="text-muted-foreground">
                            {formatPaise(ch.wage_band_min_paise)}–{formatPaise(ch.wage_band_max_paise)}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Button asChild size="sm" variant="gradient" className="flex-1 text-[11px] h-8">
                          <Link href={`/browse?category=${ch.slug}`}>
                            <Briefcase className="mr-1 h-3 w-3" />Browse tasks
                          </Link>
                        </Button>
                        <Button asChild size="sm" variant="outline" className="flex-1 text-[11px] h-8">
                          <Link href={`/employees?category=${ch.slug}`}>
                            <Users className="mr-1 h-3 w-3" />Freelancers
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        {/* ===== HOW IT WORKS ===== */}
        {cat.status === "active" && (
          <section>
            <div className="text-center mb-10">
              <h2 className="font-display text-3xl font-semibold tracking-tight">How {cat.name} works on HiVR</h2>
              <p className="mt-2 text-muted-foreground max-w-xl mx-auto">
                Whether you&apos;re hiring or looking for work, we&apos;ve got you covered
              </p>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
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

        {/* ===== OPEN TASKS ===== */}
        {cat.status === "active" && (
          <section>
            <div className="mb-8 flex items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-3xl font-semibold tracking-tight">Open tasks in {cat.name}</h2>
                <p className="mt-1 text-muted-foreground">{(tasks ?? []).length} task{(tasks ?? []).length === 1 ? "" : "s"} waiting for proposals</p>
              </div>
              {(tasks ?? []).length >= 5 && (
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/browse?category=${cat.slug}`}>
                    View all <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              )}
            </div>

            {(tasks ?? []).length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-4 p-16 text-center">
                  <div className="grid h-16 w-16 place-items-center rounded-full bg-muted ring-1 ring-border">
                    <Briefcase className="h-7 w-7 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-semibold">No open tasks yet</h3>
                    <p className="mt-1 max-w-md text-sm text-muted-foreground">
                      Be the first to post in {cat.name} and get matched with vetted freelancers.
                    </p>
                  </div>
                  <Button asChild variant="gradient">
                    <Link href="/dashboard/post">Post the first task</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {tasks.map((p: any) => (
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
        {cat.status === "active" && topEmployees.length > 0 && (
          <CategoryFreelancerMarquee
            employees={topEmployees as any}
            categoryName={cat.name}
            categorySlug={cat.slug}
            targetIds={targetIds}
          />
        )}

        {/* ===== CTA BANNER ===== */}
        {cat.status === "active" && (
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
                    <Button asChild variant="gradient" size="lg">
                      <Link href="/dashboard/post">Post a task</Link>
                    </Button>
                    <Button asChild variant="outline" size="lg">
                      <Link href={`/browse?category=${cat.slug}`}>Browse open tasks</Link>
                    </Button>
                  </>
                ) : (
                  <Button asChild size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/25 font-semibold px-10">
                    <Link href="/join">
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
        {cat.status !== "active" && (
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
