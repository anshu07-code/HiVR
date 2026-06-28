"use client";

/**
 * components/dashboard/realtime-activity-panel.tsx
 *
 * Role-aware activity feed with realtime updates. Replaces the old
 * "What's new" / DashboardActivity card. For buyers: surfaces
 * applications received, contract milestones, payments. For employees:
 * new tasks, offers, contract updates, payments received. For both:
 * both views.
 *
 * Quick links row also adapts by role.
 */
import * as React from "react";
import Link from "next/link";
import {
  Wallet, MessageSquare, Star, ChevronRight, Briefcase,
  CheckCircle2, Send, Loader2, Sparkles, Activity, FileText, IndianRupee,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatPaise, timeAgo } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

export type Activity = {
  id: string;
  kind: "contract" | "payment" | "message" | "review" | "milestone" | "application" | "task" | "offer";
  title: string;
  subtitle?: string;
  amount_paise?: number | null;
  href: string;
  at: string;
  tone?: "neutral" | "success" | "warn" | "info";
  role: "buyer" | "employee" | "shared";
};

type Role = "buyer" | "employee" | "both";

type Props = {
  userId: string;
  role: Role;
  initialActivity: Activity[];
  pendingReviewCount?: number;
  unreadMessages?: number;
  // Counts for quick-link badges (server-rendered initial values)
  initialCounts?: {
    activeContracts: number;
    pendingApplications?: number;
    openOffers?: number;
    unreadMessages: number;
    pendingReviews: number;
  };
};

function activityTone(tone?: Activity["tone"]) {
  switch (tone) {
    case "success": return "text-emerald-600 bg-emerald-500/10";
    case "warn":    return "text-amber-600 bg-amber-500/10";
    case "info":    return "text-sky-600 bg-sky-500/10";
    default:        return "text-muted-foreground bg-muted";
  }
}

function iconForKind(kind: Activity["kind"]): any {
  switch (kind) {
    case "contract":    return Briefcase;
    case "payment":     return Wallet;
    case "message":     return MessageSquare;
    case "review":      return Star;
    case "milestone":   return CheckCircle2;
    case "application": return FileText;
    case "task":        return Sparkles;
    case "offer":       return Send;
  }
}

