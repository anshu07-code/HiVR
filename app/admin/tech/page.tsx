import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldAlert, MessageSquare, Database, Activity, AlertTriangle, Briefcase, Eye, Users, ChevronDown, ChevronRight, CheckCircle2, Clock, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/utils";
import { CollapsiblePanel } from "@/components/admin/collapsible-panel";
import { LiveMonitoringPanel } from "@/components/admin/live-monitoring-panel";
import { VaultMonitorPanel } from "@/components/admin/vault-monitor-panel";
import { SettlementMonitorPanel } from "@/components/admin/settlement-monitor-panel";
import { RealtimePreHiringChats } from "@/components/admin/realtime-prehiring";

export const dynamic = "force-dynamic";

export default async function TechAdminHome() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/admin/tech");

  const { data: adminRow } = await sb.from("admin_users").select("admin_role").eq("user_id", user.id).maybeSingle();
  const role = adminRow?.admin_role;
  if (!role || !["super_admin", "tech_executive", "trust_safety_admin"].includes(role)) {
    return (
      <div className="container max-w-3xl py-12 text-center">
        <ShieldAlert className="mx-auto h-12 w-12 text-rose-500" />
        <h1 className="mt-4 text-xl font-semibold">Not authorised</h1>
        <p className="mt-2 text-sm text-muted-foreground">This page is for HiVR's tech team only.</p>
      </div>
    );
  }

  // Stats — segregated counts
  const [
    { count: totalContracts },
    { count: activeContracts },
    { count: totalWorkspaces },
    { count: activeWorkspaces },
    { count: deliveredWorkspaces },
    { count: completedWorkspaces },
    { count: totalMessages },
    { count: workspaceMessageCount },
    { count: flaggedCount },
    { count: ghostedCount },
    { count: activeMonitors },
    { count: preHiringCount },
    { count: queryCount },
  ] = await Promise.all([
    sb.from("contracts").select("id", { count: "exact", head: true }),
    sb.from("contracts").select("id", { count: "exact", head: true }).in("status", ["active", "funded", "in_progress", "delivered", "in_review"]),
    sb.from("workspaces").select("id", { count: "exact", head: true }),
    sb.from("workspaces").select("id", { count: "exact", head: true }).in("status", ["awaiting_funding", "funded", "in_review", "frozen"]),
    sb.from("workspaces").select("id", { count: "exact", head: true }).eq("status", "delivered"),
    sb.from("workspaces").select("id", { count: "exact", head: true }).eq("status", "completed"),
    sb.from("messages").select("id", { count: "exact", head: true }),
    sb.from("workspace_messages").select("id", { count: "exact", head: true }),
    sb.from("messages").select("id", { count: "exact", head: true }).eq("flagged_for_contact_info", true),
    sb.from("workspace_messages").select("id", { count: "exact", head: true }).eq("is_ghosted", true),
    sb.from("admin_monitoring_sessions").select("id", { count: "exact", head: true }).is("ended_at", null),
    sb.from("direct_messages").select("id", { count: "exact", head: true }),
    sb.from("task_queries").select("id", { count: "exact", head: true }),
  ]);

  // Waitlist with user details
  const { data: waitlistCategories } = await sb
    .from("skill_categories")
    .select("id, slug, name, status")
    .is("parent_category_id", null)
    .order("sort_order");

  const waitlistDetails: Record<string, { count: number; entries: { name: string; role: string; joined_at: string }[] }> = {};
  for (const wcat of waitlistCategories ?? []) {
    if (wcat.status === "active") continue;
    const { data: entries } = await sb
      .from("category_waitlist")
      .select("user_id, role_interest, joined_at, user:users(full_name)")
      .eq("category_id", wcat.id)
      .order("joined_at", { ascending: false }) as any;
    if (entries && entries.length > 0) {
      waitlistDetails[wcat.slug] = {
        count: entries.length,
        entries: entries.map((e: any) => ({
          name: e.user?.full_name ?? "?",
          role: e.role_interest === "buyer" ? "Hiring" : "Work",
          joined_at: e.joined_at,
        })),
      };
    }
  }

  // Recent Q&A activity
  const { data: recentQueries } = await sb
    .from("task_queries")
    .select("id, task_id, body, is_answer, created_at, asker_id, asker:users!task_queries_asker_id_fkey(full_name)")
    .order("created_at", { ascending: false })
    .limit(15);

  // Flagged & ghosted
  const { data: flagged } = await sb
    .from("messages")
    .select("id, contract_id, sender_id, content, created_at")
    .eq("flagged_for_contact_info", true)
    .order("created_at", { ascending: false })
    .limit(15);

  const { data: ghosted } = await sb
    .from("workspace_messages")
    .select("id, workspace_id, sender_id, body, flag_reason, created_at, sender:users!workspace_messages_sender_id_fkey(full_name)")
    .eq("is_ghosted", true)
    .order("created_at", { ascending: false })
    .limit(15);

  return (
    <div className="container max-w-6xl space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-bold">Tech Executive Panel</h1>
        <p className="text-sm text-muted-foreground">System health, technical operations, and live monitoring.</p>
      </div>

      {/* Stats cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Database className="h-3 w-3" />Total contracts</div>
            <p className="mt-1 text-2xl font-bold">{totalContracts ?? 0}</p>
            <p className="text-[10px] text-muted-foreground">{activeContracts ?? 0} active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Briefcase className="h-3 w-3" />Workspaces</div>
            <p className="mt-1 text-2xl font-bold">{totalWorkspaces ?? 0}</p>
            <p className="text-[10px] text-muted-foreground">
              {activeWorkspaces ?? 0} active · {deliveredWorkspaces ?? 0} delivered · {completedWorkspaces ?? 0} completed
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><MessageSquare className="h-3 w-3" />Messages</div>
            <p className="mt-1 text-2xl font-bold">{(totalMessages ?? 0) + (workspaceMessageCount ?? 0)}</p>
            <p className="text-[10px] text-muted-foreground">{totalMessages ?? 0} contract · {workspaceMessageCount ?? 0} workspace</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><AlertTriangle className="h-3 w-3" />Flagged + ghosted</div>
            <p className="mt-1 text-2xl font-bold text-rose-600">{(flaggedCount ?? 0) + (ghostedCount ?? 0)}</p>
            <p className="text-[10px] text-muted-foreground">{flaggedCount ?? 0} flagged · {ghostedCount ?? 0} ghosted</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Eye className="h-3 w-3" />Active monitors</div>
            <p className="mt-1 text-2xl font-bold text-primary">{activeMonitors ?? 0}</p>
            <p className="text-[10px] text-muted-foreground">live monitoring sessions</p>
          </CardContent>
        </Card>
      </div>

      {/* Collapsible panels */}
      <CollapsiblePanel title="Live monitoring feed" icon={<Eye className="h-4 w-4" />} color="text-rose-600" defaultOpen={false}>
        <LiveMonitoringPanel monitorPath="/admin/tech/chat" />
      </CollapsiblePanel>

      <CollapsiblePanel title="Vault monitor" icon={<Database className="h-4 w-4" />} color="text-blue-600" defaultOpen={false}>
        <VaultMonitorPanel />
      </CollapsiblePanel>

      <CollapsiblePanel title="Settlement engine" icon={<Activity className="h-4 w-4" />} color="text-purple-600" defaultOpen={false}>
        <SettlementMonitorPanel />
      </CollapsiblePanel>

      <CollapsiblePanel title={`Pre-hiring chats (${preHiringCount ?? 0} direct messages)`} icon={<MessageSquare className="h-4 w-4" />} color="text-amber-600" defaultOpen={false}>
        <RealtimePreHiringChats />
      </CollapsiblePanel>

      <CollapsiblePanel title={`Q&A activity (${queryCount ?? 0})`} icon={<Activity className="h-4 w-4" />} color="text-blue-600" defaultOpen={false}>
        <Card className="border-0 shadow-none">
          <CardContent className="p-0 space-y-1.5">
            {!recentQueries || recentQueries.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No Q&A activity.</p>
            ) : recentQueries.map((q: any) => (
              <Link
                key={q.id}
                href={`/admin/tech/chat/${q.task_id}`}
                className="block rounded-lg border p-2.5 text-xs transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {q.asker?.full_name ?? "?"}
                    {q.is_answer && <Badge variant="success" className="ml-1 text-[9px]">Answer</Badge>}
                  </span>
                  <span className="text-muted-foreground">{timeAgo(q.created_at)}</span>
                </div>
                <p className="mt-0.5 truncate text-muted-foreground">{q.body}</p>
              </Link>
            ))}
          </CardContent>
        </Card>
      </CollapsiblePanel>

      <CollapsiblePanel title={`Category waitlist (${Object.keys(waitlistDetails).length} categories)`} icon={<Users className="h-4 w-4" />} color="text-amber-600" defaultOpen={false}>
        <Card className="border-0 shadow-none">
          <CardContent className="p-0 space-y-3">
            {Object.keys(waitlistDetails).length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No coming-soon categories with waitlist entries.</p>
            ) : (
              <div className="grid gap-3">
                {(waitlistCategories ?? []).filter(c => waitlistDetails[c.slug]).map(c => {
                  const wl = waitlistDetails[c.slug];
                  return (
                    <details key={c.id} className="group rounded-lg border">
                      <summary className="flex cursor-pointer items-center justify-between px-3 py-2.5 text-sm hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{c.name}</span>
                          <Badge variant="outline" className="text-[10px]">{wl.count} waiting</Badge>
                        </div>
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground group-open:rotate-180 transition-transform" />
                      </summary>
                      <div className="border-t px-3 py-2 space-y-1.5">
                        {wl.entries.map((e, i) => (
                          <div key={i} className="flex items-center justify-between rounded-md bg-muted/30 px-2.5 py-1.5 text-xs">
                            <span className="font-medium">{e.name}</span>
                            <div className="flex items-center gap-2">
                              <Badge variant={e.role === "Hiring" ? "outline" : "secondary"} className="text-[9px]">{e.role}</Badge>
                              <span className="text-muted-foreground">{timeAgo(e.joined_at)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </CollapsiblePanel>

      <CollapsiblePanel title="Contract compliance" icon={<ShieldAlert className="h-4 w-4" />} color="text-rose-600" defaultOpen={false}>
        <div className="space-y-3">
          {flagged && flagged.length > 0 && (
            <Card className="border border-rose-200">
              <CardHeader className="py-2.5">
                <CardTitle className="flex items-center gap-2 text-xs text-rose-700">
                  <AlertTriangle className="h-3.5 w-3.5" />Flagged contract messages ({flagged.length})
                </CardTitle>
                <CardDescription className="text-[10px]">Auto-blocked contact-info attempts</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {flagged.map((m: any) => (
                  <Link
                    key={m.id}
                    href={m.contract_id ? `/admin/monitor/${m.contract_id}` : "#"}
                    className="block rounded-lg border border-rose-200 bg-rose-50/50 p-2.5 text-xs hover:bg-rose-50"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-rose-700">[blocked: contact-info]</span>
                      <span className="text-muted-foreground">{timeAgo(m.created_at)}</span>
                    </div>
                    <p className="mt-0.5 truncate text-muted-foreground">{m.content}</p>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
          {ghosted && ghosted.length > 0 && (
            <Card className="border border-rose-200">
              <CardHeader className="py-2.5">
                <CardTitle className="flex items-center gap-2 text-xs text-rose-700">
                  <AlertTriangle className="h-3.5 w-3.5" />Ghosted workspace messages ({ghosted.length})
                </CardTitle>
                <CardDescription className="text-[10px]">Blocked by ghost-block trigger</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {ghosted.map((m: any) => (
                  <Link
                    key={m.id}
                    href={m.workspace_id ? `/admin/monitor/${m.workspace_id}` : "#"}
                    className="block rounded-lg border border-rose-200 bg-rose-50/50 p-2.5 text-xs hover:bg-rose-50"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-rose-700">
                        [ghost-blocked] {m.sender?.full_name ?? "?"}
                        {m.flag_reason && <span className="ml-1 text-rose-500">— {m.flag_reason}</span>}
                      </span>
                      <span className="text-muted-foreground">{timeAgo(m.created_at)}</span>
                    </div>
                    <p className="mt-0.5 truncate text-muted-foreground">{m.body}</p>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
          {(!flagged || flagged.length === 0) && (!ghosted || ghosted.length === 0) && (
            <p className="py-4 text-center text-sm text-muted-foreground">No compliance issues.</p>
          )}
        </div>
      </CollapsiblePanel>
    </div>
  );
}
