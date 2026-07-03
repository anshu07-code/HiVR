import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LevelUpClient } from "./level-up-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Level up - HiVR" };

export default async function LevelUpPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/dashboard/level-up");

  // Evaluate the employee's level-up progress server-side (single source of truth)
  let evalData = null;
  try {
    const res = await sb.rpc("evaluate_level_up" as any, { p_user_id: user.id } as any);
    evalData = res.data;
  } catch {
    // RPC function may not exist yet — render minimal UI
  }

  // Fetch available interview slots (open + future)
  const { data: slots } = await sb
    .from("interview_slots")
    .select(`
      id, target_tier, scheduled_at, duration_min, meeting_url, notes,
      interviewer:users!interview_slots_interviewer_id_fkey(full_name, email)
    `)
    .eq("slot_kind", "level_up")
    .eq("status", "open")
    .gt("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(20);

  // Fetch this employee's recent bookings
  const { data: myBookings } = await sb
    .from("interview_bookings")
    .select(`
      id, status, result, result_notes, result_uploaded_at, booked_at,
      slot:interview_slots(target_tier, scheduled_at, duration_min,
        interviewer:users!interview_slots_interviewer_id_fkey(full_name, email)
      )
    `)
    .eq("employee_id", user.id)
    .order("booked_at", { ascending: false })
    .limit(10);

  return (
    <LevelUpClient
      evaluation={evalData as any}
      availableSlots={(slots ?? []).map((s: any) => ({
        id: s.id,
        target_tier: s.target_tier,
        scheduled_at: s.scheduled_at,
        duration_min: s.duration_min,
        meeting_url: s.meeting_url,
        notes: s.notes,
        interviewer_name: s.interviewer?.full_name ?? "",
        interviewer_email: s.interviewer?.email ?? "",
      }))}
      myBookings={(myBookings ?? []).map((b: any) => ({
        id: b.id,
        status: b.status,
        result: b.result,
        result_notes: b.result_notes,
        result_uploaded_at: b.result_uploaded_at,
        booked_at: b.booked_at,
        target_tier: b.slot?.target_tier ?? null,
        scheduled_at: b.slot?.scheduled_at ?? null,
        duration_min: b.slot?.duration_min ?? null,
        interviewer_name: b.slot?.interviewer?.full_name ?? "",
        interviewer_email: b.slot?.interviewer?.email ?? "",
      }))}
    />
  );
}
