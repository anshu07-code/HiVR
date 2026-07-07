import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Lightbulb } from "lucide-react";
import { timeAgo } from "@/lib/utils";

export default async function AdminSuggestions() {
  await requireAdmin();
  const sb = createClient();
  const { data: suggestions } = await sb
    .from("category_suggestions")
    .select("*, user:users(full_name)")
    .order("created_at", { ascending: false });

  return (
    <div className="container max-w-4xl space-y-6 py-8">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">User Suggestions</h1>
        <p className="text-sm text-muted-foreground">Category and feature suggestions submitted by users.</p>
      </div>
      {(suggestions ?? []).length === 0 ? (
        <div className="flex flex-col items-center py-16 text-muted-foreground">
          <Lightbulb className="h-10 w-10 mb-3 opacity-40" />
          <p>No suggestions yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(suggestions ?? []).map((s: any) => (
            <Card key={s.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{s.domain}</span>
                      <Badge variant={s.status === "implemented" ? "live" : s.status === "reviewed" ? "outline" : "soon"}>
                        {s.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground whitespace-pre-line">{s.subcategories}</p>
                    <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{timeAgo(s.created_at)}</span>
                      {s.user && <span>by {s.user.full_name}</span>}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
