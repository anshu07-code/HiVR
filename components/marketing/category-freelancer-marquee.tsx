"use client";

import * as React from "react";
import Link from "next/link";
import { Star, Users, MapPin, ArrowRight, MessageSquare, BadgeCheck, DollarSign } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatPaise } from "@/lib/utils";

type Employee = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  profile: {
    user_id: string;
    bio: string | null;
    headline: string | null;
    location: string | null;
    avg_rating: number | null;
    total_reviews: number | null;
    completion_rate: number | null;
    experience_type: string | null;
    overall_trust_tier: string | null;
  } | null;
  skills: Array<{
    id: string;
    category_id: string;
    verification_status: string | null;
    current_wage_band_min: number | null;
    current_wage_band_max: number | null;
    category: { id: string; slug: string; name: string; icon: string; tier: string } | null;
  }>;
};

export function CategoryFreelancerMarquee({
  employees,
  categoryName,
  categorySlug,
  targetIds,
}: {
  employees: Employee[];
  categoryName: string;
  categorySlug: string;
  targetIds: string[];
}) {
  if (employees.length === 0) return null;

  // Duplicate for seamless scroll
  const reversed = [...employees].reverse();
  const row1 = [...employees, ...employees];
  const row2 = [...reversed, ...reversed];

  return (
    <section>
      <div className="mb-8 flex items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
              <Users className="h-4 w-4" />
            </div>
            <h2 className="font-display text-3xl font-semibold tracking-tight">Top {categoryName} freelancers</h2>
          </div>
          <p className="mt-1 text-muted-foreground">Scroll to browse — hover to pause</p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href={`/employees?category=${categorySlug}`}>
            Explore <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </div>

      <div className="space-y-4">
        <MarqueeRow employees={row1} direction="left" targetIds={targetIds} categorySlug={categorySlug} />
        <MarqueeRow employees={row2} direction="right" targetIds={targetIds} categorySlug={categorySlug} />
      </div>
    </section>
  );
}

function MarqueeRow({
  employees,
  direction,
  targetIds,
  categorySlug,
}: {
  employees: Employee[];
  direction: "left" | "right";
  targetIds: string[];
  categorySlug: string;
}) {
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const [paused, setPaused] = React.useState(false);

  return (
    <div
      ref={scrollerRef}
      className="relative overflow-hidden rounded-xl border border-border/50 bg-card/50 py-3"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <style>{`
        @keyframes scroll-left {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes scroll-right {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0); }
        }
      `}</style>
      <div
        className="flex gap-4"
        style={{
          width: "fit-content",
          animation: paused
            ? "none"
            : `${direction === "left" ? "scroll-left" : "scroll-right"} 40s linear infinite`,
        }}
      >
        {employees.map((emp, i) => {
          const categorySkills = (emp.skills ?? []).filter(
            (s) => s.category && targetIds.includes(s.category_id)
          );
          const rateMin =
            categorySkills.length > 0
              ? Math.min(...categorySkills.map((s) => s.current_wage_band_min ?? Infinity))
              : null;
          const rateMax =
            categorySkills.length > 0
              ? Math.max(...categorySkills.map((s) => s.current_wage_band_max ?? 0))
              : null;
          const rating = emp.profile?.avg_rating != null ? Number(emp.profile?.avg_rating) : null;
          const initials = (
            emp.full_name ?? "?"
          )
            .split(" ")
            .map((w: string) => w[0])
            .slice(0, 2)
            .join("")
            .toUpperCase();

          return (
            <Card
              key={`${emp.id}-${i}`}
              className="w-[260px] shrink-0 border-0 bg-gradient-to-br from-card to-muted/30 ring-1 ring-border transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:ring-primary/30"
            >
              <div className="p-4 space-y-3">
                {/* Avatar + name */}
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Avatar className="h-11 w-11 ring-2 ring-background shadow-sm">
                      <AvatarImage
                        src={emp.avatar_url ?? undefined}
                        alt={emp.full_name ?? "Profile"}
                        className="object-cover"
                      />
                      <AvatarFallback className="text-xs font-semibold">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    {categorySkills.some(
                      (s) =>
                        s.verification_status === "verified" ||
                        s.verification_status === "top_rated"
                    ) && (
                      <span className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full bg-emerald-500 text-white ring-1 ring-background">
                        <BadgeCheck className="h-2.5 w-2.5" />
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/people/${emp.id}`}
                      className="truncate block font-display text-sm font-semibold hover:underline leading-tight"
                    >
                      {emp.full_name ?? "Anonymous"}
                    </Link>
                    {emp.profile?.headline && (
                      <p className="truncate text-[10px] text-muted-foreground leading-tight mt-0.5">
                        {emp.profile?.headline}
                      </p>
                    )}
                  </div>
                </div>

                {/* Rating */}
                <div className="flex items-center gap-2 text-xs">
                  <div className="flex items-center gap-0.5 text-amber-500">
                    <Star className="h-3 w-3 fill-current" />
                    <span className="font-semibold text-foreground">
                      {rating != null ? rating.toFixed(1) : "—"}
                    </span>
                  </div>
                  <span className="text-muted-foreground">
                    ({(emp.profile?.total_reviews ?? 0) ?? 0})
                  </span>
                  {emp.profile?.location && (
                    <>
                      <span className="text-muted-foreground/40">·</span>
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        <span className="truncate max-w-[60px]">{emp.profile?.location}</span>
                      </span>
                    </>
                  )}
                </div>

                {/* Category-specific rate */}
                {rateMin && rateMax ? (
                  <div className="flex items-center justify-between rounded-lg bg-primary/5 px-3 py-2">
                    <div className="flex items-center gap-1.5 text-xs">
                      <DollarSign className="h-3 w-3 text-emerald-500" />
                      <span className="font-semibold">
                        {formatPaise(rateMin)}–{formatPaise(rateMax)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">/ task</span>
                    </div>
                    <Badge variant="outline" className="text-[9px] h-5 px-1.5">
                      {categorySkills.length} skill{categorySkills.length === 1 ? "" : "s"}
                    </Badge>
                  </div>
                ) : null}

                {/* Skills badges */}
                {categorySkills.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {categorySkills.slice(0, 2).map((s) => (
                      <Badge
                        key={s.id}
                        variant={
                          s.category?.tier === "role_engagement" ? "tierB" : "tierA"
                        }
                        className="text-[9px] h-5"
                      >
                        {s.category?.name}
                      </Badge>
                    ))}
                    {categorySkills.length > 2 && (
                      <span className="text-[9px] text-muted-foreground self-center">
                        +{categorySkills.length - 2}
                      </span>
                    )}
                  </div>
                )}

                {/* Connect button */}
                <Button asChild size="sm" className="w-full h-8 text-xs gap-1.5">
                  <Link href={`/people/${emp.id}`}>
                    <Users className="h-3 w-3" />
                    View profile
                  </Link>
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Gradient fades on edges */}
      <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-background via-background/80 to-transparent z-10" />
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-background via-background/80 to-transparent z-10" />
    </div>
  );
}
