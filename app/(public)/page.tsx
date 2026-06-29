import Link from "next/link";
import { ArrowRight, ShieldCheck, Wallet, Sparkles, ChevronRight, Check, Clock, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CategoryGrid } from "@/components/marketing/category-grid";
import { FeaturedEmployees } from "@/components/marketing/featured-employees";
import { FeaturedTasks } from "@/components/marketing/featured-tasks";
import { HiVRShowcaseVideo } from "@/components/marketing/showcase-video";
import { HeroVisual } from "@/components/marketing/hero-visual";
import { SignupBonusBanner } from "@/components/marketing/signup-bonus-banner";
import { createClient } from "@/lib/supabase/server";

// Always fetch fresh — these counts must update the moment a category is
// flipped Live, a sample task is seeded, or a featured employee signs up.
export const revalidate = 0;

export default async function HomePage() {
  const sb = createClient();
  const { data: categories } = await sb
    .from("skill_categories")
    .select("id, slug, name, icon, description, tier, status, sort_order")
    .order("sort_order");

  let user = null;
  try {
    const res = await sb.auth.getUser();
    user = res.data.user;
  } catch {
    // fallback if token refresh races with middleware
  }

  return (
    <>
      {user && (
        <div className="container pt-4">
          <SignupBonusBanner userId={user.id} />
        </div>
      )}
      <main>
        {/* HERO */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute -top-32 left-1/2 h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
            <div className="absolute right-0 top-32 h-72 w-72 rounded-full bg-primary/5 blur-3xl" />
          </div>
          <div className="container grid items-center gap-12 py-16 md:grid-cols-2 md:py-24">
            <div>
              <Badge variant="tierA" className="mb-5">Now live — 3 Active categories</Badge>
              <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight text-balance md:text-5xl lg:text-6xl">
                Small jobs.<br />
                <span className="gradient-text">Verified people.</span>
              </h1>
              <p className="mt-5 max-w-xl text-lg text-muted-foreground text-pretty">
                HiVR breaks work into hireable micro-tasks — fix one bug, clean one spreadsheet, solve one doubt, build one endpoint. Hire by the hour, day, task, or month. Identity-verified, escrow-protected, no off-platform leakage.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Button asChild size="lg" variant="gradient">
                  <Link href="/auth/signup?role=buyer">Hire someone <ArrowRight className="h-4 w-4" /></Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/auth/signup?role=employee">Become an Employee</Link>
                </Button>
              </div>
              <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                <li className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-success" />Aadhaar / PAN verified</li>
                <li className="inline-flex items-center gap-1.5"><Wallet className="h-4 w-4 text-success" />Razorpay escrow</li>
                <li className="inline-flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-success" />AI assist built in</li>
              </ul>
            </div>
            <HeroVisual />
          </div>
        </section>

        {/* TRUST BAR */}
        <section className="border-y bg-muted/30">
          <div className="container grid grid-cols-2 gap-6 py-8 text-center md:grid-cols-4">
            {[
              { kpi: "Identity-verified", sub: "Aadhaar, PAN, optional DL/Passport" },
              { kpi: "Escrow-protected",  sub: "Razorpay Route, never our bank" },
              { kpi: "Skill-tested",      sub: "Practical tests, not just resumes" },
              { kpi: "On-platform only",  sub: "Anti-circumvention built in" },
            ].map(b => (
              <div key={b.kpi}>
                <div className="font-display text-base font-semibold">{b.kpi}</div>
                <div className="text-xs text-muted-foreground">{b.sub}</div>
              </div>
            ))}
          </div>
        </section>

        {/* TWO-TIER EXPLAINER */}
        <section className="container py-16">
          <div className="mb-8 max-w-2xl">
            <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">Two kinds of work, two different rails.</h2>
            <p className="mt-3 text-muted-foreground text-pretty">
              "Fix my bug" and "build my MVP" are not the same product. We don't pretend they are.
            </p>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <Card>
              <CardContent className="space-y-3 p-6">
                <Badge variant="tierA">Tier A — Micro-Tasks</Badge>
                <h3 className="font-display text-xl font-semibold">Bounded, single-sitting work</h3>
                <p className="text-sm text-muted-foreground">
                  Spreadsheet &amp; data work, tech bug fixes, live mentoring. Billed by the hour, day, month, or fixed-per-task. Automated practical test to join.
                </p>
                <ul className="space-y-1.5 text-sm">
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-success" />Fast onboarding (auto-test)</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-success" />Higher volume, lower price floor</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-success" />Live in: Spreadsheet &amp; Data, Tech Micro-Tasks, Mentoring</li>
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-3 p-6">
                <Badge variant="tierB">Tier B — Role Engagements</Badge>
                <h3 className="font-display text-xl font-semibold">Multi-week project capacity</h3>
                <p className="text-sm text-muted-foreground">
                  Full Stack, AI/ML, NLP, Mobile, DevOps, Design. Billed per day or per milestone — never hourly. Portfolio review + live technical interview to join.
                </p>
                <ul className="space-y-1.5 text-sm">
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-success" />Milestone-based escrow for stage payouts</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-success" />Higher revenue per contract</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-success" />Live in: Full Stack, AI/ML, NLP</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* VIDEO PANEL — 60s product tour */}
        <HiVRShowcaseVideo
          src="/videos/hivr-showcase.mp4"
          poster="/videos/hivr-showcase.jpg"
        />

        {/* CATEGORIES */}
        <section className="border-t bg-muted/20 py-16">
          <div className="container">
            <div className="mb-8 flex items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">What you can hire for</h2>
                <p className="mt-2 max-w-xl text-muted-foreground">
                  We launch new categories every month based on real waitlist demand. Join a waitlist today; get notified when it goes live.
                </p>
              </div>
              <Button asChild variant="ghost"><Link href="/categories">See all categories <ChevronRight className="h-4 w-4" /></Link></Button>
            </div>
            <CategoryGrid categories={categories ?? []} />
          </div>
        </section>

        {/* FEATURED OPEN TASKS — visible to everyone, no login required */}
        <FeaturedTasks />

        {/* FEATURED EMPLOYEES */}
        <FeaturedEmployees />

        {/* HOW IT WORKS */}
        <section className="container py-16">
          <h2 className="mb-8 font-display text-3xl font-semibold tracking-tight md:text-4xl">How it works</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              { n: 1, t: "Post your task", d: "Pick a category, describe the work, set budget. AI helps tighten your description." },
              { n: 2, t: "Hire a verified person", d: "Browse skill-tested employees with transparent reviews and response times. Hire now or message first." },
              { n: 3, t: "Pay only on approval", d: "Funds sit in Razorpay escrow. Approve the deliverable and we release — minus a fair platform fee." },
            ].map(s => (
              <Card key={s.n}>
                <CardContent className="p-6">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 font-display text-base font-semibold text-primary">{s.n}</div>
                  <h3 className="mt-3 font-display text-lg font-semibold">{s.t}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* TESTIMONIAL placeholder */}
        <section className="border-t bg-muted/20 py-16">
          <div className="container grid gap-6 md:grid-cols-2">
            <Card>
              <CardContent className="p-6">
                <div className="flex gap-0.5 text-amber-500">{Array.from({ length: 5 }).map((_, i) => <Star key={i} className="h-4 w-4 fill-current" />)}</div>
                <p className="mt-3 text-pretty">"I hired someone to clean six months of vendor invoices from photographed receipts in two days. The receipt OCR was always 80% right and a human made the judgment calls. I couldn't have done that with a chatbot."</p>
                <p className="mt-3 text-sm text-muted-foreground">— A. Sharma, operations lead, Bangalore</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex gap-0.5 text-amber-500">{Array.from({ length: 5 }).map((_, i) => <Star key={i} className="h-4 w-4 fill-current" />)}</div>
                <p className="mt-3 text-pretty">"As a Tier B engineer I get matched with founders who actually want real work, not 'fix my one bug and disappear.' The milestone escrow protects both of us."</p>
                <p className="mt-3 text-sm text-muted-foreground">— R. Iyer, full-stack engineer, Pune</p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* CTA */}
        <section className="container py-16">
          <Card className="overflow-hidden">
            <CardContent className="grid gap-6 p-10 md:grid-cols-[1.4fr,1fr] md:items-center">
              <div>
                <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl text-balance">
                  Ready to hire — or to be hired?
                </h2>
                <p className="mt-2 text-muted-foreground text-pretty">
                  Post your first task in minutes, or take a 20-minute skill test to start earning today.
                </p>
              </div>
              <div className="flex flex-wrap gap-3 md:justify-end">
                <Button asChild size="lg" variant="gradient">
                  <Link href="/auth/signup?role=buyer">Hire someone <ArrowRight className="h-4 w-4" /></Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/auth/signup?role=employee">Start earning</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>    </>
  );
}

