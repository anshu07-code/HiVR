import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Handshake, MessageSquare, Briefcase, ExternalLink, CheckCircle2, XCircle } from "lucide-react";
import { formatPaise, timeAgo } from "@/lib/utils";
import { acceptDirectHireOffer, declineDirectHireOffer } from "./actions";

export const dynamic = "force-dynamic";

export default async function JobOffersPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/dashboard/job-offers");

  const userId = user.id;

  // Fetch any private tasks the user is involved in
  const { data: privateTasks } = await sb
    .from("task_posts")
    .select("id, buyer_id, title, description, status, created_at, budget_max")
    .eq("is_private", true)
    .or(`buyer_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(50);

  const allUserIds = new Set<string>();
  (privateTasks ?? []).forEach((t: any) => { allUserIds.add(t.buyer_id); });
  if (userId) allUserIds.add(userId);

  const { data: users } = await sb
    .from("users")
    .select("id, full_name, avatar_url")
    .in("id", [...allUserIds]);

  const userMap = new Map((users ?? []).map((u: any) => [u.id, u]));

  // Fetch negotiation_offers for the current user
  const { data: negOffers } = await sb
    .from("negotiation_offers")
    .select("id, task_post_id, employee_id, buyer_id, round_number, proposed_price, status, created_at, comment")
    .or(`employee_id.eq.${userId},buyer_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(50);

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

  // Separate pending offers from processed ones
  const pendingOffers = (negOffers ?? []).filter((o: any) => o.status === "pending") as any[];
  const processedOffers = (negOffers ?? []).filter((o: any) => o.status !== "pending") as any[];

  return (
    <div className="space-y-6">
      {/* Pending offers — accept/decline actions */}
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
              return (
                <div key={offer.id} className="rounded-lg border p-3">
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
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        ₹{(offer.proposed_price / 100).toLocaleString("en-IN")} · round {offer.round_number}
                        {offer.comment?.startsWith("Direct hire:") ? " · Direct hire offer" : " · Negotiation offer"}
                      </p>
                    </div>
                    {isIncoming && (
                      <div className="flex items-center gap-1 shrink-0">
                        <form action={acceptDirectHireOffer}>
                          <input type="hidden" name="offerId" value={offer.id} />
                          <input type="hidden" name="taskPostId" value={offer.task_post_id} />
                          <input type="hidden" name="employeeId" value={userId} />
                          <input type="hidden" name="buyerId" value={offer.buyer_id} />
                          <input type="hidden" name="pricePaise" value={offer.proposed_price} />
                          <Button type="submit" size="sm" variant="default" className="h-7 text-xs gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Accept
                          </Button>
                        </form>
                        <form action={declineDirectHireOffer}>
                          <input type="hidden" name="offerId" value={offer.id} />
                          <input type="hidden" name="taskPostId" value={offer.task_post_id} />
                          <input type="hidden" name="employeeId" value={userId} />
                          <input type="hidden" name="buyerId" value={offer.buyer_id} />
                          <Button type="submit" size="sm" variant="outline" className="h-7 text-xs gap-1">
                            <XCircle className="h-3 w-3" /> Decline
                          </Button>
                        </form>
                        <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                          <Link href={`/dashboard/applications?task=${offer.task_post_id}`}>
                            Negotiate
                          </Link>
                        </Button>
                      </div>
                    )}
                    {!isIncoming && (
                      <Badge className="text-[10px]">Awaiting response</Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Processed offers (accepted / declined) */}
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
              const statusColor = offer.status === "accepted" ? "bg-emerald-500/10 text-emerald-700" :
                offer.status === "declined" ? "bg-rose-500/10 text-rose-700" :
                "bg-muted text-muted-foreground";
              return (
                <Link
                  key={offer.id}
                  href={`/dashboard/applications?task=${offer.task_post_id}`}
                  className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                >
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
                      ₹{(offer.proposed_price / 100).toLocaleString("en-IN")} (round {offer.round_number})
                    </p>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </Link>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Pre-hire message threads */}
      {inquiryThreads.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <MessageSquare className="h-4 w-4 text-primary" />
              Pre-hire inquiries
              <Badge variant="secondary" className="text-[10px] ml-1">{inquiryThreads.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {inquiryThreads.map((t) => (
              <Link
                key={t.taskId}
                href={`/dashboard/messages`}
                className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src={t.otherAvatar ?? undefined} />
                  <AvatarFallback className="text-xs">{t.otherName.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{t.otherName}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(t.createdAt)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{t.lastMessage}</p>
                </div>
                <Badge variant="outline" className="text-[10px] shrink-0">{t.count} msg</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Direct hires (private tasks from offers that were accepted) */}
      {(privateTasks ?? []).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Briefcase className="h-4 w-4 text-emerald-600" />
              Direct hires
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(privateTasks ?? []).map((task: any) => {
                const isBuyer = task.buyer_id === userId;
                const otherId = task.buyer_id;
                const other = userMap.get(otherId);
                return (
                  <Link
                    key={task.id}
                    href={task.status === "in_contract" ? `/dashboard/contracts?task=${task.id}` : `/dashboard/tasks?task=${task.id}`}
                    className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                  >
                    <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                      task.status === "in_contract" ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"
                    }`}>
                      <Briefcase className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{task.title}</span>
                        <Badge variant={task.status === "in_contract" ? "default" : "secondary"} className="text-[10px] capitalize">
                          {task.status.replace("_", " ")}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(task.created_at)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground truncate mt-0.5">
                        {isBuyer ? "Offered to" : "Offered by"} {other?.full_name ?? "Unknown"} — {formatPaise(task.budget_max)}
                      </div>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {pendingOffers.length === 0 && processedOffers.length === 0 && inquiryThreads.length === 0 && (privateTasks ?? []).length === 0 && (
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
  );
}
