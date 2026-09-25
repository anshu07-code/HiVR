"use client";

import * as React from "react";
import Link from "next/link";
import {
  Handshake, Loader2, X, ExternalLink, ChevronDown, ChevronRight,
  Search, ShoppingBag, Users, Briefcase, Filter, FileText,
  CheckCircle2, XCircle, Clock,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { timeAgo, formatPaise } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { GigRibbon } from "@/components/contract/gig-ribbon";

type Round = {
  id: string;
  round_number: number;
  proposed_by?: "buyer" | "employee";
  offered_by?: "buyer" | "employee";
  amount_paise: number;
  time_minutes?: number | null;
  comment?: string | null;
  message?: string | null;
  status: string;
  created_at: string;
};

type NegGroup = {
  pairKey: string;
  buyerName: string;
  employeeName: string;
  source: "gig" | "direct" | "task";
  contextTitle: string;
  contextSubtitle: string;
  gigTitle?: string;
  gigSlug?: string;
  status: string;
  rounds: Round[];
  latestAt: string;
  contractId?: string | null;
  taskId?: string;
};

const SOURCE_TABS = [
  { key: "all", label: "All", icon: Filter },
  { key: "task", label: "Task", icon: Briefcase },
  { key: "direct", label: "Direct hire", icon: Users },
  { key: "gig", label: "Gig", icon: ShoppingBag },
] as const;

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "accepted", label: "Accepted" },
  { key: "declined", label: "Declined" },
] as const;

function statusMatches(g: NegGroup, statusFilter: string): boolean {
  if (statusFilter === "all") return true;
  if (statusFilter === "active") return g.status !== "accepted" && g.status !== "declined";
  return g.status === statusFilter;
}

