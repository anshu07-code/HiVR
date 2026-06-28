import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CategoryIcon } from "@/components/marketing/category-icon";
import Link from "next/link";

export default async function SkillsPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const [{ data: skills }, { data: activeCategories }] = await Promise.all([
    sb.from("employee_skills").select("*, category:skill_categories(name, slug, icon)").eq("employee_id", user.id),
    sb.from("skill_categories").select("id, slug, name, icon, tier").eq("status", "active").eq("tier", "micro_task").order("sort_order"),
  ]);
  return (
    <div className="container max-w-4xl space-y-6 py-8">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Skill verifications</h1>
      <p className="text-sm text-muted-foreground">Pass a practical test to unlock contracts in that category.</p>

      <div className="space-y-2">
        {(skills ?? []).map((s: any) => (
          <Card key={s.id}>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="grid h-10 w-10 place-items-center rounded-md bg-primary/10 text-primary">
                <CategoryIcon name={s.category?.icon ?? "code"} className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="font-semibold">{s.category?.name}</div>
                <div className="text-xs text-muted-foreground capitalize">Status: {s.verification_status.replace(/_/g, " ")}</div>
              </div>
              <Badge variant="success">Verified</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Take a new test</CardTitle>
          <CardDescription>Practical, proctored, 20–60 minutes.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {(activeCategories ?? []).map(c => (
            <Link key={c.id} href={`/dashboard/skills/test?category=${c.slug}`} className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:border-primary/50">
              <div className="grid h-8 w-8 place-items-center rounded-md bg-primary/10 text-primary">
                <CategoryIcon name={c.icon} className="h-4 w-4" />
              </div>
              <div className="flex-1 text-sm font-semibold">{c.name}</div>
              <Button size="sm" variant="outline">Start</Button>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
