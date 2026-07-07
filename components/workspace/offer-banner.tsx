"use client";

import * as React from "react";
import Link from "next/link";
import { X, Sparkles, Briefcase, IndianRupee, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { formatPaise, timeUntil } from "@/lib/utils";

type OfferRow = {
  id: string;
  kind: "application_offer" | "negotiation_offer" | "shortlist" | "settlement";
  ref_id: string;
  task_id: string;
  task_title: string;
  amount_paise: number | null;
  expires_at: string | null;
  buyer_name: string | null;
  employee_name: string | null;
  message: string | null;
  created_at: string;
  applicant_id: string;
  buyer_id: string;
  side: "employee" | "buyer";
  round_number?: number;
  application_id?: string;
};

const DISMISS_KEY = (id: string) => `offer-banner-dismiss:${id}`;

function isDismissed(id: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(DISMISS_KEY(id));
    if (!raw) return false;
    const until = Number(raw);
    return until > Date.now();
  } catch { return false; }
}

function setDismissed(id: string, hours: number) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DISMISS_KEY(id), String(Date.now() + hours * 3600_000));
  } catch {}
}

export function OfferBanner({ userId, profile }: { userId: string; profile: { current_mode?: string; roles?: string[] } | null }) {
  const [offers, setOffers] = React.useState<OfferRow[]>([]);
  const [now, setNow] = React.useState(Date.now());
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const sbRef = React.useRef<ReturnType<typeof createClient> | null>(null);

  const side: "employee" | "buyer" = profile?.current_mode === "buyer" ? "buyer" : "employee";

  const load = React.useCallback(async () => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;

    const { data: settings } = await sb
      .from("platform_settings")
      .select("key, value")
      .eq("key", "offer_reminder_intervals_hours")
      .maybeSingle();
    const intervals = (settings as any)?.value?.value ?? [2, 24, 72];

    if (side === "employee") {
      const [{ data: appOffers }, { data: negOffers }, { data: shortlists }, { data: allSettleRounds }] = await Promise.all([
        (sb as any).from("application_offers").select("id, application_id, amount_paise, expires_at, message, created_at, applications:task_applications!inner(id, task_id, employee_id, task:task_posts!inner(id, title, buyer:users!task_posts_buyer_id_fkey(id, full_name)))")
          .eq("status", "pending")
          .eq("applications.employee_id", userId)
          .gt("expires_at", new Date().toISOString()),
        sb.from("negotiation_offers")
          .select("id, task_post_id, proposed_price, created_at, comment, task:task_posts(id, title, buyer:users!task_posts_buyer_id_fkey(id, full_name))")
          .eq("employee_id", userId)
          .eq("status", "pending"),
        (sb as any).from("task_applications")
          .select("id, task_id, employee_id, created_at, updated_at, task:task_posts!inner(id, title, buyer:users!task_posts_buyer_id_fkey(id, full_name))")
          .eq("employee_id", userId)
          .eq("status", "shortlisted"),
        (sb as any).from("settlement_rounds")
          .select("id, application_id, round_number, amount_paise, status, offered_by, created_at, application:task_applications!inner(id, task_id, employee_id, task:task_posts!inner(id, title, buyer:users!task_posts_buyer_id_fkey(id, full_name)))")
          .eq("application.employee_id", userId)
          .eq("status", "pending"),
      ]);
      const settleAppIds = new Set((allSettleRounds ?? []).map((r: any) => r.application_id));
      const settleRounds = (allSettleRounds ?? []).filter((r: any) => r.offered_by === "buyer");

      const rows: OfferRow[] = [];

      for (const o of (appOffers ?? []) as any[]) {
        const createdAt = new Date(o.created_at).getTime();
        const exp = new Date(o.expires_at).getTime();
        const elapsedH = (Date.now() - createdAt) / 3600_000;
        const intervalPassed = intervals.some((h: number) => elapsedH >= h - 0.1);
        if (!intervalPassed && !isDismissed(`ao:${o.id}`)) continue;
        if (isDismissed(`ao:${o.id}`)) {
          const until = Number(localStorage.getItem(DISMISS_KEY(`ao:${o.id}`)) || 0);
          if (until > Date.now()) continue;
        }
        rows.push({
          id: `ao:${o.id}`,
          kind: "application_offer",
          ref_id: o.id,
          task_id: o.applications?.task_id ?? o.applications?.task?.id,
          task_title: o.applications?.task?.title ?? "Task",
          amount_paise: o.amount_paise,
          expires_at: o.expires_at,
          buyer_name: o.applications?.task?.buyer?.full_name ?? null,
          employee_name: null,
          message: o.message,
          created_at: o.created_at,
          applicant_id: userId,
          buyer_id: o.applications?.task?.buyer?.id ?? "",
          side: "employee",
        });
      }

      for (const o of (negOffers ?? []) as any[]) {
        if (isDismissed(`no:${o.id}`)) continue;
        const createdAt = new Date(o.created_at).getTime();
        const expiresAt = new Date(createdAt + 24 * 3600_000).toISOString();
        if (new Date(expiresAt).getTime() < Date.now()) continue;
        const elapsedH = (Date.now() - createdAt) / 3600_000;
        const intervalPassed = intervals.some((h: number) => elapsedH >= h - 0.1);
        if (!intervalPassed) continue;
        rows.push({
          id: `no:${o.id}`,
          kind: "negotiation_offer",
          ref_id: o.id,
          task_id: o.task_post_id,
          task_title: o.task?.title ?? "Task",
          amount_paise: o.proposed_price,
          expires_at: expiresAt,
          buyer_name: o.task?.buyer?.full_name ?? null,
          employee_name: null,
          message: o.comment,
          created_at: o.created_at,
          applicant_id: userId,
          buyer_id: o.task?.buyer?.id ?? "",
          side: "employee",
        });
      }

      for (const a of (shortlists ?? []) as any[]) {
        if (settleAppIds.has(a.id)) continue;
        if (isDismissed(`sl:${a.id}`)) continue;
        rows.push({
          id: `sl:${a.id}`,
          kind: "shortlist",
          ref_id: a.id,
          task_id: a.task_id ?? a.task?.id,
          task_title: a.task?.title ?? "Task",
          amount_paise: null,
          expires_at: null,
          buyer_name: a.task?.buyer?.full_name ?? null,
          employee_name: null,
          message: null,
          created_at: a.updated_at ?? a.created_at,
          applicant_id: userId,
          buyer_id: a.task?.buyer?.id ?? "",
          side: "employee",
        });
      }

      for (const r of (settleRounds ?? []) as any[]) {
        if (isDismissed(`st:${r.id}`)) continue;
        rows.push({
          id: `st:${r.id}`,
          kind: "settlement",
          ref_id: r.id,
          task_id: r.application?.task_id ?? r.application?.task?.id,
          task_title: r.application?.task?.title ?? "Task",
          amount_paise: r.amount_paise,
          expires_at: null,
          buyer_name: r.application?.task?.buyer?.full_name ?? null,
          employee_name: null,
          message: `Round ${r.round_number} counter`,
          created_at: r.created_at,
          applicant_id: userId,
          buyer_id: r.application?.task?.buyer?.id ?? "",
          side: "employee",
          round_number: r.round_number,
          application_id: r.application_id,
        });
      }

      setOffers(rows);
    } else {
      const [{ data: pendingApps }, { data: allSettleRounds }] = await Promise.all([
        (sb as any).from("task_applications")
          .select("id, task_id, employee_id, created_at, updated_at, employee:users!task_applications_employee_id_fkey(id, full_name), task:task_posts!inner(id, title, buyer_id)")
          .eq("task.buyer_id", userId)
          .not("status", "eq", "hired")
          .not("status", "eq", "rejected")
          .not("status", "eq", "withdrawn"),
        (sb as any).from("settlement_rounds")
          .select("id, application_id, round_number, amount_paise, status, offered_by, created_at, application:task_applications!inner(id, task_id, employee_id, employee:users!task_applications_employee_id_fkey(id, full_name), task:task_posts!inner(id, title, buyer_id))")
          .eq("status", "pending"),
      ]);

      const settleRounds = (allSettleRounds ?? []).filter(
        (r: any) => r.application?.task?.buyer_id === userId && r.offered_by === "employee"
      );
      const settleAppIds = new Set((settleRounds ?? []).map((r: any) => r.application_id));

      const rows: OfferRow[] = [];
      for (const a of (pendingApps ?? []) as any[]) {
        if (settleAppIds.has(a.id)) continue;
        if (isDismissed(`ba:${a.id}`)) continue;
        rows.push({
          id: `ba:${a.id}`,
          kind: "application_offer",
          ref_id: a.id,
          task_id: a.task_id ?? a.task?.id,
          task_title: a.task?.title ?? "Task",
          amount_paise: null,
          expires_at: null,
          buyer_name: null,
          employee_name: a.employee?.full_name ?? null,
          message: null,
          created_at: a.updated_at ?? a.created_at,
          applicant_id: a.employee_id,
          buyer_id: userId,
          side: "buyer",
        });
      }

      for (const r of (settleRounds ?? []) as any[]) {
        if (isDismissed(`st:${r.id}`)) continue;
        rows.push({
          id: `st:${r.id}`,
          kind: "settlement",
          ref_id: r.id,
          task_id: r.application?.task_id ?? r.application?.task?.id,
          task_title: r.application?.task?.title ?? "Task",
          amount_paise: r.amount_paise,
          expires_at: null,
          buyer_name: null,
          employee_name: r.application?.employee?.full_name ?? null,
          message: `Round ${r.round_number} counter`,
          created_at: r.created_at,
          applicant_id: r.application?.employee_id ?? "",
          buyer_id: userId,
          side: "buyer",
          round_number: r.round_number,
          application_id: r.application_id,
        });
      }

      setOffers(rows);
    }
  }, [side, userId]);

  React.useEffect(() => {
    load();
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const channel = sb
      .channel("offer-banner-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "application_offers" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "negotiation_offers" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "task_applications" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "settlement_rounds" }, () => load())
      .subscribe();
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => { clearInterval(t); sb.removeChannel(channel); };
  }, [load]);

  const dismiss = (row: OfferRow) => {
    setDismissed(row.id, 876000);
    setOffers((prev) => prev.filter((o) => o.id !== row.id));
  };

  const respond = async (row: OfferRow, response: "accepted" | "declined") => {
    setBusyId(row.id);
    try {
      if (row.kind === "application_offer") {
        const r = await fetch(`/api/applications/offer/${row.ref_id}/respond`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ response }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok || !data.ok) { alert(data?.error ?? "Failed"); return; }
        if (response === "accepted" && data.contract_id) {
          window.location.href = `/dashboard/contracts/${data.contract_id}`;
          return;
        }
        setOffers((prev) => prev.filter((o) => o.id !== row.id));
      } else if (row.kind === "negotiation_offer") {
        const r = await fetch(`/api/negotiation/respond`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ offer_id: row.ref_id, response }),
        });
        if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d?.error ?? "Failed"); return; }
        setOffers((prev) => prev.filter((o) => o.id !== row.id));
      } else {
        window.location.href = "/dashboard/applications";
      }
    } finally {
      setBusyId(null);
    }
  };

  const visible = offers.filter((o) => {
    if (o.expires_at && new Date(o.expires_at).getTime() < now) return false;
    return true;
  });
  if (visible.length === 0) return null;

  return (
    <div className="sticky top-0 z-50 w-full border-b border-amber-300/40 bg-gradient-to-r from-amber-50 via-amber-100 to-amber-50 text-amber-900 shadow-sm">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-3 py-2 text-xs sm:text-sm">
        {visible.slice(0, 2).map((o) => {
          const isEmployee = o.side === "employee";
          const expired = o.expires_at ? new Date(o.expires_at).getTime() < now : false;
          return (
            <div key={o.id} className="flex items-center gap-2">
              {isEmployee ? <Sparkles className="h-4 w-4 shrink-0 text-amber-600" /> : <Briefcase className="h-4 w-4 shrink-0 text-amber-600" />}
              <div className="min-w-0 flex-1">
                <p className="truncate">
                  {isEmployee ? (
                    <>
                      <span className="font-semibold">You have an offer</span> for{" "}
                      <span className="font-medium">{o.task_title}</span>
                      {o.amount_paise != null && (
                        <> — <span className="font-semibold">{formatPaise(o.amount_paise)}</span></>
                      )}
                      {o.buyer_name && <> from <span className="font-medium">{o.buyer_name}</span></>}
                      {o.expires_at && !expired && (
                        <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] text-amber-700">
                          <Clock className="h-3 w-3" />Expires {timeUntil(o.expires_at)}
                        </span>
                      )}
                      {expired && <span className="ml-1 text-[10px] text-destructive">Expired</span>}
                    </>
                  ) : (
                    <>
                      Awaiting response from <span className="font-medium">{o.employee_name ?? "applicant"}</span> on{" "}
                      <span className="font-medium">{o.task_title}</span>
                    </>
                  )}
                </p>
              </div>
              {o.kind === "settlement" ? (
                <Button size="sm" variant="outline" className="h-6 shrink-0 px-2 text-[10px]" asChild>
                  <Link href={isEmployee ? `/dashboard/applications?settleAppId=${o.application_id}` : `/dashboard/tasks/${o.task_id}/applicants?settleAppId=${o.application_id}`}>View</Link>
                </Button>
              ) : isEmployee ? (
                <div className="flex shrink-0 items-center gap-1">
                  <Button size="sm" variant="gradient" className="h-6 px-2 text-[10px]" disabled={busyId === o.id || expired} onClick={() => respond(o, "accepted")}>
                    {busyId === o.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                    Accept
                  </Button>
                  <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" disabled={busyId === o.id || expired} onClick={() => respond(o, "declined")}>
                    <XCircle className="h-3 w-3" />Decline
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" className="h-6 shrink-0 px-2 text-[10px]" asChild>
                  <Link href="/dashboard/applications">View</Link>
                </Button>
              )}
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => dismiss(o)}
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-amber-700 hover:bg-amber-200/60"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
        {visible.length > 2 && (
          <p className="text-[10px] text-amber-700">+{visible.length - 2} more pending offers</p>
        )}
      </div>
    </div>
  );
}
