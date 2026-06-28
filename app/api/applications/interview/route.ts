import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** POST /api/applications/interview — buyer schedules an interview/test round. */
export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const applicationId = String(body.application_id ?? "");
  const roundType = String(body.round_type ?? "");
  const scheduledAt = String(body.scheduled_at ?? "");
  const durationMin = Math.max(15, Math.min(240, Number(body.duration_min ?? 30)));
  const location = String(body.location ?? "").trim() || null;
  const meetingUrl = String(body.meeting_url ?? "").trim() || null;
  const agenda = String(body.agenda ?? "").trim() || null;

  if (!applicationId) return NextResponse.json({ error: "application_id required" }, { status: 400 });
  if (!["interview_r1", "interview_r2", "test", "offer_call"].includes(roundType)) {
    return NextResponse.json({ error: "round_type must be interview_r1 / interview_r2 / test / offer_call" }, { status: 400 });
  }
  if (!scheduledAt || isNaN(new Date(scheduledAt).getTime())) {
    return NextResponse.json({ error: "scheduled_at must be a valid ISO date" }, { status: 400 });
  }

  // Verify the user is the task's buyer
  const { data: app } = await sb
    .from("task_applications")
    .select("id, task_id, employee_id, task_posts!inner(buyer_id)")
    .eq("id", applicationId)
    .maybeSingle();
  if (!app) return NextResponse.json({ error: "Application not found" }, { status: 404 });
  if (((app as any).task_posts as any)?.buyer_id !== user.id) {
    return NextResponse.json({ error: "Not your task" }, { status: 403 });
  }

  // Create the interview
  const { data: interview, error } = await sb.from("application_interviews").insert({
    application_id: applicationId,
    round_type: roundType,
    scheduled_at: scheduledAt,
    duration_min: durationMin,
    location,
    meeting_url: meetingUrl,
    agenda,
  }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Bump the application's hiring_stage to match the round type (for r1, r2, test)
  const stageMap: Record<string, string> = {
    interview_r1: "interview_r1",
    interview_r2: "interview_r2",
    test: "test",
    offer_call: "offer",
  };
  const newStage = stageMap[roundType];
  if (newStage) {
    await sb.from("task_applications").update({
      hiring_stage: newStage,
      hiring_stage_history: ((app as any).hiring_stage_history ?? []).concat([{ from: (app as any).hiring_stage, to: newStage, at: new Date().toISOString(), note: `${roundType} scheduled` }]),
    }).eq("id", applicationId);
  }

  // Notify the employee
  const friendlyName: Record<string, string> = {
    interview_r1: "Interview R1 scheduled",
    interview_r2: "Interview R2 scheduled",
    test: "Skill test scheduled",
    offer_call: "Offer call scheduled",
  };
  await sb.rpc("create_notification" as any, {
    p_user_id: (app as any).employee_id,
    p_type: "hiring_stage",
    p_title: friendlyName[roundType] ?? "Round scheduled",
    p_body: `${new Date(scheduledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} · ${durationMin} min${location ? ` · ${location}` : ""}`,
    p_link: "/dashboard/applications",
  } as any);

  return NextResponse.json({ ok: true, interview });
}
