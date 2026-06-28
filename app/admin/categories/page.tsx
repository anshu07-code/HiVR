import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/admin-auth";

export default async function AdminCategories() {
  await requireAdmin();
  const sb = createClient();
  const { data: cats } = await sb.from("skill_categories").select("*").order("sort_order");
  return (
    <div className="container max-w-5xl space-y-6 py-8">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Categories</h1>
        <p className="text-sm text-muted-foreground">Toggle a category to Live to start accepting task posts + skill tests in it.</p>
      </div>
      <div className="space-y-2">
        {(cats ?? []).map((c: any) => (
          <Card key={c.id}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex-1">
                <div className="font-semibold">{c.name}</div>
                <div className="text-xs text-muted-foreground">{c.tier === "role_engagement" ? "Tier B" : "Tier A"} · {c.icon}</div>
              </div>
              <Badge variant={c.status === "active" ? "live" : "soon"}>{c.status === "active" ? "Live" : "Soon"}</Badge>
              <form action={async (fd) => {
                "use server";
                const next = String(fd.get("next"));
                await sb.from("skill_categories").update({ status: next as any }).eq("id", c.id);
                await sb.from("admin_audit_log").insert({
                  actor_id: (await sb.auth.getUser()).data.user!.id,
                  action: `category_status:${next}`,
                  target_table: "skill_categories",
                  target_id: c.id,
                });
              }}>
                <input type="hidden" name="next" value={c.status === "active" ? "coming_soon" : "active"} />
                <Button type="submit" size="sm" variant={c.status === "active" ? "outline" : "gradient"}>
                  {c.status === "active" ? "Set Coming Soon" : "Activate"}
                </Button>
              </form>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
