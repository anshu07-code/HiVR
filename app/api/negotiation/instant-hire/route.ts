import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  SecurityError,
  requireUuid,
  enforceRateLimit,
} from "@/lib/security";

const MAX_COMMENT_LEN = 1000;

export async function POST(req: NextRequest) {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    enforceRateLimit(`negotiation_instant_hire:${user.id}`, { max: 30, windowMs: 60_000 });

    const body = await req.json().catch(() => ({}));
    let taskPostId: string;
    let employeeId: string;
    try {
      taskPostId = requireUuid(body.taskPostId, "taskPostId");
      employeeId = requireUuid(body.employeeId, "employeeId");
    } catch (e) {
      if (e instanceof SecurityError) {
        return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
      }
      throw e;
    }
    const comment = body.comment ? String(body.comment) : null;
    if (comment && comment.length > MAX_COMMENT_LEN) {
      return NextResponse.json({ ok: false, error: `comment too long (max ${MAX_COMMENT_LEN} chars)` }, { status: 400 });
    }

    const { data, error } = await (sb.rpc as any)("create_instant_hire_offer", {
      p_task_post_id: taskPostId,
      p_employee_id: employeeId,
      p_comment: comment,
    });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (!data || data.ok === false) return NextResponse.json({ ok: false, error: data?.error ?? "Failed" }, { status: 400 });
    return NextResponse.json(data);
  } catch (e) {
    if (e instanceof SecurityError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
