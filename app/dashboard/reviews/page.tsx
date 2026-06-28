import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReviewsGiven } from "@/components/reviews/reviews-given";

export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/dashboard/reviews");

  // Reviews I've GIVEN
  const { data: given, error: gErr } = await sb
    .from("reviews")
    .select(`
      id, contract_id, reviewee_id, rating, comment,
      editable_until, created_at,
      reviewee:users!reviews_reviewee_id_fkey(id, full_name, avatar_url),
      contract:contracts!inner(
        id, status, task_post_id, completed_at,
        task:task_posts(id, title, category_id)
      )
    `)
    .eq("reviewer_id", user.id)
    .order("created_at", { ascending: false });

  if (gErr) {
    // eslint-disable-next-line no-console
    console.error("[reviews] given fetch failed:", gErr);
  }

  // Completed contracts awaiting my review
  // (RLS already scopes to contracts where the user is a party)
  const { data: pending, error: pErr } = await sb
    .from("contracts")
    .select(`
      id, status, approved_at, task_post_id,
      task:task_posts(id, title),
      buyer:users!contracts_buyer_id_fkey(id, full_name, avatar_url),
      employee:users!contracts_employee_id_fkey(id, full_name, avatar_url)
    `)
    .eq("status", "completed")
    .or(`buyer_id.eq.${user.id},employee_id.eq.${user.id}`)
    .order("approved_at", { ascending: false })
    .limit(50);

  if (pErr) {
    // eslint-disable-next-line no-console
    console.error("[reviews] pending fetch failed:", pErr);
  }

  // Filter pending to only those without an existing review
  const givenContractIds = new Set((given ?? []).map((g: any) => g.contract_id));
  const pendingList = (pending ?? []).filter((p: any) => !givenContractIds.has(p.id));

  return (
    <ReviewsGiven
      userId={user.id}
      initialGiven={(given ?? []) as any[]}
      initialPending={pendingList as any[]}
    />
  );
}
