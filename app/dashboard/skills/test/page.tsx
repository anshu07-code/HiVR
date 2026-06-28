import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SkillTestRunner } from "./test-runner";
import { CategoryIcon } from "@/components/marketing/category-icon";
import { selectQuestions } from "@/lib/skill-questions";

export default async function SkillTestPage({ searchParams }: { searchParams: { category?: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin");
  if (!searchParams.category) notFound();
  const { data: cat } = await sb.from("skill_categories").select("*").eq("slug", searchParams.category).single();
  if (!cat) notFound();

  // 1. Create a new attempt row so the question selection is stable for this user.
  //    The attempt id becomes the seed for our deterministic PRNG.
  const { data: attempt, error: aErr } = await sb.from("skill_test_attempts").insert({
    employee_id: user.id,
    category_id: cat.id,
    score: 0,
    passed: false,
    answers: {},
    proctoring_flags: { started_at: new Date().toISOString() },
  } as any).select("id").single();
  if (aErr || !attempt) {
    return (
      <div className="container max-w-3xl py-8">
        <Card><CardContent className="p-6 text-sm text-destructive">Failed to start test: {aErr?.message}</CardContent></Card>
      </div>
    );
  }
  const attemptId = (attempt as any).id as string;

  // 2. Load ALL questions for this category (employee-side RLS hides correct_answer,
  //    which is what we want — the client never sees the right answer).
  const { data: allQuestions } = await sb
    .from("skill_test_questions")
    .select("id, question_type, content, difficulty, time_estimate_seconds")
    .eq("category_id", cat.id);

  // 3. Deterministically pick the questions for this attempt.
  const questions = selectQuestions((allQuestions ?? []) as any[], attemptId);

  return (
    <div className="container max-w-3xl space-y-6 py-8">
      <Card>
        <CardContent className="flex items-center gap-4 p-5">
          <div className="grid h-12 w-12 place-items-center rounded-md bg-primary/10 text-primary">
            <CategoryIcon name={cat.icon} className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h1 className="font-display text-2xl font-semibold">{cat.name} — practical test</h1>
            <p className="text-sm text-muted-foreground">Proctored · webcam-on · {questions.length} questions</p>
          </div>
          <Badge variant={cat.tier === "role_engagement" ? "tierB" : "tierA"}>{cat.tier === "role_engagement" ? "Tier B" : "Tier A"}</Badge>
        </CardContent>
      </Card>
      <SkillTestRunner attemptId={attemptId} categoryId={cat.id} questions={questions as any[]} />
    </div>
  );
}
