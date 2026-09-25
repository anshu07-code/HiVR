import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Lightbulb, MessageSquareText } from "lucide-react";
import { timeAgo } from "@/lib/utils";

export default async function AdminSuggestions() {
  await requireAdmin();
  const sb = createClient();

  const [suggestionsRes, feedbackRes] = await Promise.all([
    sb.from("category_suggestions")
      .select("*, user:users(full_name)")
      .order("created_at", { ascending: false }),
    sb.from("user_feedback")
      .select("*, user:users(full_name)")
      .order("created_at", { ascending: false }),
  ]);

  const suggestions = suggestionsRes.data ?? [];
  const feedback = feedbackRes.data ?? [];

  return (
    <div className="container max-w-4xl space-y-10 py-8">
      {/* Category Suggestions */}
      <section>
        <div className="mb-4">
          <h1 className="font-display text-3xl font-semibold tracking-tight">User Suggestions</h1>
          <p className="text-sm text-muted-foreground">Category and feature suggestions submitted by users.</p>
        </div>
        {suggestions.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-muted-foreground">
            <Lightbulb className="h-10 w-10 mb-3 opacity-40" />
            <p>No suggestions yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {suggestions.map((s: any) => (
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
      </section>

      {/* User Feedback */}
      <section>
        <div className="mb-4">
          <h2 className="font-display text-2xl font-semibold tracking-tight flex items-center gap-2">
            <MessageSquareText className="h-5 w-5" />
            User Feedback
          </h2>
          <p className="text-sm text-muted-foreground">General feedback messages submitted via the feedback button.</p>
        </div>
        {feedback.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-muted-foreground">
            <MessageSquareText className="h-10 w-10 mb-3 opacity-40" />
            <p>No feedback yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {feedback.map((f: any) => (
              <Card key={f.id}>
                <CardContent className="p-4">
                  <p className="text-sm whitespace-pre-line">{f.message}</p>
                  <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{timeAgo(f.created_at)}</span>
                    {f.user && <span>by {f.user.full_name}</span>}
                    {f.page && <span>on <code className="bg-muted px-1 rounded">{f.page}</code></span>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
