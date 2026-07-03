import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReviewsGiven } from "@/components/reviews/reviews-given";

export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/dashboard/reviews");

  // Count-only queries (no joins) to verify data exists
  const { count: givenCount } = await sb
    .from("reviews")
    .select("id", { count: "exact", head: true })
    .eq("reviewer_id", user.id);

  const { count: receivedCount } = await sb
    .from("reviews")
    .select("id", { count: "exact", head: true })
    .eq("reviewee_id", user.id);

  const { count: completedCount } = await sb
    .from("contracts")
    .select("id", { count: "exact", head: true })
    .eq("status", "completed")
    .or(`buyer_id.eq.${user.id},employee_id.eq.${user.id}`);

  // Reviews I've GIVEN
  const { data: given, error: gErr } = await sb
    .from("reviews")
    .select(`
      id, contract_id, reviewee_id, rating, comment,
      editable_until, created_at,
      reviewee:users!reviews_reviewee_id_fkey(id, full_name, avatar_url),
      contract:contracts!reviews_contract_id_fkey(
        id, status, task_post_id, approved_at,
        task:task_posts(id, title, category_id)
      )
    `)
    .eq("reviewer_id", user.id)
    .order("created_at", { ascending: false });

  if (gErr) {
    console.error("[reviews] given fetch failed:", gErr);
  }

  // Reviews I've RECEIVED
  const { data: received, error: rErr } = await sb
    .from("reviews")
    .select(`
      id, contract_id, reviewer_id, rating, comment,
      editable_until, created_at,
      reviewer:users!reviews_reviewer_id_fkey(id, full_name, avatar_url),
      contract:contracts!reviews_contract_id_fkey(
        id, status, task_post_id, approved_at,
        task:task_posts(id, title, category_id)
      )
    `)
    .eq("reviewee_id", user.id)
    .order("created_at", { ascending: false });

  if (rErr) {
    console.error("[reviews] received fetch failed:", rErr);
  }

  // Completed contracts awaiting my review
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
    console.error("[reviews] pending fetch failed:", pErr);
  }

  // Filter pending to only those without an existing review
  const givenContractIds = new Set((given ?? []).map((g: any) => g.contract_id));
  const pendingList = (pending ?? []).filter((p: any) => !givenContractIds.has(p.id));

  console.log("[reviews debug]", {
    userId: user.id,
    givenCount,
    receivedCount,
    completedCount,
    givenReturned: (given ?? []).length,
    receivedReturned: (received ?? []).length,
    pendingReturned: pendingList.length,
  });

  return (
    <ReviewsGiven
      userId={user.id}
      initialGiven={(given ?? []) as any[]}
      initialReceived={(received ?? []) as any[]}
      initialPending={pendingList as any[]}
    />
  );
}
