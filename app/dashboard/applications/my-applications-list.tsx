"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import {
  Briefcase, MapPin, Clock, ChevronRight, Sparkles, FileText,
  AlertCircle, CheckCircle2, Send, XCircle, Award, MessageSquare,
  Calendar, ExternalLink, IndianRupee,
} from "lucide-react";
import { formatPaise, timeAgo, timeUntil } from "@/lib/utils";
import { CategoryIcon } from "@/components/marketing/category-icon";
import { NegotiationModal, type NegotiationOffer } from "@/components/applicants/negotiation-modal";

type AppRow = {
  id: string;
  status: string;
  hiring_stage: string;
  cover_note: string | null;
  bid_paise: number | null;
  created_at: string;
  updated_at: string;
  task: { id: string; title: string; status: string; budget_min: number; budget_max: number; pricing_model: string; deadline: string | null; published_at: string | null; created_at: string; category: { name: string; icon: string; tier: string } | null; buyer: { id: string; full_name: string } | null } | null;
  offer: { id: string; status: string; amount_paise: number | null; expires_at: string; created_at: string; message: string | null } | null;
  next_interview: { id: string; round_type: string; scheduled_at: string; duration_min: number; location: string | null; meeting_url: string | null; agenda: string | null; employee_response: string } | null;
};

const STAGE_TONE: Record<string, string> = {
  pending:       "bg-muted text-muted-foreground border-border",
  shortlist:     "bg-amber-500/10 text-amber-700 border-amber-500/20",
  interview_r1:  "bg-sky-500/10 text-sky-700 border-sky-500/20",
  interview_r2:  "bg-sky-500/10 text-sky-700 border-sky-500/20",
  test:          "bg-violet-500/10 text-violet-700 border-violet-500/20",
  offer:         "bg-primary/10 text-primary border-primary/20",
  hired:         "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  rejected:      "bg-rose-500/10 text-rose-700 border-rose-500/20",
  withdrawn:     "bg-muted text-muted-foreground border-border",
  not_selected:  "bg-muted text-muted-foreground border-border",
};

const STAGE_LABEL: Record<string, string> = {
  pending: "Application sent",
  shortlist: "Shortlisted",
  interview_r1: "Interview R1",
  interview_r2: "Interview R2",
  test: "Skill test",
  offer: "Offer received",
  hired: "Hired",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  not_selected: "Not selected",
};

const STAGE_PIPELINE = ["pending", "shortlist", "interview_r1", "interview_r2", "test", "offer", "hired"] as const;

const STAGE_HINT: Record<string, string> = {
  pending: "Your application is awaiting review.",
  shortlist: "The buyer wants to move you to the next round. Keep an eye on interview invites.",
  interview_r1: "Round 1 interview scheduled. Check the schedule below for time and joining link.",
  interview_r2: "Round 2 interview scheduled. Prepare technicals + portfolio walkthrough.",
  test: "A skill test has been assigned. Submit before the deadline.",
  offer: "You've received an offer! Open it below to review terms and accept.",
  hired: "Welcome aboard! Coordinate next steps from the workspace.",
  rejected: "This one didn't work out. Keep an eye on /browse for more matches.",
  withdrawn: "You withdrew this application.",
  not_selected: "The buyer went with someone else.",
};

