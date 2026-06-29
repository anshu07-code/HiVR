import Link from "next/link";
import { Sparkles, Star, ArrowRight, Award } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CategoryIcon } from "@/components/marketing/category-icon";
import { createClient } from "@/lib/supabase/server";

export async function FeaturedEmployees() {
  const sb = createClient();
  const { data: profiles } = await sb
    .from("employee_profiles")
    .select(`
      user_id, bio, location, avg_rating, total_reviews,
      user:users!employee_profiles_user_id_fkey(id, full_name, avatar_url),
      skills:employee_skills(
        tier, verification_status,
        category:skill_categories(name, icon, status)
      )
    `)
    .gte("avg_rating", 4.5)
    .gte("total_reviews", 3)
    .order("avg_rating", { ascending: false })
    .limit(6);

  if (!profiles || profiles.length === 0) return null;

  return (
    <section className="container py-16">
      <div className="mb-8 flex items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">Featured verified people</h2>
          </div>
          <p className="mt-2 max-w-xl text-muted-foreground text-pretty">
            Employees with 4.5+ stars and 3+ completed contracts. They show up first because they consistently deliver — hire them to keep your project on time.
          </p>
        </div>
        <Button asChild variant="ghost"><Link href="/employees">See all people <ArrowRight className="h-4 w-4" /></Link></Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {profiles.map((p: any) => {
          const skills = (p.skills ?? []).filter((s: any) => s.category?.status === "active").slice(0, 2);
          const initials = ((p.user?.full_name ?? "?").split(" ").map((w: string) => w[0]).slice(0, 2).join("") || "?").toUpperCase();
          return (
            <Card key={p.user_id} className="border-primary/30 ring-1 ring-primary/10 transition-all hover:shadow-md">
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={p.user?.avatar_url ?? undefined} className="object-cover" />
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-display text-base font-semibold">{p.user?.full_name ?? "Anonymous"}</h3>
                      <Badge variant="default" className="text-[10px]"><Sparkles className="mr-1 h-3 w-3" />Top rated</Badge>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      {p.location && <span>{p.location}</span>}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs">
                      <div className="flex items-center gap-0.5 text-amber-500">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className={`h-3 w-3 ${i < Math.round(Number(p.avg_rating ?? 0)) ? "fill-current" : ""}`} />
                        ))}
                      </div>
                      <span className="font-medium">{Number(p.avg_rating ?? 0).toFixed(2)}</span>
                      <span className="text-muted-foreground">· {p.total_reviews} reviews</span>
                    </div>
                  </div>
                </div>
                {p.bio && <p className="line-clamp-2 text-sm text-muted-foreground">{p.bio}</p>}
                {skills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {skills.map((s: any) => (
                      <Badge key={s.category.name} variant={s.category.name.includes("Full") || s.category.name.includes("AI") || s.category.name.includes("NLP") ? "tierB" : "tierA"} className="text-[10px]">
                        <CategoryIcon name={s.category.icon} className="mr-1 h-3 w-3" />
                        {s.category.name}
                      </Badge>
                    ))}
                  </div>
                )}
                <Button asChild variant="gradient" size="sm" className="w-full">
                  <Link href="/dashboard">Hire {p.user?.full_name?.split(" ")[0] ?? ""}</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
