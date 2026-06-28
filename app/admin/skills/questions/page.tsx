import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ChevronLeft, BookOpen } from "lucide-react";
import { QuestionBankAdminClient } from "@/components/admin/question-bank-admin-client";

export const metadata = { title: "Skill question bank — HiVR admin" };
export const dynamic = "force-dynamic";

export default async function AdminSkillQuestionsPage({
  searchParams,
}: {
  searchParams: { category?: string };
}) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/admin/skills/questions");
  const { data: adminRow } = await sb.from("admin_users").select("admin_role").eq("user_id", user.id).maybeSingle();
  if (!adminRow) redirect("/admin");

  // Load active Tier A + Tier B categories (Tier B uses interviews, but they may still have a question bank)
  const { data: categories } = await sb
    .from("skill_categories")
    .select("id, name, slug, tier, status, icon")
    .in("status", ["active", "coming_soon"])
    .order("tier", { ascending: true })
    .order("sort_order", { ascending: true });

  // Default to the first Tier A category if none picked
  const selectedId = searchParams.category ?? (categories ?? []).find((c: any) => c.tier === "micro_task")?.id;

  // Load questions for the selected category (via the admin endpoint which
  // bypasses RLS to return correct_answer)
  let questions: any[] = [];
  if (selectedId) {
    const { data } = await sb
      .from("skill_test_questions")
      .select("id, category_id, question_type, content, correct_answer, grading_rubric, difficulty, time_estimate_seconds, created_at")
      .eq("category_id", selectedId)
      .order("difficulty")
      .order("created_at");
    questions = data ?? [];
  }

  return (
    <div className="container max-w-5xl space-y-6 py-8">
      <div>
        <Link href="/admin" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-3.5 w-3.5" /> Admin
        </Link>
      </div>
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Skill question bank</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage MCQ and practical questions for each category. The test runner picks a randomised selection per attempt and never reveals the correct answer to the employee.
        </p>
      </header>

      {/* Category picker */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4" /> Category
          </CardTitle>
          <CardDescription>Pick a category to view / edit its question bank.</CardDescription>
        </CardHeader>
        <CardContent>
          <form method="get" className="flex flex-wrap items-center gap-2">
            <select
              name="category"
              defaultValue={selectedId ?? ""}
              className="flex h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              {(categories ?? []).map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.tier === "role_engagement" ? "Tier B" : "Tier A"}) · {c.status}
                </option>
              ))}
            </select>
            <Button type="submit" size="sm" variant="outline">Switch</Button>
          </form>
        </CardContent>
      </Card>

      {selectedId ? (
        <QuestionBankAdminClient
          categoryId={selectedId}
          categoryName={(categories ?? []).find((c: any) => c.id === selectedId)?.name ?? "Category"}
          initialQuestions={questions as any[]}
        />
      ) : (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">No categories available yet.</CardContent></Card>
      )}
    </div>
  );
}
