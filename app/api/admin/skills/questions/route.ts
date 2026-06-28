import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/skills/questions?category_id=<uuid>
 * Admin-only. Lists all questions for a category, INCLUDING the
 * `correct_answer` field (which is hidden from employees by RLS).
 * Optional filter: ?type=mcq|practical&difficulty=1..5
 */
export async function GET(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  const { data: adminRow } = await sb.from("admin_users").select("admin_role").eq("user_id", user.id).maybeSingle();
  if (!adminRow) return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });

  const url = new URL(req.url);
  const categoryId = url.searchParams.get("category_id");
  if (!categoryId) return NextResponse.json({ ok: false, error: "category_id required" }, { status: 400 });

  const admin = createAdminClient();
  let q = admin.from("skill_test_questions")
    .select("id, category_id, question_type, content, correct_answer, grading_rubric, difficulty, time_estimate_seconds, created_at")
    .eq("category_id", categoryId)
    .order("difficulty", { ascending: true })
    .order("created_at", { ascending: true });
  const t = url.searchParams.get("type");
  if (t === "mcq" || t === "practical") q = q.eq("question_type", t);
  const d = Number(url.searchParams.get("difficulty"));
  if (Number.isInteger(d) && d >= 1 && d <= 5) q = q.eq("difficulty", d);

  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, questions: data ?? [] });
}

/**
 * POST /api/admin/skills/questions
 * Body: {
 *   category_id: uuid,
 *   question_type: "mcq" | "practical",
 *   content: { prompt, options?, wage_band?: {min, max} },
 *   correct_answer: <jsonb>,                // for mcq: { option: "..." }; for practical: { rubric: [...] }
 *   grading_rubric?: <jsonb>,
 *   difficulty: 1..5,
 *   time_estimate_seconds?: number
 * }
 */
export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  const { data: adminRow } = await sb.from("admin_users").select("admin_role").eq("user_id", user.id).maybeSingle();
  if (!adminRow) return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });

  const body = await req.json().catch(() => ({} as any));
  const categoryId = String(body.category_id ?? "");
  const questionType = String(body.question_type ?? "");
  const content = body.content;
  const correctAnswer = body.correct_answer;
  const gradingRubric = body.grading_rubric ?? null;
  const difficulty = Math.max(1, Math.min(5, Number(body.difficulty ?? 1)));
  const timeEstimate = Math.max(15, Math.min(1800, Number(body.time_estimate_seconds ?? 90)));

  if (!categoryId) return NextResponse.json({ ok: false, error: "category_id required" }, { status: 400 });
  if (!["mcq", "practical"].includes(questionType)) {
    return NextResponse.json({ ok: false, error: "question_type must be 'mcq' or 'practical'" }, { status: 400 });
  }
  if (!content || typeof content !== "object" || !content.prompt) {
    return NextResponse.json({ ok: false, error: "content.prompt required" }, { status: 400 });
  }
  if (correctAnswer === undefined) {
    return NextResponse.json({ ok: false, error: "correct_answer required" }, { status: 400 });
  }
  if (questionType === "mcq") {
    if (!Array.isArray(content.options) || content.options.length < 2) {
      return NextResponse.json({ ok: false, error: "mcq requires content.options (≥2 strings)" }, { status: 400 });
    }
    if (typeof correctAnswer?.option !== "string" || !content.options.includes(correctAnswer.option)) {
      return NextResponse.json({ ok: false, error: "correct_answer.option must be one of content.options" }, { status: 400 });
    }
  }

  const admin = createAdminClient();
  const { data, error } = await admin.from("skill_test_questions").insert({
    category_id: categoryId,
    question_type: questionType,
    content,
    correct_answer: correctAnswer,
    grading_rubric: gradingRubric,
    difficulty,
    time_estimate_seconds: timeEstimate,
  } as any).select("id").single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, question_id: (data as any).id });
}
