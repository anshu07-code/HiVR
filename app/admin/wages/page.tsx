import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CategoryIcon } from "@/components/marketing/category-icon";
import { updateWageBand } from "./actions";
import { Save } from "lucide-react";
import { formatINR } from "@/lib/utils";
import { requireAdmin } from "@/lib/admin-auth";

export const metadata = { title: "Wage bands — HiVR admin" };
export const revalidate = 0;

export default async function AdminWagesPage() {
  await requireAdmin();
  const sb = createClient();
  const { data: categories } = await sb
    .from("skill_categories")
    .select("id, slug, name, icon, tier, status, wage_band_min_paise, wage_band_max_paise, parent_category_id")
    .order("sort_order");

  const all = categories ?? [];
  const parents = all.filter(c => c.parent_category_id === null);

  return (
    <div className="container max-w-4xl space-y-6 py-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Wage bands</h1>
        <p className="text-sm text-muted-foreground">Per-category wage ranges. Visible to buyers and employees on every category card.</p>
      </header>

      <div className="space-y-3">
        {parents.map(p => (
          <Card key={p.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <CategoryIcon name={p.icon} className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">{p.name}</CardTitle>
                <Badge variant={p.tier === "role_engagement" ? "tierB" : "tierA"}>
                  {p.tier === "role_engagement" ? "Tier B" : "Tier A"}
                </Badge>
              </div>
              <CardDescription className="text-xs">Default range for this whole category. Subcategories inherit unless overridden.</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={async (fd) => { "use server"; await updateWageBand(fd); }} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="category_id" value={p.id} />
                <div>
                  <Label htmlFor={`min-${p.id}`} className="text-xs">Min (₹)</Label>
                  <Input
                    id={`min-${p.id}`}
                    name="min_rupees"
                    type="number"
                    min={0}
                    step={100}
                    defaultValue={Math.round((p.wage_band_min_paise ?? 0) / 100)}
                    className="w-32"
                  />
                </div>
                <div>
                  <Label htmlFor={`max-${p.id}`} className="text-xs">Max (₹)</Label>
                  <Input
                    id={`max-${p.id}`}
                    name="max_rupees"
                    type="number"
                    min={0}
                    step={100}
                    defaultValue={Math.round((p.wage_band_max_paise ?? 0) / 100)}
                    className="w-32"
                  />
                </div>
                <Button type="submit" size="sm">
                  <Save className="h-3.5 w-3.5" />Save
                </Button>
                <span className="ml-auto text-xs text-muted-foreground">
                  Currently: {formatINR(Math.round((p.wage_band_min_paise ?? 0) / 100))} – {formatINR(Math.round((p.wage_band_max_paise ?? 0) / 100))}
                </span>
              </form>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
