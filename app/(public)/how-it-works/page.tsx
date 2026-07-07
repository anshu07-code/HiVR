import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight, Search, Users, Briefcase, ShieldCheck, Wallet, Star,
  FileText, MessageSquare, CheckCircle2, Zap,
  ChevronRight, UserPlus, Upload, CreditCard,
  LayoutList, UserCheck, Handshake, FileSignature,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import dynamic from "next/dynamic";

const DomeGallery = dynamic(() => import("@/components/marketing/dome-gallery").then((m) => m.default), { ssr: false });

export const metadata = { title: "How it works — HiVR" };

export default async function HowItWorks() {
  const sb = createClient();
  let user = null;
  try {
    const res = await sb.auth.getUser();
    user = res.data.user;
  } catch {}

  return (
    <main>
      {/* ===== HERO ===== */}
      <section className="relative flex min-h-[80vh] items-center overflow-hidden border-b">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-0">
            <img src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1400&q=80" alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/80 to-background/60" />
          </div>
          <div className="absolute -top-32 left-1/2 h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        </div>
        <div className="container text-center">
          <Badge variant="outline" className="mb-5 border-primary/30 bg-primary/5 px-3 py-1 text-[11px]">
            Three ways to work
          </Badge>
          <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight md:text-5xl lg:text-6xl">
            How HiVR works
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground text-pretty">
            Browse tasks, hire directly, or buy a gig — every path leads to the same secure workspace with escrow protection and identity-verified people.
          </p>
          {user ? (
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg" variant="outline">
                <Link href="/categories">Browse categories <ChevronRight className="h-4 w-4" /></Link>
              </Button>
            </div>
          ) : (
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg" variant="gradient">
                <Link href="/auth/signup?role=buyer">Start hiring <ArrowRight className="h-4 w-4" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/auth/signup?role=employee">Start working</Link>
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* ===== FOR BUYERS ===== */}
      <section className="container py-20">
        <div className="mx-auto max-w-2xl text-center">
          <Badge variant="outline" className="mb-3 border-emerald-300 bg-emerald-50 px-3 py-1 text-[11px] text-emerald-700">
            For buyers
          </Badge>
          <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">Three ways to hire</h2>
          <p className="mt-3 text-muted-foreground text-pretty">
            Post a task and receive proposals, find the right person and hire directly, or buy a fixed-price gig instantly.
          </p>
        </div>

        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {/* Path 1: Browse Tasks */}
          <Card className="border-0 bg-gradient-to-b from-background to-muted/30 shadow-md ring-1 ring-border">
            <CardContent className="p-6">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-sky-100 text-sky-600 shadow-sm ring-1 ring-sky-200">
                <LayoutList className="h-7 w-7" />
              </div>
              <h3 className="mt-5 font-display text-xl font-semibold">Browse tasks</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Describe what you need done — AI helps you write a clear brief. Your task goes live and verified employees apply with proposals. Review profiles, ratings, and past work, then pick the best fit.
              </p>
              <ol className="mt-5 space-y-3">
                {[
                  { icon: FileText, text: "Post a task with AI-assisted description" },
                  { icon: Users, text: "Receive proposals from verified employees" },
                  { icon: Star, text: "Review ratings, portfolios, and response times" },
                  { icon: Handshake, text: "Hire the best fit with one click" },
                ].map((s, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm">
                    <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-sky-100 text-sky-600">
                      <s.icon className="h-3.5 w-3.5" />
                    </div>
                    <span className="pt-1 text-muted-foreground">{s.text}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-6 border-t pt-4">
                <Button asChild variant="outline" className="w-full">
                  <Link href="/browse">Browse open tasks <ChevronRight className="h-3.5 w-3.5" /></Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Path 2: Direct Hire */}
          <Card className="border-0 bg-gradient-to-b from-background to-muted/30 shadow-md ring-1 ring-border md:-mt-4 md:mb-4">
            <CardContent className="p-6">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-violet-100 text-violet-600 shadow-sm ring-1 ring-violet-200">
                <UserCheck className="h-7 w-7" />
              </div>
              <h3 className="mt-5 font-display text-xl font-semibold">Direct hire</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Skip the posting process. Head straight to <strong>Find People</strong>, filter by category, tier, and availability. Browse profiles, check their completed contracts and reviews, and send a direct hire offer — no task post needed.
              </p>
              <ol className="mt-5 space-y-3">
                {[
                  { icon: Search, text: "Filter by skill, tier, rating, availability" },
                  { icon: UserPlus, text: "View identity-verified profiles with portfolios" },
                  { icon: CreditCard, text: "Send a take-it-or-negotiate offer with price & days" },
                  { icon: Handshake, text: "They accept → contract auto-creates" },
                ].map((s, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm">
                    <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-violet-100 text-violet-600">
                      <s.icon className="h-3.5 w-3.5" />
                    </div>
                    <span className="pt-1 text-muted-foreground">{s.text}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-6 border-t pt-4">
                <Button asChild variant="outline" className="w-full">
                  <Link href="/find-people">Find people <ChevronRight className="h-3.5 w-3.5" /></Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Path 3: Gigs */}
          <Card className="border-0 bg-gradient-to-b from-background to-muted/30 shadow-md ring-1 ring-border">
            <CardContent className="p-6">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-100 text-amber-600 shadow-sm ring-1 ring-amber-200">
                <Briefcase className="h-7 w-7" />
              </div>
              <h3 className="mt-5 font-display text-xl font-semibold">Buy a gig</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Prefer fixed scope and price? Browse gigs across 15 categories — logo design, bug fixes, thumbnail creation, SEO audit, and more. Each gig shows delivery time, packages, and seller ratings. Buy instantly without back-and-forth.
              </p>
              <ol className="mt-5 space-y-3">
                {[
                  { icon: Search, text: "Browse gigs by category with clear pricing" },
                  { icon: Star, text: "Compare packages, reviews, and delivery times" },
                  { icon: Zap, text: "Buy instantly — no negotiation needed" },
                  { icon: FileSignature, text: "Auto-contract on purchase, escrow protected" },
                ].map((s, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm">
                    <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-600">
                      <s.icon className="h-3.5 w-3.5" />
                    </div>
                    <span className="pt-1 text-muted-foreground">{s.text}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-6 border-t pt-4">
                <Button asChild variant="outline" className="w-full">
                  <Link href="/categories">Browse categories <ChevronRight className="h-3.5 w-3.5" /></Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ===== FOR EMPLOYEES ===== */}
      <section className="border-y bg-muted/30">
        <div className="container py-20">
          <div className="mx-auto max-w-2xl text-center">
            <Badge variant="outline" className="mb-3 border-sky-300 bg-sky-50 px-3 py-1 text-[11px] text-sky-700">
              For employees
            </Badge>
            <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">Three ways to earn</h2>
            <p className="mt-3 text-muted-foreground text-pretty">
              Apply to tasks, get hired directly, or list your gigs and let buyers come to you.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <Card className="shadow-sm ring-1 ring-border">
              <CardHeader className="pb-2">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-sky-100 text-sky-600">
                  <Search className="h-6 w-6" />
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold">Apply to tasks</h3>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Browse open tasks that match your skills. Submit a proposal with your approach and rate. When the buyer hires you, a contract is created and you start in the workspace.
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-sm ring-1 ring-border md:-mt-4 md:mb-4">
              <CardHeader className="pb-2">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-violet-100 text-violet-600">
                  <UserPlus className="h-6 w-6" />
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold">Get hired directly</h3>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Keep your profile updated with your skills, portfolio, and availability. Buyers browsing Find People can send you a direct offer. Accept it and the contract is live — no proposal needed.
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-sm ring-1 ring-border">
              <CardHeader className="pb-2">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-amber-100 text-amber-600">
                  <Briefcase className="h-6 w-6" />
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold">List gigs</h3>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Create fixed-price gigs with clear packages, delivery times, and scope. Buyers discover your gigs through categories and search. When they buy, everything is automated — no negotiation, no back-and-forth.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ===== WHAT HAPPENS AFTER ===== */}
      <section className="container py-20">
        <div className="mx-auto max-w-2xl text-center">
          <Badge variant="outline" className="mb-3 border-primary/30 bg-primary/5 px-3 py-1 text-[11px]">
            The workspace
          </Badge>
          <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">What happens after you hire</h2>
          <p className="mt-3 text-muted-foreground text-pretty">
            Every hire — whether from a task, direct offer, or gig — opens a shared workspace with the same set of tools.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Wallet, label: "Fund escrow", desc: "Pay the agreed amount into Razorpay escrow. Money is held securely — released only when you approve the work.", color: "text-sky-600 bg-sky-100 ring-sky-200" },
            { icon: MessageSquare, label: "Chat & collaborate", desc: "Real-time messaging with file sharing. Share references, ask questions, and discuss changes without leaving the platform.", color: "text-emerald-600 bg-emerald-100 ring-emerald-200" },
            { icon: Upload, label: "Share files in the vault", desc: "A shared file vault keeps everything organised — upload work, share references, review deliverables. All file types supported.", color: "text-violet-600 bg-violet-100 ring-violet-200" },
            { icon: CheckCircle2, label: "Review & release", desc: "Approve the deliverable to release payment. Request revisions if needed. Funds land in the employee's wallet immediately on approval.", color: "text-amber-600 bg-amber-100 ring-amber-200" },
          ].map((s, i) => (
            <Card key={i} className="shadow-sm ring-1 ring-border">
              <CardContent className="p-6">
                <div className={["grid h-12 w-12 place-items-center rounded-xl ring-1", s.color].join(" ")}>
                  <s.icon className="h-6 w-6" />
                </div>
                <h3 className="mt-4 font-display text-base font-semibold">{s.label}</h3>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{s.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ===== TRUST & SAFETY ===== */}
      <section className="border-y bg-muted/30">
        <div className="container py-20">
          <div className="mx-auto max-w-2xl text-center">
            <Badge variant="outline" className="mb-3 border-emerald-300 bg-emerald-50 px-3 py-1 text-[11px] text-emerald-700">
              Trust & safety
            </Badge>
            <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">Built-in protections</h2>
            <p className="mt-3 text-muted-foreground text-pretty">
              Every feature is designed to keep both parties safe — from identity verification to escrow to dispute resolution.
            </p>
          </div>

          <div className="mt-12 mx-auto max-w-4xl grid gap-4 md:grid-cols-2">
            <Card className="shadow-sm ring-1 ring-border">
              <CardContent className="flex items-start gap-4 p-5">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div>
                  <h3 className="font-display text-sm font-semibold">Identity verification</h3>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">Every employee is verified with government-issued ID. Buyers see verification status before hiring.</p>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-sm ring-1 ring-border">
              <CardContent className="flex items-start gap-4 p-5">
                <Wallet className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div>
                  <h3 className="font-display text-sm font-semibold">Razorpay escrow</h3>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">Funds are held by Razorpay, not by HiVR. Payment releases only when the buyer approves the work.</p>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-sm ring-1 ring-border">
              <CardContent className="flex items-start gap-4 p-5">
                <Star className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div>
                  <h3 className="font-display text-sm font-semibold">Real review system</h3>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">Reviews are tied to completed, paid contracts. No fake reviews — every rating comes from a real transaction.</p>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-sm ring-1 ring-border">
              <CardContent className="flex items-start gap-4 p-5">
                <FileSignature className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div>
                  <h3 className="font-display text-sm font-semibold">Digital contract</h3>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">Every hire generates a legally sound contract with terms, delivery scope, and fund release conditions signed by both parties.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ===== NUMBERS ===== */}
      <section className="container py-16">
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {[
            { kpi: "15", sub: "Active categories" },
            { kpi: "150+", sub: "Subcategories" },
            { kpi: "100%", sub: "Escrow protected" },
            { kpi: "24h", sub: "Typical first response" },
          ].map((s) => (
            <div key={s.sub} className="rounded-xl border bg-card p-6 text-center shadow-sm">
              <div className="font-display text-3xl font-semibold text-primary">{s.kpi}</div>
              <div className="mt-1 text-xs text-muted-foreground">{s.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== COMMUNITY ===== */}
      <section className="border-t bg-gradient-to-b from-background to-muted/20">
        <div className="container py-20">
          <div className="grid items-center gap-12 md:grid-cols-2">
            {/* Left: copy */}
            <div>
              <div className="mb-6">
                <span className="font-display text-4xl font-bold tracking-tight leading-none select-none">
                  <span className="gradient-text">Hi</span>
                  <span className="text-foreground">VR</span>
                </span>
              </div>
              <Badge variant="outline" className="mb-3 border-primary/30 bg-primary/5 px-3 py-1 text-[11px]">
                Community
              </Badge>
              <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
                One Family, Built Together
              </h2>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground text-pretty">
                A community where everyone has a seat at the table.
              </p>
              <p className="mt-3 text-base leading-relaxed text-muted-foreground text-pretty">
                HiVR isn't just a marketplace — it's a collective of creative minds, problem solvers,
                and visionary buyers who treat each other like family. We believe that professional
                growth shouldn't be lonely. Here, we look out for one another with guaranteed fair
                terms, absolute transparency, and mutual respect. Whether you are providing the vision
                or bringing it to life, you aren't just a user; you are a co-creator of this ecosystem.
                Let's lift each other up and build something beautiful, together.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg" variant="gradient">
                  <Link href="/auth/signup?role=buyer">Join as a buyer <ArrowRight className="h-4 w-4" /></Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/auth/signup?role=employee">Join as an employee</Link>
                </Button>
              </div>
            </div>
            {/* Right: 3D dome gallery */}
            <DomeGallery
              fit={0.6}
              minRadius={420}
              maxVerticalRotationDeg={0}
              segments={34}
              dragDampening={2}
              overlayBlurColor="transparent"
              grayscale={false}
            />
          </div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      {!user && (
        <section className="border-t">
        <div className="container flex min-h-[70vh] flex-col items-center justify-center py-24 text-center">
            <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">Ready to get started?</h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground text-pretty">
              Join HiVR today — whether you want to hire verified talent or earn with your skills.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg" variant="gradient">
                <Link href="/auth/signup?role=buyer">Hire someone <ArrowRight className="h-4 w-4" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/auth/signup?role=employee">Become an employee</Link>
              </Button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
