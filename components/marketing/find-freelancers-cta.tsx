"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, BadgeCheck, ShieldCheck, Star, Users, Rocket } from "lucide-react";
import CardSwap, { Card } from "./CardSwap";

export function FindFreelancersCTA() {
  return (
    <section className="relative border-t border-border/50 py-16 md:py-24">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-muted/30 via-background to-background" />
      <div className="mx-auto max-w-7xl px-4">
        <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-primary/5 via-primary/[0.02] to-background md:rounded-3xl">
          {/* Decorative gradient blobs */}
          <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-primary/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-20 h-60 w-60 rounded-full bg-primary/5 blur-3xl" />

          <div className="flex flex-col-reverse items-center gap-4 px-6 py-10 md:flex-row md:gap-8 md:px-12 md:py-14">
            {/* Left: text + buttons (1st DOM, reversed to bottom on mobile) */}
            <div className="flex-1 text-center md:text-left">
              {/* HiVR heading — same style as logo */}
              <div className="mb-4 inline-flex items-center gap-1.5">
                <span className="font-display text-2xl font-bold tracking-tight md:text-4xl">
                  <span className="gradient-text">Hi</span>
                  <span className="text-foreground">VR</span>
                </span>
              </div>

              <h2 className="font-display text-2xl font-bold tracking-tight text-foreground md:text-4xl">
                Find the right freelancers for you
              </h2>

              <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-muted-foreground md:mt-5 md:text-base">
                <li className="flex items-start gap-2.5">
                  <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary md:h-5 md:w-5" />
                  <span>Browse verified professionals across every skill category</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Star className="mt-0.5 h-4 w-4 shrink-0 text-primary md:h-5 md:w-5" />
                  <span>Compare profiles, check ratings, and read client reviews</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary md:h-5 md:w-5" />
                  <span>Escrow-protected payments — pay only when you approve</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Users className="mt-0.5 h-4 w-4 shrink-0 text-primary md:h-5 md:w-5" />
                  <span>Hire with confidence from identity-verified talent</span>
                </li>
              </ul>

              <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row md:justify-start">
                <Button asChild size="lg"
                  className="gap-2 rounded-xl bg-primary font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 hover:shadow-primary/30">
                  <Link href="/find-people">
                    <Rocket className="h-4 w-4" />
                    Explore freelancers
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="rounded-xl">
                  <Link href="/browse">
                    Browse open tasks
                  </Link>
                </Button>
              </div>
            </div>

            {/* Right: CardSwap — card container only on mobile */}
            <div className="relative w-full shrink-0 md:w-[520px] md:mt-10">
              <div className="rounded-xl border border-border/50 bg-card p-4 shadow-sm md:border-0 md:bg-transparent md:p-0 md:shadow-none">
                <div className="h-[260px] md:h-[380px]">
                  <CardSwap
                    cardDistance={80}
                    verticalDistance={80}
                    delay={5000}
                    pauseOnHover={false}
                    width={520}
                    height={320}
                  >
<Card style={{ background: '#141E24' }}>
                  <img src="/image.png" alt="" className="h-full w-full object-contain" />
                </Card>
                    <Card style={{ background: '#000' }}>
                      <img src="/card2.png" alt="" className="h-full w-full object-contain" />
                    </Card>
                    <Card style={{ background: '#000' }}>
                      <img src="/card3.png" alt="" className="h-full w-full object-contain" />
                    </Card>
                  </CardSwap>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
