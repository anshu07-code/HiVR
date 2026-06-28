import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/server";
import { Star, Sparkles, Award, EyeOff, TrendingUp } from "lucide-react";

export const TopProsSection = async () => {
  const sb = createClient();

  const { data: topPros } = await sb
    .from("anonymous_profiles")
    .select(`
      user_id, display_id, display_label, tier, bio_public,
      hourly_rate_paise, task_rate_paise, daily_rate_paise, weekly_rate_paise, monthly_rate_paise,
      employee_profiles!inner(
        avg_rating, total_reviews, completion_rate, languages, location,
        skills:employee_skills(
          tier, verification_status,
          category:skill_categories(id, slug, name, icon, tier, status, parent_category_id)
        )
      )
    `)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(6) as any;

  if (!topPros || topPros.length === 0) return null;

  return (
    <section className="mb-8">
      <div className="mb-4 flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-primary to-purple-600 text-white">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold">Top Pros — Anonymous</h2>
          <p className="text-xs text-muted-foreground">
            Skilled professionals who choose to keep their identity private. Their work speaks for itself.
          </p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {topPros.map((ap: any) => {
          const ep = ap.employee_profiles;
          const skills = (ep?.skills ?? []).filter((s: any) => s.category?.status === "active" && s.verification_status === "verified");
          const rating = Number(ep?.avg_rating ?? 0);
          const reviews = Number(ep?.total_reviews ?? 0);
          const ratePaise = ap.hourly_rate_paise ?? ap.task_rate_paise ?? ap.daily_rate_paise ?? null;

          return (
            <Card key={ap.user_id} className="border-primary/20 ring-1 ring-primary/5 transition-all hover:border-primary/40 hover:shadow-md">
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start gap-3">
                  <div className="relative">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback className="bg-gradient-to-br from-primary/20 to-purple-600/20 text-primary">
                        <EyeOff className="h-5 w-5" />
                      </AvatarFallback>
                    </Avatar>
                    <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-[8px] text-white ring-2 ring-card">
                      <Award className="h-3 w-3" />
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-display text-base font-semibold">
                        {ap.display_id ?? "Top Pro"}
                      </h3>
                      <Badge variant={ap.tier === "A" ? "tierA" : "tierB"} className="text-[10px]">
                        <TrendingUp className="mr-0.5 h-3 w-3" />
                        Tier {ap.tier}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs">
                      <div className="flex items-center gap-0.5 text-amber-500">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className={`h-3 w-3 ${i < Math.round(rating) ? "fill-current" : ""}`} />
                        ))}
                      </div>
                      <span className="font-medium">{rating.toFixed(2)}</span>
                      <span className="text-muted-foreground">({reviews} review{reviews === 1 ? "" : "s"})</span>
                    </div>
                    {ap.location && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{ap.location}</p>
                    )}
                  </div>
                </div>

                {ap.bio_public && (
                  <p className="line-clamp-2 text-sm text-muted-foreground">{ap.bio_public}</p>
                )}

                {skills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {skills.slice(0, 3).map((s: any) => (
                      <Badge key={s.category.id} variant={s.category.tier === "role_engagement" ? "tierB" : "tierA"} className="text-[10px]">
                        {s.category.name}
                      </Badge>
                    ))}
                    {skills.length > 3 && <span className="text-xs text-muted-foreground">+{skills.length - 3} more</span>}
                  </div>
                )}

                <div className="flex items-center justify-between border-t pt-3">
                  {ratePaise ? (
                    <span className="font-mono text-sm font-semibold">
                      ₹{(ratePaise / 100).toLocaleString("en-IN")}
                      {ap.hourly_rate_paise ? "/hr" : ap.daily_rate_paise ? "/day" : "/task"}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Pricing on request</span>
                  )}
                  <Badge variant="secondary" className="text-[10px]">
                    <Sparkles className="mr-0.5 h-3 w-3" />
                    Smart Match boost
                  </Badge>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
};
