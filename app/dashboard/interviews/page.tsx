import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { MyInterviewsClient } from "@/components/interviews/my-interviews-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Interviews — HiVR" };

export default async function MyInterviewsPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/dashboard/interviews");

  // Server-side data: my bookings + the level-up evaluation (so we
  // can show a "Book interview" CTA when one is required).
  const [{ data: bookingsRaw }, { data: evaluation }] = await Promise.all([
    sb.rpc("list_my_interview_bookings" as any),
    sb.rpc("evaluate_level_up" as any, { p_user_id: user.id } as any),
  ]);

  return (
    <div className="container max-w-4xl space-y-6 py-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Interviews</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Book interview slots for Tier B verification or level-up. Real humans, real time.
        </p>
      </header>

      <MyInterviewsClient
        bookings={(bookingsRaw ?? []) as any[]}
        evaluation={(evaluation as any) ?? null}
      />
    </div>
  );
}