export function RealtimeActivityPanel({
  userId, role, initialActivity, pendingReviewCount = 0, unreadMessages: initialUnread = 0,
  initialCounts,
}: Props) {
  const sbRef = React.useRef<ReturnType<typeof createClient> | null>(null);
  const [activity, setActivity] = React.useState<Activity[]>(initialActivity);
  const [unreadMessages, setUnreadMessages] = React.useState(initialUnread);
  const [refreshing, setRefreshing] = React.useState(false);
  const [counts, setCounts] = React.useState(initialCounts ?? {
    activeContracts: 0,
    pendingApplications: 0,
    openOffers: 0,
    unreadMessages: initialUnread,
    pendingReviews: pendingReviewCount,
  });

  React.useEffect(() => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const ch = sb
      .channel(`role-activity-${userId}`)
      // Buyer-side events
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "task_applications", filter: `task.buyer_id=eq.${userId}` }, () => refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "application_offers", filter: `buyer_id=eq.${userId}` }, () => refresh())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "contracts", filter: `buyer_id=eq.${userId}` }, () => refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "payments" }, () => refresh())
      // Employee-side events
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "task_applications", filter: `employee_id=eq.${userId}` }, () => refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "application_offers", filter: `employee_id=eq.${userId}` }, () => refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "instant_hire_offers", filter: `candidate_id=eq.${userId}` }, () => refresh())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "contracts", filter: `employee_id=eq.${userId}` }, () => refresh())
      // Shared
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => { refresh(); setUnreadMessages((n) => n + 1); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "workspace_messages" }, () => { refresh(); setUnreadMessages((n) => n + 1); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "reviews", filter: `reviewee_id=eq.${userId}` }, () => refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "reviews", filter: `reviewer_id=eq.${userId}` }, () => refresh())
      .subscribe();
    return () => { sb.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function refresh() {
    setRefreshing(true);
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const showBuyer = role === "buyer" || role === "both";
    const showEmployee = role === "employee" || role === "both";

    const [pRes, cRes, mRes, wRes, rRes, appsEmp, offersEmp, appsBuyer, offersBuyer, tasksBuyer] = await Promise.all([
      sb.from("payments").select("id, amount, status, created_at, contract:contracts(id, buyer_id, employee_id, task:task_posts(title))").order("created_at", { ascending: false }).limit(15),
      sb.from("contracts").select("id, status, agreed_price, started_at, completed_at, buyer_id, employee_id, task:task_posts(title), buyer:users!contracts_buyer_id_fkey(id, full_name), employee:users!contracts_employee_id_fkey(id, full_name)").or(`buyer_id.eq.${userId},employee_id.eq.${userId}`).order("started_at", { ascending: false }).limit(15),
      sb.from("messages").select("id, contract_id, content, created_at, contract:contracts(id, task:task_posts(title), buyer_id, employee_id)").or(`sender_id.eq.${userId},contract.contracts.buyer_id.eq.${userId},contract.contracts.employee_id.eq.${userId}`).order("created_at", { ascending: false }).limit(10),
      sb.from("workspace_messages").select("id, workspace_id, body, created_at, workspace:workspaces!inner(id, contract:contracts(task:task_posts(title)))").order("created_at", { ascending: false }).limit(8),
      sb.from("reviews").select("id, contract_id, rating, comment, created_at, reviewee_id, reviewer_id, reviewee:users!reviews_reviewee_id_fkey(id, full_name)").or(`reviewer_id.eq.${userId},reviewee_id.eq.${userId}`).order("created_at", { ascending: false }).limit(10),
      showEmployee ? sb.from("task_applications").select("id, status, created_at, task:task_posts!inner(id, title, buyer_id)").eq("employee_id", userId).order("created_at", { ascending: false }).limit(8) : Promise.resolve({ data: [] as any[] }),
      showEmployee ? sb.from("application_offers").select("id, status, created_at, rate_paise, task:task_posts!inner(id, title)").eq("employee_id", userId).order("created_at", { ascending: false }).limit(8) : Promise.resolve({ data: [] as any[] }),
      showBuyer ? sb.from("task_applications").select("id, status, created_at, task:task_posts!inner(id, title, buyer_id), employee:users!task_applications_employee_id_fkey(id, full_name)").eq("task.buyer_id", userId).order("created_at", { ascending: false }).limit(8) : Promise.resolve({ data: [] as any[] }),
      showBuyer ? sb.from("application_offers").select("id, status, created_at, rate_paise, employee:users!application_offers_employee_id_fkey(id, full_name)").eq("buyer_id", userId).order("created_at", { ascending: false }).limit(8) : Promise.resolve({ data: [] as any[] }),
      showBuyer ? sb.from("task_posts").select("id, title, status, created_at, applications:task_applications(count)").eq("buyer_id", userId).order("created_at", { ascending: false }).limit(6) : Promise.resolve({ data: [] as any[] }),
    ]);

    const merged: Activity[] = [];

    // Buyer-side
    if (showBuyer) {
      for (const a of (appsBuyer.data ?? []) as any[]) {
        merged.push({
          id: `app-${a.id}`,
          kind: "application",
          title: `${a.employee?.full_name ?? "Someone"} applied to "${a.task?.title ?? "your task"}"`,
          subtitle: `Status: ${a.status}`,
          href: `/dashboard/tasks/${a.task?.id}/applicants`,
          at: a.created_at,
          tone: a.status === "hired" ? "success" : "info",
          role: "buyer",
        });
      }
      for (const o of (offersBuyer.data ?? []) as any[]) {
        merged.push({
          id: `off-${o.id}`,
          kind: "offer",
          title: `Offer ${o.status} to ${o.employee?.full_name ?? "candidate"} · ${formatPaise(o.rate_paise)}`,
          subtitle: "Application offer",
          href: "/dashboard/contracts",
          at: o.created_at,
          tone: o.status === "accepted" ? "success" : o.status === "declined" ? "warn" : "info",
          role: "buyer",
        });
      }
      for (const t of (tasksBuyer.data ?? []) as any[]) {
        const appsCount = (t.applications as any)?.[0]?.count ?? 0;
        if (appsCount === 0) continue;
        merged.push({
          id: `task-${t.id}`,
          kind: "task",
          title: `"${t.title}" · ${appsCount} application${appsCount === 1 ? "" : "s"}`,
          subtitle: "New interest on your post",
          href: `/dashboard/tasks/${t.id}/applicants`,
          at: t.created_at,
          tone: "info",
          role: "buyer",
        });
      }
    }

    // Employee-side
    if (showEmployee) {
      for (const a of (appsEmp.data ?? []) as any[]) {
        merged.push({
          id: `app-emp-${a.id}`,
          kind: "application",
          title: `You applied to "${a.task?.title ?? "a task"}"`,
          subtitle: `Status: ${a.status}`,
          href: "/dashboard/applications",
          at: a.created_at,
          tone: a.status === "hired" ? "success" : "info",
          role: "employee",
        });
      }
      for (const o of (offersEmp.data ?? []) as any[]) {
        merged.push({
          id: `off-emp-${o.id}`,
          kind: "offer",
          title: `Offer received · ${formatPaise(o.rate_paise)} for "${o.task?.title ?? "task"}"`,
          subtitle: `Status: ${o.status}`,
          href: "/dashboard/applications",
          at: o.created_at,
          tone: o.status === "accepted" ? "success" : o.status === "declined" ? "warn" : "info",
          role: "employee",
        });
      }
    }

    // Shared
    for (const p of (pRes.data ?? []) as any[]) {
      if (!p.contract) continue;
      const isMine = p.contract.buyer_id === userId || p.contract.employee_id === userId;
      if (!isMine) continue;
      merged.push({
        id: `pay-${p.id}`,
        kind: "payment",
        title: `Payment ${p.status} · ${formatPaise(p.amount)}`,
        subtitle: p.contract.task?.title ?? "Payment",
        amount_paise: p.amount,
        href: "/dashboard/payments",
        at: p.created_at,
        tone: p.status === "failed" ? "warn" : p.status === "released" ? "success" : "info",
        role: "shared",
      });
    }
    for (const c of (cRes.data ?? []) as any[]) {
      if (c.status === "active") continue;
      merged.push({
        id: `con-${c.id}`,
        kind: "contract",
        title: `Contract ${c.status.replace("_", " ")}`,
        subtitle: `${c.task?.title ?? "Contract"} · ${formatPaise(c.agreed_price)}`,
        amount_paise: c.agreed_price,
        href: `/dashboard/contracts/${c.id}`,
        at: c.completed_at ?? c.started_at,
        tone: c.status === "completed" ? "success" : c.status === "cancelled" ? "warn" : "info",
        role: "shared",
      });
    }
    for (const m of (mRes.data ?? []) as any[]) {
      if (!m.contract) continue;
      merged.push({
        id: `msg-${m.id}`,
        kind: "message",
        title: m.content?.slice(0, 60) ?? "(empty)",
        subtitle: m.contract.task?.title ?? "Contract message",
        href: "/dashboard/messages",
        at: m.created_at,
        tone: "neutral",
        role: "shared",
      });
    }
    for (const w of (wRes.data ?? []) as any[]) {
      if (!w.workspace?.contract?.task) continue;
      merged.push({
        id: `wm-${w.id}`,
        kind: "message",
        title: w.body?.slice(0, 60) ?? "(empty)",
        subtitle: `Workspace · ${w.workspace.contract.task.title}`,
        href: `/dashboard/workspaces/${w.workspace.id}`,
        at: w.created_at,
        tone: "info",
        role: "shared",
      });
    }
    for (const r of (rRes.data ?? []) as any[]) {
      merged.push({
        id: `rv-${r.id}`,
        kind: "review",
        title: r.reviewer_id === userId
          ? `You rated ${r.reviewee?.full_name ?? "counterparty"} ${r.rating}★`
          : `You got ${r.rating}★ from a buyer`,
        subtitle: r.comment?.slice(0, 60) ?? "—",
        href: "/dashboard/reviews",
        at: r.created_at,
        tone: "success",
        role: "shared",
      });
    }

    merged.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    setActivity(merged.slice(0, 12));

    // Update quick-link counts
    const activeContracts = (cRes.data ?? []).filter((c: any) => c.status === "active").length;
    setCounts((c) => ({
      ...c,
      activeContracts,
      unreadMessages: initialUnread, // keep baseline; bell handles live increment
    }));

    setRefreshing(false);
  }

  const visible = activity.slice(0, 8);

  return (
    <Card>
      <CardHeader className="space-y-2 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-primary" />
            {role === "employee" ? "Your work feed" : role === "buyer" ? "Your hiring feed" : "Your activity feed"}
            {refreshing && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            {unreadMessages > 0 && (
              <Badge variant="default" className="text-[10px]">
                {unreadMessages} new
              </Badge>
            )}
          </CardTitle>
          <Button asChild size="sm" variant="ghost">
            <Link href="/dashboard/messages">
              View messages<ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
        {/* Quick links row — role-aware */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <QuickLink
            href="/dashboard/payments"
            icon={Wallet}
            label="Payments"
            tone="text-sky-600 bg-sky-500/10"
          />
          <QuickLink
            href="/dashboard/messages"
            icon={MessageSquare}
            label="Messages"
            tone="text-violet-600 bg-violet-500/10"
            badge={unreadMessages > 0 ? String(unreadMessages) : null}
          />
          <QuickLink
            href="/dashboard/reviews"
            icon={Star}
            label="Reviews"
            tone="text-amber-600 bg-amber-500/10"
            badge={pendingReviewCount > 0 ? String(pendingReviewCount) : null}
          />
          <QuickLink
            href={role === "employee" ? "/dashboard/applications" : "/dashboard/contracts"}
            icon={Briefcase}
            label={role === "employee" ? "Applications" : "Contracts"}
            tone="text-emerald-600 bg-emerald-500/10"
            badge={counts.activeContracts > 0 ? String(counts.activeContracts) : null}
          />
        </div>
      </CardHeader>
      <CardContent>
        {visible.length === 0 ? (
          <p className="rounded-md border border-dashed bg-muted/20 py-8 text-center text-[11px] text-muted-foreground">
            {role === "employee"
              ? "No activity yet. Apply to a task or wait for an offer to land here."
              : role === "buyer"
              ? "No activity yet. Post a task or hire a freelancer to see updates here."
              : "No activity yet. Post a task, apply to one, or hire a freelancer."}
          </p>
        ) : (
          <ol className="space-y-1.5">
            {visible.map((a) => {
              const Icon = iconForKind(a.kind);
              return (
                <li key={a.id}>
                  <Link
                    href={a.href}
                    className="group flex items-start gap-2.5 rounded-md p-2 text-xs transition-colors hover:bg-muted"
                  >
                    <span className={cn(
                      "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full",
                      activityTone(a.tone)
                    )}>
                      <Icon className="h-3 w-3" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{a.title}</p>
                      {a.subtitle && (
                        <p className="truncate text-[10px] text-muted-foreground">{a.subtitle}</p>
                      )}
                    </div>
                    <RoleChip role={a.role} />
                    <span className="shrink-0 text-[9px] text-muted-foreground">{timeAgo(a.at)}</span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function QuickLink({ href, icon: Icon, label, tone, badge }: { href: string; icon: any; label: string; tone: string; badge?: string | null }) {
  return (
    <Link
      href={href}
      className="group relative flex items-center gap-2 rounded-md border bg-background p-2 transition-colors hover:border-primary/40 hover:bg-accent"
    >
      <div className={cn("grid h-7 w-7 place-items-center rounded-md", tone)}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <p className="text-xs font-medium">{label}</p>
      {badge && (
        <Badge variant="default" className="ml-auto text-[9px]">{badge}</Badge>
      )}
    </Link>
  );
}

function RoleChip({ role }: { role: Activity["role"] }) {
  if (role === "shared") return null;
  return (
    <Badge
      variant="outline"
      className={cn(
        "shrink-0 text-[8px] uppercase",
        role === "buyer"
          ? "border-primary/40 text-primary"
          : "border-emerald-500/40 text-emerald-600"
      )}
    >
      {role === "buyer" ? "Buy" : "Work"}
    </Badge>
  );
}