function CollapsibleSection({ title, count, defaultOpen, children }: { title: string; count: number; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(defaultOpen ?? false);
  return (
    <div className="rounded-lg border">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:bg-muted/30 transition-colors"
      >
        <span>{title} ({count})</span>
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>
      {open && <div className="px-4 pb-3 space-y-2">{children}</div>}
    </div>
  );
}

function parseComment(raw: string | null | undefined): { text: string; days: number | null } {
  if (!raw) return { text: "", days: null };
  try {
    const p = JSON.parse(raw);
    if (p && typeof p === "object") return { text: p.text ?? "", days: p.expected_days ?? null };
  } catch { /* not JSON */ }
  return { text: raw, days: null };
}

function formatComment(raw: string | null | undefined): string {
  return parseComment(raw).text || "";
}

function NegotiationCard({ group }: { group: NegGroup }) {
  const [expanded, setExpanded] = React.useState(false);
  const isAccepted = group.status === "accepted";
  const isDeclined = group.status === "declined";
  const isGig = group.source === "gig";
  const latestRound = group.rounds[group.rounds.length - 1];
  const acceptorName = isAccepted && latestRound
    ? (latestRound.proposed_by === "buyer" || latestRound.offered_by === "buyer" ? group.employeeName : group.buyerName)
    : null;

  return (
    <div className={`relative rounded-lg border transition-colors ${isAccepted ? "border-emerald-300 bg-emerald-50/50" : isDeclined ? "border-rose-200 bg-rose-50/40" : "bg-background"}`}>
      {isGig && <GigRibbon />}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${isAccepted ? "bg-emerald-100 text-emerald-700" : "bg-purple-100 text-purple-700"}`}>
          <Handshake className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate">
            {group.employeeName} ↔ {group.buyerName}
          </p>
          <p className="text-[10px] text-muted-foreground truncate">
            {group.contextTitle}
          </p>
          {group.contextSubtitle && (
            <p className="text-[9px] text-muted-foreground/70 truncate flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" /> {group.contextSubtitle}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isAccepted && <Badge variant="success" className="text-[9px]">Accepted{acceptorName ? ` by ${acceptorName.split(" ")[0]}` : ""}</Badge>}
          {isDeclined && <Badge variant="destructive" className="text-[9px]">Declined</Badge>}
          {!isAccepted && !isDeclined && <Badge variant="outline" className="text-[9px]">{group.status}</Badge>}
          <Badge variant="secondary" className="text-[9px]">{group.source}</Badge>
          <span className="text-[10px] text-muted-foreground">{timeAgo(group.latestAt)}</span>
          {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t pt-2 space-y-2">
          {isAccepted && latestRound && (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> Offer Accepted
              </div>
              <p className="text-xs mt-1 text-muted-foreground">
                Final price: {formatPaise(latestRound.amount_paise ?? latestRound.proposed_price)} (proposed by {acceptorName ? group.employeeName === acceptorName ? group.buyerName : group.employeeName : "?"}) · Accepted by {acceptorName ?? "?"}
              </p>
              {group.contractId && (
                <div className="flex gap-2 mt-2">
                  <Button size="sm" variant="outline" className="h-6 text-[10px]" asChild>
                    <Link href={`/admin/monitor/${group.contractId}`}><ExternalLink className="h-3 w-3 mr-1" />Contract</Link>
                  </Button>
                </div>
              )}
            </div>
          )}
          {isDeclined && (
            <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium text-rose-700">
                <XCircle className="h-4 w-4" /> Offer Declined
              </div>
            </div>
          )}
          {group.rounds.length > 0 && (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Negotiation history</p>
              {group.rounds.map((r, i) => {
                const isBuyer = r.proposed_by === "buyer" || r.offered_by === "buyer";
                const proposerName = isBuyer ? group.buyerName : group.employeeName;
                const { text: rComment, days: rDays } = parseComment(r.comment ?? r.message);
                const isAcceptedRound = group.status === "accepted" && i === group.rounds.length - 1;
                return (
                  <div key={r.id} className={`rounded-lg border p-2.5 text-xs ${
                    isAcceptedRound ? "border-emerald-300 bg-emerald-50" :
                    isBuyer ? "bg-blue-50/50" : "bg-amber-50/50"
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        Round {r.round_number} — {proposerName} <span className="text-[10px] text-muted-foreground font-normal">({isBuyer ? "Buyer" : "Employee"})</span> proposed
                        {isAcceptedRound && <Badge variant="success" className="ml-1.5 text-[9px]">Accepted</Badge>}
                      </span>
                      <span className="font-semibold">{formatPaise(r.amount_paise)}</span>
                    </div>
                    {rComment && <p className="text-muted-foreground mt-1">{rComment}</p>}
                    {rDays && (
                      <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {rDays} day{rDays > 1 ? "s" : ""}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1">{timeAgo(r.created_at)}</p>
                  </div>
                );
              })}
            </>
          )}
          <div className="flex gap-2 pt-1">
            {group.contractId && (
              <Button size="sm" variant="outline" className="h-6 text-[10px]" asChild>
                <Link href={`/admin/monitor/${group.contractId}`}><ExternalLink className="h-3 w-3 mr-1" />Contract</Link>
              </Button>
            )}
            {group.taskId && (
              <Button size="sm" variant="outline" className="h-6 text-[10px]" asChild>
                <Link href={`/admin/tech/chat/${group.taskId}`}><ExternalLink className="h-3 w-3 mr-1" />View task</Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function SettlementMonitorPanel() {
  const sbRef = React.useRef<ReturnType<typeof createClient> | null>(null);
  const [groups, setGroups] = React.useState<NegGroup[]>([]);
  const [connection, setConnection] = React.useState<"online" | "offline" | "connecting">("connecting");
  const [search, setSearch] = React.useState("");
  const [sourceFilter, setSourceFilter] = React.useState<string>("all");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");

  const load = React.useCallback(async () => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;

    const result: NegGroup[] = [];

    // 1. Negotiation offers (gigs + direct hire) — each offer is its own card
    const { data: negOffers } = await sb
      .from("negotiation_offers")
      .select(`
        id, gig_id, employee_id, buyer_id, round_number, task_post_id,
        proposed_price, status, created_at, responded_at, comment,
        offer_type_new, contract_id, gig_requirements,
        buyer:users!negotiation_offers_buyer_id_fkey(full_name),
        employee:users!negotiation_offers_employee_id_fkey(full_name)
      `)
      .order("created_at", { ascending: false }) as any;

    if (negOffers && negOffers.length > 0) {
      const gigIds = (negOffers as any[]).filter((o: any) => o.gig_id).map((o: any) => o.gig_id);
      const gigMap = new Map<string, { title: string; slug: string }>();
      if (gigIds.length > 0) {
        const { data: gigs } = await sb.from("gigs").select("id, title, slug").in("id", gigIds);
        for (const g of (gigs ?? []) as any[]) gigMap.set(g.id, { title: g.title, slug: g.slug });
      }

      // Fetch task titles for direct hire offers that have task_post_id
      const taskPostIds = (negOffers as any[]).filter((o: any) => o.task_post_id && !o.gig_id).map((o: any) => o.task_post_id);
      const taskMap = new Map<string, { title: string }>();
      if (taskPostIds.length > 0) {
        const { data: tasks } = await sb.from("task_posts").select("id, title").in("id", taskPostIds);
        for (const t of (tasks ?? []) as any[]) taskMap.set(t.id, { title: t.title });
      }

      const offerIds = (negOffers as any[]).map((o: any) => o.id);
      const { data: negRounds } = await sb
        .from("negotiation_rounds")
        .select("*")
        .in("negotiation_id", offerIds)
        .order("round_number", { ascending: true }) as any;

      const roundsByOffer: Record<string, Round[]> = {};
      for (const r of (negRounds ?? []) as any) {
        const nid = r.negotiation_id;
        if (!nid) continue;
        if (!roundsByOffer[nid]) roundsByOffer[nid] = [];
        roundsByOffer[nid].push(r);
      }

      for (const o of (negOffers as any[])) {
        const extraRounds = roundsByOffer[o.id] ?? [];
        const gig = o.gig_id ? gigMap.get(o.gig_id) : null;
        const task = o.task_post_id && !o.gig_id ? taskMap.get(o.task_post_id) : null;

        let contextTitle: string;
        let contextSubtitle = "";
        if (gig) {
          contextTitle = gig.title;
          contextSubtitle = o.comment ?? "";
        } else if (task) {
          contextTitle = task.title;
          contextSubtitle = o.comment ?? "";
        } else {
          let parsed: { text?: string; expected_days?: number } | null = null;
          try { parsed = JSON.parse(o.comment ?? "null"); } catch { /* not JSON */ }
          if (parsed && typeof parsed === "object") {
            contextTitle = parsed.text?.trim() ? parsed.text : "Direct hire";
            if (parsed.expected_days) contextSubtitle = `${parsed.expected_days} day${parsed.expected_days === 1 ? "" : "s"}`;
          } else {
            contextTitle = o.comment ?? "Direct hire";
          }
          if (!contextSubtitle && o.gig_requirements) contextSubtitle = o.gig_requirements;
        }

        const firstRoundNum = o.round_number ?? 1;
        const rounds: Round[] = [{
          id: `no:${o.id}`, round_number: firstRoundNum,
          proposed_by: "buyer", amount_paise: o.proposed_price,
          comment: o.comment, status: o.status, created_at: o.created_at,
        }];
        for (const r of extraRounds) {
          // negotiation_rounds uses proposed_price — map to amount_paise for RoundRow
          if (r.round_number === firstRoundNum) continue; // already added from the offer object
          rounds.push({
            ...r,
            proposed_by: r.proposed_by,
            amount_paise: r.proposed_price ?? r.amount_paise ?? 0,
            status: r.status ?? "pending",
          });
        }
        const last = rounds[rounds.length - 1];
        result.push({
          pairKey: `no:${o.id}`,
          buyerName: o.buyer?.full_name ?? "?",
          employeeName: o.employee?.full_name ?? "?",
          source: o.gig_id ? "gig" : "direct",
          contextTitle,
          contextSubtitle,
          gigTitle: gig?.title,
          gigSlug: gig?.slug,
          status: o.status,
          rounds,
        latestAt: last.created_at,
          contractId: o.contract_id,
        });
      }
    }

    // 2. Settlement rounds (task applications) — each application is its own card
    const { data: sRounds } = await sb
      .from("settlement_rounds")
      .select(`
        id, application_id, round_number, offered_by, amount_paise,
        time_minutes, message, status, created_at,
        application:task_applications!inner(
          id, employee_id, task_id,
          task_posts:task_posts!inner(id, title, buyer_id, buyer:users!task_posts_buyer_id_fkey(id, full_name)),
          employee:users!task_applications_employee_id_fkey(id, full_name)
        )
      `)
      .order("created_at", { ascending: false }) as any;

    const settleByApp: Record<string, Round[]> = {};
    for (const r of (sRounds ?? []) as any) {
      const appId = r.application_id;
      if (!settleByApp[appId]) settleByApp[appId] = [];
      settleByApp[appId].push({ ...r, proposed_by: r.offered_by });
    }

    for (const [, rounds] of Object.entries(settleByApp)) {
      // Sort rounds chronologically (oldest first) for the timeline
      rounds.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const app = rounds[0]?.application;
      if (!app) continue;
      const latest = rounds[rounds.length - 1];
      const taskTitle = app.task_posts?.title ?? "Unknown task";
      result.push({
        pairKey: `app:${app.id}`,
        buyerName: app.task_posts?.buyer?.full_name ?? "?",
        employeeName: app.employee?.full_name ?? "?",
        source: "task",
        contextTitle: taskTitle,
        contextSubtitle: `${rounds.length} round${rounds.length === 1 ? "" : "s"}`,
        status: latest?.status ?? "pending",
        rounds,
        latestAt: latest.created_at,
        taskId: app.task_id,
        contractId: null,
      });
    }

    result.sort((a, b) => b.latestAt.localeCompare(a.latestAt));
    setGroups(result);
  }, []);

  React.useEffect(() => {
    load();
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const channel = sb
      .channel("settlement-monitor")
      .on("postgres_changes", { event: "*", schema: "public", table: "settlement_rounds" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "negotiation_rounds" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "negotiation_offers" }, () => load())
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setConnection("online");
        if (status === "CLOSED" || status === "CHANNEL_ERROR") setConnection("offline");
      });
    return () => { sb.removeChannel(channel); };
  }, [load]);

  const q = search.toLowerCase();
  const filtered = groups.filter(g =>
    (!q || g.buyerName.toLowerCase().includes(q) || g.employeeName.toLowerCase().includes(q) ||
      g.source.includes(q) || (g.gigTitle ?? "").toLowerCase().includes(q) ||
      g.contextTitle.toLowerCase().includes(q)) &&
    (sourceFilter === "all" || g.source === sourceFilter) &&
    statusMatches(g, statusFilter)
  );

  const activeCount = groups.filter(g => g.status !== "accepted" && g.status !== "declined").length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <div className="flex-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Handshake className="h-4 w-4 text-purple-600" />Settlement engine
            {activeCount > 0 && <Badge variant="secondary" className="text-[10px]">{activeCount} active</Badge>}
          </CardTitle>
          <CardDescription className="text-[11px]">
            Each row = one negotiation instance. Click to expand rounds.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Search by name, title or source..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 w-44 pl-6 text-[11px]"
            />
          </div>
          <Badge variant={connection === "online" ? "success" : connection === "offline" ? "destructive" : "secondary"} className="gap-1 text-[10px]">
            {connection === "online" ? <><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Live</> :
             connection === "connecting" ? <><Loader2 className="h-3 w-3 animate-spin" />Connecting…</> :
             <><X className="h-3 w-3" />Reconnecting…</>}
          </Badge>
        </div>
      </CardHeader>

      {/* Source filter tabs */}
      <div className="flex flex-wrap items-center gap-1.5 px-4 pb-2">
        {SOURCE_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSourceFilter(tab.key)}
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
              sourceFilter === tab.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <tab.icon className="h-3 w-3" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
              statusFilter === tab.key
                ? "bg-foreground text-background"
                : "border border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <CardContent className="space-y-3">
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">No negotiations found for the selected filters.</p>
        ) : (
          <>
            <CollapsibleSection title="Active" count={filtered.filter(g => g.status !== "accepted" && g.status !== "declined").length} defaultOpen>
              {filtered.filter(g => g.status !== "accepted" && g.status !== "declined").map(g => (
                <NegotiationCard key={g.pairKey} group={g} />
              ))}
            </CollapsibleSection>
            <CollapsibleSection title="Resolved" count={filtered.filter(g => g.status === "accepted" || g.status === "declined").length}>
              {filtered.filter(g => g.status === "accepted" || g.status === "declined").map(g => (
                <NegotiationCard key={g.pairKey} group={g} />
              ))}
            </CollapsibleSection>
          </>
        )}
      </CardContent>
    </Card>
  );
}
