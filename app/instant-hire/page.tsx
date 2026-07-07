import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, ArrowRight } from "lucide-react";
import Link from "next/link";
import NextDynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/server";
import { NotifyButton } from "@/components/instant-hire/notify-button";

const DomeGallery = NextDynamic(() => import("@/components/marketing/dome-gallery").then((m) => m.default), { ssr: false });

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Instant Hire — Coming Soon — HiVR" };

export default async function InstantHirePage() {
  const sb = createClient();
  let user = null;
  try {
    const res = await sb.auth.getUser();
    user = res.data.user;
  } catch {}

  return (
    <main>
      <section className="relative flex min-h-[80vh] items-center overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-32 left-1/2 h-[600px] w-[1100px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute right-0 top-32 h-72 w-72 rounded-full bg-violet-500/10 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-amber-500/10 blur-3xl" />
        </div>
        <div className="container grid items-center gap-12 md:grid-cols-2">
          <div>
            <Badge variant="outline" className="mb-4 border-primary/30 bg-primary/5 px-4 py-1.5 text-xs">
              <Clock className="mr-1.5 h-3.5 w-3.5 text-primary" />
              Coming soon
            </Badge>
            <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight md:text-5xl lg:text-6xl">
              Instant Hire
            </h1>
            <p className="mt-2 font-display text-xl text-muted-foreground/80">
              Hire in seconds. Pay only when done.
            </p>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground text-pretty">
              We&rsquo;re putting the finishing touches on Instant Hire — a one-click way to
              skip bidding and match with verified pros instantly. We&rsquo;ll launch it once
              we have enough active users to serve everyone in the most efficient way possible.
            </p>
            <p className="mt-2 text-sm text-muted-foreground/70 italic">
              Stay tuned — this is going to be a game changer.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {user ? (
                <NotifyButton />
              ) : (
                <Button asChild size="lg" variant="gradient">
                  <Link href="/auth/signup?role=buyer">Get notified <ArrowRight className="h-4 w-4" /></Link>
                </Button>
              )}
              <Button asChild size="lg" variant="outline">
                <Link href="/how-it-works">Learn more</Link>
              </Button>
            </div>
          </div>
          <div className="hidden md:block">
            <div className="relative h-[400px] w-full">
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
        </div>
      </section>
    </main>
  );
}
