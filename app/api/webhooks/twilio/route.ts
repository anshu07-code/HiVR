/**
 * Webhook: Twilio sends call status + recording + transcription updates here.
 *
 * Configure in Twilio console:
 *   Voice → Calls → [your call] → Status Callback URL = https://yourdomain/api/webhooks/twilio
 *   Recording Status Callback URL = https://yourdomain/api/webhooks/twilio
 *   Transcription Callback URL    = https://yourdomain/api/webhooks/twilio
 *
 * Handles events:
 *   - CallStatusEnum (initiated, ringing, answered, completed, busy, failed, no-answer, canceled)
 *   - RecordingStatus (in-progress, completed, absent, failed)
 *   - TranscriptionStatus (in-progress, completed, failed)
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyTwilioWebhookSignature, isTwilioBypassed } from "@/lib/twilio";

export const runtime = "nodejs";

const CALL_STATUS_MAP: Record<string, string> = {
  initiated: "pending",
  ringing: "ringing",
  "in-progress": "in_progress",
  answered: "in_progress",
  completed: "completed",
  busy: "failed",
  "no-answer": "missed",
  failed: "failed",
  canceled: "cancelled",
};

const COST_PER_SECOND_PAISE = 100; // ₹1/min ≈ 1.67 paise/sec; rounded to 100 paise/min flat for MVP

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get("x-twilio-signature") ?? "";

  if (!isTwilioBypassed()) {
    const url = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/webhooks/twilio`;
    if (!verifyTwilioWebhookSignature(raw, sig, url)) {
      return new NextResponse("Invalid signature", { status: 401 });
    }
  }

  const params = new URLSearchParams(raw);
  const callSid = params.get("CallSid") ?? params.get("callSid");
  const callStatus = params.get("CallStatus") ?? params.get("callStatus");
  const recordingUrl = params.get("RecordingUrl") ?? params.get("RecordingUrl");
  const recordingStatus = params.get("RecordingStatus") ?? params.get("recordingStatus");
  const transcriptionText = params.get("TranscriptionText") ?? params.get("transcriptionText");
  const transcriptionStatus = params.get("TranscriptionStatus") ?? params.get("transcriptionStatus");
  const callDuration = parseInt(params.get("CallDuration") ?? params.get("callDuration") ?? "0", 10);

  if (!callSid && !callStatus) {
    return NextResponse.json({ ok: true, note: "no call data" });
  }

  const sb = createClient();
  const { data: call } = await sb.from("business_calls")
    .select("id, started_at, status")
    .eq("twilio_call_sid", callSid ?? "").maybeSingle();
  if (!call) {
    return NextResponse.json({ ok: true, note: "call not found" });
  }

  const updates: any = {};
  if (callStatus && CALL_STATUS_MAP[callStatus]) {
    updates.status = CALL_STATUS_MAP[callStatus];
    if (callStatus === "answered" || callStatus === "in-progress") {
      updates.started_at = new Date().toISOString();
    }
    if (callStatus === "completed") {
      updates.ended_at = new Date().toISOString();
      updates.duration_sec = callDuration;
      updates.cost_paise = Math.ceil(callDuration / 60) * COST_PER_SECOND_PAISE;
    }
  }
  if (recordingUrl) {
    updates.recording_url = recordingUrl;
  }
  if (recordingStatus) {
    if (recordingStatus === "completed") updates.recording_duration_sec = callDuration;
  }
  if (transcriptionStatus) {
    updates.transcript_status = transcriptionStatus;
  }
  if (transcriptionText) {
    updates.transcript = transcriptionText;
    updates.transcript_status = "ready";
  }

  if (Object.keys(updates).length > 0) {
    await sb.from("business_calls").update(updates as any).eq("id", (call as any).id);
  }

  return NextResponse.json({ ok: true });
}
