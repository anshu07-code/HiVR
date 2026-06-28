/**
 * POST /api/business/calls/initiate
 * FormData: { business_id, to, topic, agenda?, contract_id? }
 *
 * Creates a business_calls row + dials the recipient via Twilio.
 * In dev / when Twilio is bypassed, immediately marks the call as
 * "completed" with 0 duration so the UI flow can be tested.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { initiateTwilioCall, isTwilioBypassed } from "@/lib/twilio";

export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const formData = await req.formData();
  const businessId = String(formData.get("business_id") ?? "");
  const to = String(formData.get("to") ?? "");
  const topic = String(formData.get("topic") ?? "").trim();
  const agenda = String(formData.get("agenda") ?? "").trim() || null;
  const contractId = String(formData.get("contract_id") ?? "") || null;

  if (!businessId || !to || !topic) {
    return NextResponse.json({ error: "Missing business_id / to / topic" }, { status: 400 });
  }

  // Verify the caller owns the business
  const { data: bp } = await sb.from("business_profiles")
    .select("id, is_suspended, brand_name, legal_name").eq("id", businessId).eq("owner_user_id", user.id).maybeSingle();
  if (!bp) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  if ((bp as any).is_suspended) return NextResponse.json({ error: "Business is suspended" }, { status: 403 });

  // Pull the employee's phone (from auth.users via admin or a public phone column)
  // For the MVP we just record the call with the user_id. The Twilio call
  // would need the actual phone number to dial — for now, only logged when
  // the user has a phone set on their profile.
  const { data: employee } = await sb.from("users")
    .select("id, full_name, phone, phone_verified_at")
    .eq("id", to).maybeSingle();
  if (!employee) return NextResponse.json({ error: "Recipient not found" }, { status: 404 });

  // Create the call row
  const { data: call, error: insErr } = await sb.from("business_calls")
    .insert({
      business_id: businessId,
      contract_id: contractId,
      business_user_id: user.id,
      employee_user_id: to,
      initiated_by: "business",
      status: "pending",
      topic,
      agenda,
    } as any)
    .select("id")
    .single();
  if (insErr || !call) return NextResponse.json({ error: insErr?.message ?? "Failed to create call" }, { status: 500 });

  // Try to dial via Twilio
  if (employee.phone) {
    try {
      const result = await initiateTwilioCall({
        callId: (call as any).id,
        to: employee.phone,
      });
      await sb.from("business_calls").update({
        twilio_call_sid: result.callSid,
        twilio_proxy_number: result.proxyNumber,
        status: "ringing",
      } as any).eq("id", (call as any).id);

      // In bypass mode, immediately mark as completed so the UI can show it
      if (result.bypassed) {
        await sb.from("business_calls").update({
          status: "completed",
          started_at: new Date().toISOString(),
          ended_at: new Date().toISOString(),
          duration_sec: 0,
          transcript_status: "ready",
          transcript: `[Bypassed call — no audio recorded]\n\nTopic: ${topic}\n${agenda ? `Agenda:\n${agenda}` : ""}\n\nIn production, this would contain the full Twilio transcript of the call.`,
        } as any).eq("id", (call as any).id);
      }
    } catch (e: any) {
      await sb.from("business_calls").update({ status: "failed" } as any).eq("id", (call as any).id);
      return NextResponse.json({ error: `Call dial failed: ${e?.message}` }, { status: 502 });
    }
  } else {
    // No phone on file — still create the call record so the user can
    // add a transcript manually. Status stays 'pending'.
    await sb.from("business_calls").update({
      status: "ringing",
      transcript_status: "pending",
    } as any).eq("id", (call as any).id);
  }

  return NextResponse.json({ ok: true, callId: (call as any).id, bypassed: isTwilioBypassed() });
}
