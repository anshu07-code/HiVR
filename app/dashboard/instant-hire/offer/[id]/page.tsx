import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InstantHireOfferView } from "@/components/instant-hire/instant-hire-offer-view";

export const dynamic = "force-dynamic";

export default async function InstantHireOfferPage({
  params,
}: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect(`/auth/signin?next=/dashboard/instant-hire/offer/${params.id}`);

  const { data: offer, error } = await sb
    .from("instant_hire_offers")
    .select(`
      id, contract_id, candidate_id, buyer_id, category_id, urgency,
      rate_paise, status, counter_round, max_rounds, cascade_position,
      offered_at, expires_at, responded_at, decline_reason,
      buyer:users!instant_hire_offers_buyer_id_fkey(id, full_name, avatar_url),
      contract:contracts!instant_hire_offers_contract_id_fkey(
        id, agreed_price, category_id, pricing_model,
        task:task_posts(id, title)
      )
    `)
    .eq("id", params.id)
    .maybeSingle();

  if (error || !offer) notFound();

  // Authorization: only the candidate, the buyer, or an admin can view
  const o = offer as any;
  const isCandidate = o.candidate_id === user.id;
  const isBuyer = o.buyer_id === user.id;
  if (!isCandidate && !isBuyer) notFound();

  return (
    <InstantHireOfferView
      offer={o}
      currentUserId={user.id}
      role={isCandidate ? "candidate" : "buyer"}
    />
  );
}
