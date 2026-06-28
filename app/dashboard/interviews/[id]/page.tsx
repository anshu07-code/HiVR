import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BookingDetailClient } from "@/components/interviews/booking-detail-client";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function InterviewBookingPage({
  params,
}: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect(`/auth/signin?next=/dashboard/interviews/${params.id}`);

  // The id might be a booking_id OR a slot_id (legacy). Try booking first.
  let booking: any = null;
  let bookingErr: any = null;
  const r1 = await sb.rpc("list_my_interview_bookings" as any);
  if (!r1.error) {
    booking = (r1.data as any[])?.find(b => b.booking_id === params.id);
  } else {
    bookingErr = r1.error;
  }

  if (!booking) {
    // Fallback: maybe the id is a slot
    const { data: slot, error: slotErr } = await sb
      .from("interview_slots")
      .select("id, slot_kind, target_tier, scheduled_at, duration_min, meeting_url, notes_for_candidate, status, max_bookings, category:skill_categories(name), interviewer:users!interview_slots_interviewer_id_fkey(full_name, email)")
      .eq("id", params.id)
      .maybeSingle();
    if (slotErr || !slot) notFound();
    if ((slot as any).status !== "open") notFound();
    return (
      <div className="container max-w-2xl space-y-4 py-8">
        <Link href="/dashboard/interviews" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-3.5 w-3.5" /> All interviews
        </Link>
        <p className="text-sm text-muted-foreground">
          This is a slot, not a booking. Browse the slot:
        </p>
        <Link href={`/dashboard/interviews/book?slot=${params.id}`} className="text-primary underline">
          Open this slot →
        </Link>
      </div>
    );
  }

  return <BookingDetailClient booking={booking} />;
}
