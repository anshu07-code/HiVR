import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: "Not signed in", status: 401 } as const;
  const { data: adminRow } = await sb.from("admin_users").select("admin_role").eq("user_id", user.id).maybeSingle();
  if (!adminRow) return { error: "Admin only", status: 403 } as const;
  return { user, sb } as const;
}

/**
 * PATCH /api/admin/skills/questions/[id]
 * Body: any subset of { content, correct_answer, grading_rubric, difficulty, time_estimate_seconds, question_type }
 * The category cannot be changed (move by delete + recreate).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const admin = createAdminClient();

  const body = await req.json().catch(() => ({} as any));
  const updates: any = {};
  if (body.content !== undefined) updates.content = body.content;
  if (body.correct_answer !== undefined) updates.correct_answer = body.correct_answer;
  if (body.grading_rubric !== undefined) updates.grading_rubric = body.grading_rubric;
  if (body.difficulty !== undefined) updates.difficulty = Math.max(1, Math.min(5, Number(body.difficulty)));
  if (body.time_estimate_seconds !== undefined) updates.time_estimate_seconds = Math.max(15, Math.min(1800, Number(body.time_estimate_seconds)));
  if (body.question_type !== undefined) {
    if (!["mcq", "practical"].includes(body.question_type)) {
      return NextResponse.json({ ok: false, error: "question_type must be 'mcq' or 'practical'" }, { status: 400 });
    }
    updates.question_type = body.question_type;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: false, error: "no updatable fields provided" }, { status: 400 });
  }

  // If content.options changed, validate correct_answer.option stays valid.
  if (body.content?.options) {
    const { data: existing } = await admin.from("skill_test_questions").select("correct_answer").eq("id", params.id).maybeSingle();
    const opt = (existing as any)?.correct_answer?.option;
    if (opt && !body.content.options.includes(opt)) {
      return NextResponse.json({
        ok: false,
        error: "Cannot remove the option that is the correct answer. Update correct_answer first.",
      }, { status: 400 });
    }
  }

  const { error } = await admin.from("skill_test_questions").update(updates).eq("id", params.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/admin/skills/questions/[id]
 * Hard delete. Use with care — ongoing test attempts reference the row.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const admin = createAdminClient();
  const { error } = await admin.from("skill_test_questions").delete().eq("id", params.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