export function MyApplicationsList({ initialApplications, contractMap = {} }: { initialApplications: AppRow[]; contractMap?: Record<string, { contract_id: string; workspace_id: string | null }> }) {
  const router = useRouter();
  const [apps, setApps] = React.useState<AppRow[]>(initialApplications);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<"all" | "active" | "hired" | "closed">("active");
  const [confirmD, setConfirmD] = React.useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [alertD, setAlertD] = React.useState<{ title: string; message: string } | null>(null);
  const [negOffers, setNegOffers] = React.useState<NegotiationOffer[]>([]);
  const [negMeta, setNegMeta] = React.useState<Record<string, { title: string; standingRate: number | null }>>({});
  const [activeNeg, setActiveNeg] = React.useState<NegotiationOffer | null>(null);
  const [boundPct, setBoundPct] = React.useState<number>(0.2);
  const [currentUserId, setCurrentUserId] = React.useState<string | null>(null);

  const refreshNeg = React.useCallback(async (uid: string) => {
    const sb = createClient();
    const { data } = await sb
      .from("negotiation_offers")
      .select("*")
      .eq("employee_id", uid)
      .in("status", ["pending", "countered"])
      .order("created_at", { ascending: false });
    const list = (data ?? []) as NegotiationOffer[];
    setNegOffers(list);
    const taskIds = Array.from(new Set(list.map((o) => o.task_post_id)));
    if (taskIds.length > 0) {
      const tasksRes = await sb.from("task_posts").select("id, title, category_id").in("id", taskIds);
      const tasks = (tasksRes.data ?? []) as any[];
      const catIds = Array.from(new Set(tasks.map((t) => t.category_id)));
      const ratesRes = await sb.from("employee_standing_rates").select("category_id, standing_rate").eq("user_id", uid).in("category_id", catIds);
      const rates = (ratesRes.data ?? []) as any[];
      const meta: Record<string, { title: string; standingRate: number | null }> = {};
      const rateByCat: Record<string, number> = {};
      for (const r of rates ?? []) rateByCat[(r as any).category_id] = Number((r as any).standing_rate);
      for (const t of tasks ?? []) {
        meta[(t as any).id] = { title: (t as any).title ?? "Task", standingRate: rateByCat[(t as any).category_id] ?? null };
      }
      setNegMeta(meta);
    }
  }, []);

  React.useEffect(() => {
    const sb = createClient();
    sb.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
    sb.from("platform_settings").select("value").eq("key", "negotiation_bound_pct").maybeSingle()
      .then(({ data }: any) => setBoundPct(Number(data?.value?.value ?? 0.2)));
    const channel = sb
      .channel("my-applications")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "task_applications" },
        () => router.refresh())
      .on("postgres_changes",
        { event: "*", schema: "public", table: "application_offers" },
        () => router.refresh())
      .on("postgres_changes",
        { event: "*", schema: "public", table: "application_interviews" },
        () => router.refresh())
      .on("postgres_changes",
        { event: "*", schema: "public", table: "negotiation_offers" },
        () => {
          if (currentUserId) refreshNeg(currentUserId);
          router.refresh();
        })
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [router, refreshNeg, currentUserId]);

  React.useEffect(() => {
    if (currentUserId) refreshNeg(currentUserId);
  }, [currentUserId, refreshNeg]);

  function respond(offerId: string, response: "accepted" | "declined") {
    if (response === "declined") {
      setConfirmD({ title: "Decline offer?", message: "This cannot be undone.", onConfirm: () => doRespond(offerId, response) });
      return;
    }
    if (response === "accepted") {
      setConfirmD({ title: "Accept offer?", message: "A contract will be created immediately.", onConfirm: () => doRespond(offerId, response) });
      return;
    }
    doRespond(offerId, response);
  }
  async function doRespond(offerId: string, response: "accepted" | "declined") {
    setConfirmD(null);
    setBusyId(offerId);
    const r = await fetch(`/api/applications/offer/${offerId}/respond`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ response }),
    });
    setBusyId(null);
    const data = await r.json().catch(() => ({}));
    if (r.ok && data.ok) {
      if (response === "accepted" && data.contract_id) {
        router.push(`/dashboard/contracts/${data.contract_id}`);
        return;
      }
      router.refresh();
    } else {
      setAlertD({ title: "Error", message: data.error ?? "Failed" });
    }
  }

  function respondInterview(interviewId: string, response: "accepted" | "declined") {
    if (response === "declined") {
      setConfirmD({ title: "Decline interview?", message: "The buyer will be notified.", onConfirm: () => doRespondInterview(interviewId, response) });
      return;
    }
    doRespondInterview(interviewId, response);
  }
  async function doRespondInterview(interviewId: string, response: "accepted" | "declined") {
    setConfirmD(null);
    setBusyId(interviewId);
    const r = await fetch(`/api/applications/interview/${interviewId}/respond`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ response }),
    });
    setBusyId(null);
    if (r.ok) router.refresh();
    else setAlertD({ title: "Error", message: (await r.json().catch(() => ({}))).error ?? "Failed" });
  }

  function withdraw(appId: string) {
    setConfirmD({
      title: "Withdraw application?",
      message: "A penalty equal to HiVR's platform fee on this task will be added to your account (deducted from future earnings).\n\n3 or more withdrawals in a month pauses your account for 7 days.",
      onConfirm: () => doWithdraw(appId),
    });
  }
  async function doWithdraw(appId: string) {
    setConfirmD(null);
    setBusyId(appId);
    const r = await fetch(`/api/applications/${appId}/withdraw`, { method: "POST" });
    setBusyId(null);
    const data = await r.json().catch(() => ({}));
    if (r.ok && data.ok) {
      const lines: string[] = [];
      lines.push(`Penalty applied: ${formatPaise(data.penalty_paise)} (${data.fee_pct}% of task budget).`);
      lines.push(`Total penalty balance: ${formatPaise(data.total_penalty_paise)}.`);
      lines.push(`Withdrawals this month: ${data.withdrawals_this_month}.`);
      if (data.paused_until) {
        lines.push(`Your account is paused until ${new Date(data.paused_until).toLocaleString()}.`);
      }
      setAlertD({ title: "Withdrawn", message: lines.join("\n") });
      router.refresh();
    } else {
      setAlertD({ title: "Error", message: data.error ?? "Failed" });
    }
  }

  const filtered = apps.filter(a => {
    if (filter === "all") return true;
    if (filter === "active") return !["hired", "rejected", "withdrawn", "not_selected"].includes(a.hiring_stage);
    if (filter === "hired") return a.hiring_stage === "hired";
    if (filter === "closed") return ["rejected", "withdrawn", "not_selected"].includes(a.hiring_stage);
    return true;
  });

  if (apps.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-muted">
            <Briefcase className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <h3 className="font-display text-lg font-semibold">No applications yet</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Browse open tasks and apply. Your applications, interview invites, and offers will appear here in real time.
            </p>
          </div>
          <Button asChild variant="gradient"><Link href="/browse">Browse tasks</Link></Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
    <div className="space-y-3">
      {negOffers.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
            <IndianRupee className="h-3 w-3" />Pending offers &amp; negotiations ({negOffers.length})
          </p>
          {negOffers.map((o) => {
            const meta = negMeta[o.task_post_id];
            const expiresAt = new Date(new Date(o.created_at).getTime() + 24 * 3600 * 1000).toISOString();
            const isCustom = o.offer_type === "custom_scope_negotiation";
            return (
              <Card key={o.id} className="border-primary/30 bg-gradient-to-br from-primary/[0.04] to-primary/[0.08]">
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">
                          {isCustom ? "Custom-scope" : "Instant Hire"}
                        </Badge>
                        <span className="rounded-full border bg-background/60 px-2 py-0.5 text-[10px] font-medium">
                          Round {o.round_number} of {isCustom ? 2 : 3}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(expiresAt) > new Date() ? <>Expires {timeUntil(expiresAt)}</> : <span className="text-destructive">Expired</span>}
                        </span>
                      </div>
                      <Link href={`/browse/${o.task_post_id}`} className="mt-1 block text-sm font-semibold hover:text-primary hover:underline">
                        {meta?.title ?? "Task"}
                      </Link>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-2xl font-bold">{formatPaise(o.proposed_price)}</p>
                      <p className="text-[10px] text-muted-foreground">{isCustom ? "Buyer's offer" : "Standing rate"}</p>
                    </div>
                  </div>
                  {o.comment && (
                    <div className="rounded-md border bg-background/50 px-3 py-2 text-xs">
                      <p className="text-[10px] font-medium text-muted-foreground">Message from buyer</p>
                      <p className="mt-0.5 whitespace-pre-wrap">{o.comment}</p>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="gradient" onClick={() => setActiveNeg(o)}>
                      <CheckCircle2 className="h-3.5 w-3.5" />Open & respond
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Filter chips */}
      <div className="flex flex-wrap gap-1">
        {[
          { k: "active",  l: `Active (${apps.filter(a => !["hired", "rejected", "withdrawn", "not_selected"].includes(a.hiring_stage)).length})` },
          { k: "hired",   l: `Hired (${apps.filter(a => a.hiring_stage === "hired").length})` },
          { k: "closed",  l: `Closed (${apps.filter(a => ["rejected", "withdrawn", "not_selected"].includes(a.hiring_stage)).length})` },
          { k: "all",     l: `All (${apps.length})` },
        ].map(({ k, l }) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k as any)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${filter === k ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"}`}
          >
            {l}
          </button>
        ))}
      </div>

      {filtered.map(a => {
        const t = a.task;
        const offer = a.offer;
        const iv = a.next_interview;
        const stageIdx = STAGE_PIPELINE.indexOf(a.hiring_stage as any);
        return (
          <Card key={a.id} className="overflow-hidden">
            <CardContent className="p-0">
              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <CategoryIcon name={t?.category?.icon ?? ""} className="h-4 w-4 shrink-0 text-primary" />
                    <Link href={`/browse/${a.task?.id}`} className="font-semibold hover:text-primary hover:underline">
                      {t?.title ?? "Task"}
                    </Link>
                    <Badge variant="outline" className={`text-[10px] ${STAGE_TONE[a.hiring_stage] ?? ""}`}>
                      {STAGE_LABEL[a.hiring_stage] ?? a.status}
                    </Badge>
                    {a.bid_paise != null && (
                      <span className="text-[10px] text-muted-foreground">Bid {formatPaise(a.bid_paise)}</span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                    {t?.buyer?.full_name && <span>Buyer: {t.buyer.full_name}</span>}
                    {t?.category?.name && <span>· {t.category.name}</span>}
                    <span>· Applied {timeAgo(a.created_at)}</span>
                    {t?.deadline && <span>· Deadline {new Date(t.deadline).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{STAGE_HINT[a.hiring_stage] ?? ""}</p>

                  {/* Pipeline */}
                  {stageIdx >= 0 && (
                    <div className="mt-3 flex items-center gap-1">
                      {STAGE_PIPELINE.map((s, i) => {
                        const done = i < stageIdx;
                        const current = i === stageIdx;
                        return (
                          <React.Fragment key={s}>
                            <div
                              className={`h-1.5 flex-1 rounded-full ${done ? "bg-emerald-500" : current ? "bg-primary" : "bg-muted"}`}
                              title={STAGE_LABEL[s]}
                            />
                          </React.Fragment>
                        );
                      })}
                    </div>
                  )}

                  {/* Offer card */}
                  {offer && offer.status === "pending" && (
                    <div className="mt-4 overflow-hidden rounded-lg border-2 border-primary/20 bg-gradient-to-br from-primary/[0.04] to-primary/[0.08]">
                      <div className="border-b border-primary/10 bg-primary/[0.06] px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="grid h-7 w-7 place-items-center rounded-full bg-primary/10">
                            <Sparkles className="h-3.5 w-3.5 text-primary" />
                          </div>
                          <span className="text-xs font-semibold uppercase tracking-wider text-primary">Official Offer</span>
                        </div>
                      </div>
                      <div className="space-y-3 p-4">
                        <div className="flex items-baseline justify-between">
                          <div>
                            <p className="text-lg font-bold">
                              {offer.amount_paise != null ? formatPaise(offer.amount_paise) : "Unpaid"}
                            </p>
                            {offer.amount_paise != null && <p className="text-[11px] text-muted-foreground">Offered amount</p>}
                          </div>
                          <div className="text-right text-[11px] text-muted-foreground">
                            <p>Expires <span className="font-medium text-foreground">
                              {new Date(offer.expires_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                            </span></p>
                            <p>No response = auto-expires</p>
                          </div>
                        </div>
                        {offer.message && (
                          <div className="rounded-md border bg-background/50 px-3 py-2">
                            <p className="text-[11px] font-medium text-muted-foreground">Message from buyer</p>
                            <p className="mt-0.5 text-sm">{offer.message}</p>
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2 border-t border-primary/10 pt-3">
                          <Button size="sm" variant="gradient" disabled={busyId === offer.id} onClick={() => respond(offer.id, "accepted")}>
                            {busyId === offer.id ? "..." : <><CheckCircle2 className="h-3.5 w-3.5" />Accept Offer</>}
                          </Button>
                          <Button size="sm" variant="outline" disabled={busyId === offer.id} onClick={() => respond(offer.id, "declined")}>
                            {busyId === offer.id ? "..." : <><XCircle className="h-3.5 w-3.5" />Decline</>}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Interview card */}
                  {iv && (
                    <div className="mt-3 rounded-md border bg-muted/30 p-3">
                      <div className="flex items-start gap-2">
                        <Calendar className="mt-0.5 h-4 w-4 text-sky-600" />
                        <div className="flex-1">
                          <p className="text-sm font-semibold">{STAGE_LABEL[iv.round_type] ?? iv.round_type}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(iv.scheduled_at).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · {iv.duration_min} min
                            {iv.location && <> · {iv.location}</>}
                          </p>
                          {iv.agenda && <p className="mt-0.5 text-xs text-muted-foreground">{iv.agenda}</p>}
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            {iv.employee_response === "accepted" && <Badge variant="success" className="text-[10px]">Accepted</Badge>}
                            {iv.employee_response === "declined" && <Badge variant="destructive" className="text-[10px]">Declined</Badge>}
                            {iv.employee_response === "pending" && (
                              <>
                                <Button size="sm" variant="outline" disabled={busyId === iv.id} onClick={() => respondInterview(iv.id, "accepted")}>
                                  Accept
                                </Button>
                                <Button size="sm" variant="ghost" disabled={busyId === iv.id} onClick={() => respondInterview(iv.id, "declined")}>
                                  Decline
                                </Button>
                              </>
                            )}
                            {iv.meeting_url && (
                              <Button size="sm" variant="ghost" asChild>
                                <a href={iv.meeting_url} target="_blank" rel="noreferrer">
                                  <ExternalLink className="h-3 w-3" />Join
                                </a>
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Hired card */}
                  {a.hiring_stage === "hired" && (() => {
                    const cm = t ? contractMap[t.id] : null;
                    return (
                    <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
                      <p className="text-sm font-semibold text-emerald-700">Welcome aboard!</p>
                      <p className="mt-1 text-xs text-emerald-700/80">Coordinate next steps and deliverables from the workspace.</p>
                      <Button asChild size="sm" variant="gradient" className="mt-2">
                        <Link href={cm?.contract_id ? `/dashboard/contracts/${cm.contract_id}` : "/dashboard/contracts"}>Open my contract <ChevronRight className="h-3.5 w-3.5" /></Link>
                      </Button>
                    </div>
                    );
                  })()}
                </div>
                <div className="flex shrink-0 flex-col gap-1.5 sm:w-36">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/browse/${a.task?.id}`}>View task</Link>
                  </Button>
                  {a.hiring_stage === "hired" && (() => {
                    const cm = t ? contractMap[t.id] : null;
                    const wsUrl = cm?.workspace_id ? `/dashboard/workspaces/${cm.workspace_id}` : cm?.contract_id ? `/dashboard/contracts/${cm.contract_id}` : "/dashboard/contracts";
                    return (
                    <Button asChild size="sm" variant="gradient">
                      <Link href={wsUrl}>Workspace</Link>
                    </Button>
                    );
                  })()}
                  {!["hired", "rejected", "withdrawn"].includes(a.hiring_stage) && !(offer && offer.status === "pending") && (
                    <Button size="sm" variant="ghost" disabled={busyId === a.id} onClick={() => withdraw(a.id)} className="text-rose-600">
                      Withdraw
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>

    {confirmD && (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setConfirmD(null)}>
        <div className="w-full max-w-sm rounded-lg border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
          <h3 className="font-display text-lg font-semibold">{confirmD.title}</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{confirmD.message}</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setConfirmD(null)}>Cancel</Button>
            <Button size="sm" variant="gradient" onClick={confirmD.onConfirm}>Confirm</Button>
          </div>
        </div>
      </div>
    )}

    {alertD && (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setAlertD(null)}>
        <div className="w-full max-w-sm rounded-lg border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
          <h3 className="font-display text-lg font-semibold">{alertD.title}</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{alertD.message}</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button size="sm" variant="gradient" onClick={() => setAlertD(null)}>OK</Button>
          </div>
        </div>
      </div>
    )}

    {activeNeg && currentUserId && (
      <NegotiationModal
        offer={activeNeg}
        currentUserId={currentUserId}
        taskId={activeNeg.task_post_id}
        employeeName="You"
        standingRate={negMeta[activeNeg.task_post_id]?.standingRate ?? null}
        boundPct={boundPct}
        onResponded={() => { if (currentUserId) refreshNeg(currentUserId); router.refresh(); }}
        onClose={() => setActiveNeg(null)}
      />
    )}
    </>
  );
}
