import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Handshake, Clock, ExternalLink, Briefcase } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import { NegotiationDialog } from "./negotiation-dialog";
import { GigRibbon } from "@/components/contract/gig-ribbon";
import { MarkOffersSeen } from "./mark-seen";

export const dynamic = "force-dynamic";

export default async function JobOffersPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/dashboard/job-offers");

  const userId = user.id;

  const allUserIds = new Set<string>();
  if (userId) allUserIds.add(userId);

  // Fetch negotiation_offers for the current user
  const { data: negOffers } = await sb
    .from("negotiation_offers")
    .select("id, task_post_id, gig_id, employee_id, buyer_id, round_number, proposed_price, status, created_at, comment, offer_type_new, gig_requirements, contract_id")
    .or(`employee_id.eq.${userId},buyer_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(50);

  // Collect all user IDs, gig IDs, and category IDs
  const gigIds = new Set<string>();
  const catIds = new Set<string>();
  (negOffers ?? []).forEach((o: any) => {
    allUserIds.add(o.employee_id);
    allUserIds.add(o.buyer_id);
    if (o.gig_id) gigIds.add(o.gig_id);
  });

  const [usersRes, gigsRes] = await Promise.all([
    sb.from("users").select("id, full_name, avatar_url").in("id", [...allUserIds]),
    gigIds.size > 0
      ? sb.from("gigs").select("id, title, slug, category_id").in("id", [...gigIds])
      : { data: [] },
  ]);

  const userMap = new Map((usersRes.data ?? []).map((u: any) => [u.id, u]));
  const gigMap = new Map((gigsRes.data ?? []).map((g: any) => [g.id, g]));
  // Collect category IDs from gigs
  (gigsRes.data ?? []).forEach((g: any) => { if (g.category_id) catIds.add(g.category_id); });

  // Fetch category names
  const catMap = new Map<string, string>();
  if (catIds.size > 0) {
    const { data: cats } = await sb.from("skill_categories").select("id, name").in("id", [...catIds]);
    (cats ?? []).forEach((c: any) => catMap.set(c.id, c.name));
  }

  // Build a lookup for accepted offers — prefer contract_id from the offer,
  // fall back to best-match contract by buyer+employee pair
  const acceptedOfferMeta = new Map<string, { contractId: string }>();
  const missingContractIds: any[] = [];
  for (const o of (negOffers ?? []) as any[]) {
    if (o.status !== "accepted") continue;
    if (o.contract_id) {
      acceptedOfferMeta.set(o.id, { contractId: o.contract_id });
    } else {
      missingContractIds.push(o);
    }
  }
  // Fallback: find the most recent contract for each missing pair
  if (missingContractIds.length > 0) {
    const { data: userContracts } = await (sb.from("contracts") as any)
      .select("id, buyer_id, employee_id, gig_id")
      .or(`buyer_id.eq.${userId},employee_id.eq.${userId}`)
      .order("started_at", { ascending: false } as any);
    if (userContracts) {
      for (const o of missingContractIds) {
        // Prefer match by (gig_id, buyer_id, employee_id) if offer has a gig
        let match = (userContracts as any[]).find(
          (c: any) => o.gig_id && c.gig_id === o.gig_id && c.buyer_id === o.buyer_id && c.employee_id === o.employee_id
        );
        // Fall back to (buyer_id, employee_id) only — use the first (most recent) match
        if (!match) {
          match = (userContracts as any[]).find(
            (c: any) => c.buyer_id === o.buyer_id && c.employee_id === o.employee_id
          );
        }
        if (match) acceptedOfferMeta.set(o.id, { contractId: match.id });
      }
    }
  }

  // Fetch pre-hire message threads
  const { data: taskInquiries } = await sb
    .from("task_messages")
    .select("task_id, sender_id, receiver_id, body, created_at")
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(100);

  const inquiryThreads: { taskId: string; otherId: string; otherName: string; otherAvatar: string | null; lastMessage: string; createdAt: string; count: number }[] = [];
  const seenInquiryTasks = new Set<string>();
  for (const m of (taskInquiries ?? []) as any[]) {
    const tId = m.task_id;
    if (!tId || seenInquiryTasks.has(tId)) continue;
    seenInquiryTasks.add(tId);
    const count = (taskInquiries ?? []).filter((x: any) => x.task_id === tId).length;
    const otherId = m.sender_id === userId ? m.receiver_id : m.sender_id;
    const other = userMap.get(otherId);
    inquiryThreads.push({
      taskId: tId,
      otherId,
      otherName: other?.full_name ?? "Someone",
      otherAvatar: other?.avatar_url ?? null,
      lastMessage: m.body ?? "",
      createdAt: m.created_at,
      count,
    });
  }

  // Separate active offers (pending/countered — need a response) from processed ones
  const now = new Date();
  const activeStatuses = ["pending", "countered"];
  const pendingOffers = (negOffers ?? []).filter((o: any) => activeStatuses.includes(o.status)) as any[];
  const processedOffers = (negOffers ?? []).filter((o: any) => !activeStatuses.includes(o.status)) as any[];

  return (
    <>
      <MarkOffersSeen />
      <div className="space-y-6">
      {/* Pending offers — accept/decline/negotiate actions */}
      {pendingOffers.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Handshake className="h-4 w-4 text-amber-600" />
              Pending offers
              <Badge variant="secondary" className="text-[10px] ml-1">{pendingOffers.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingOffers.map((offer: any) => {
              const isIncoming = offer.employee_id === userId;
              const otherId = isIncoming ? offer.buyer_id : offer.employee_id;
              const other = userMap.get(otherId);
              const gig = offer.gig_id ? gigMap.get(offer.gig_id) : null;
              const isExpired = offer.created_at && (now.getTime() - new Date(offer.created_at).getTime()) > 24 * 60 * 60 * 1000;
              return (
                <div key={offer.id} className="relative rounded-lg border p-3">
                  {gig && <GigRibbon />}
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={other?.avatar_url ?? undefined} />
                      <AvatarFallback className="text-xs">{(other?.full_name ?? "?").charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{other?.full_name ?? "Unknown"}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(offer.created_at)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <p className="text-xs text-muted-foreground truncate">
                          {gig ? <span className="text-foreground/80">{catMap.get(gig.category_id) || gig.title} — </span> : ""}
                          ₹{(offer.proposed_price / 100).toLocaleString("en-IN")}
                          {offer.offer_type_new === "gig_direct" ? " · Direct hire" : ` · round ${offer.round_number} · Negotiation`}
                          {isExpired && <span className="text-rose-500 ml-1">(expired)</span>}
                        </p>
                        {offer.status === "countered" && (
                          <Badge className="text-[10px] shrink-0 bg-blue-500/10 text-blue-700 border-blue-200">New counter</Badge>
                        )}
                      </div>
                    </div>
                    {!isExpired ? (
                      <NegotiationDialog
                        offer={offer}
                        otherName={other?.full_name ?? "Unknown"}
                        otherAvatar={other?.avatar_url ?? null}
                        gigTitle={gig?.title ?? null}
                        gigSlug={gig?.slug ?? null}
                        userId={userId}
                      />
                    ) : (
                      <Badge className="text-[10px] bg-rose-500/10 text-rose-700">Expired</Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Processed offers (accepted / declined / expired) */}
      {processedOffers.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Handshake className="h-4 w-4 text-muted-foreground" />
              Past offers
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {processedOffers.slice(0, 20).map((offer: any) => {
              const isIncoming = offer.employee_id === userId;
              const otherId = isIncoming ? offer.buyer_id : offer.employee_id;
              const other = userMap.get(otherId);
              const gig = offer.gig_id ? gigMap.get(offer.gig_id) : null;
              const statusColor = offer.status === "accepted" ? "bg-emerald-500/10 text-emerald-700" :
                offer.status === "declined" ? "bg-rose-500/10 text-rose-700" :
                offer.status === "expired" ? "bg-orange-500/10 text-orange-700" :
                "bg-muted text-muted-foreground";
              const meta = acceptedOfferMeta.get(offer.id);
              return (
                <div key={offer.id} className="relative rounded-lg border p-3">
                  {gig && <GigRibbon />}
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={other?.avatar_url ?? undefined} />
                      <AvatarFallback className="text-xs">{(other?.full_name ?? "?").charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{other?.full_name ?? "Unknown"}</span>
                        <Badge className={`text-[10px] ${statusColor}`}>{offer.status}</Badge>
                        <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(offer.created_at)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {gig ? <span>{catMap.get(gig.category_id) || gig.title} — </span> : ""}
                        ₹{(offer.proposed_price / 100).toLocaleString("en-IN")}
                        {offer.round_number > 1 ? ` (round ${offer.round_number})` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {offer.status === "accepted" && meta && (
                        <>
                          <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                            <Link href={`/dashboard/contracts/${meta.contractId}`}>
                              <ExternalLink className="h-3 w-3 mr-1" />Contract
                            </Link>
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                            <Link href={`/dashboard/contracts/${meta.contractId}`}>
                              <Briefcase className="h-3 w-3 mr-1" />Workspace
                            </Link>
                          </Button>
                        </>
                      )}
                      <NegotiationDialog
                        offer={offer}
                        otherName={other?.full_name ?? "Unknown"}
                        otherAvatar={other?.avatar_url ?? null}
                        gigTitle={gig?.title ?? null}
                        gigSlug={gig?.slug ?? null}
                        userId={userId}
                        viewOnly
                        contractId={meta?.contractId ?? null}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {pendingOffers.length === 0 && processedOffers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 grid h-16 w-16 place-items-center rounded-full bg-muted">
            <Handshake className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold">No job offers yet</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            When a buyer hires you directly or sends a negotiation offer, it will appear here.
          </p>
        </div>
      )}
    </div>
    </>
  );
}
