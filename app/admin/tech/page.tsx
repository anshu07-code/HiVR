import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldAlert, MessageSquare, Database, Activity, AlertTriangle, Briefcase, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { timeAgo } from "@/lib/utils";
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

  // System health snapshot
  const { count: contractCount } = await sb.from("contracts").select("id", { count: "exact", head: true });
  const { count: messageCount } = await sb.from("messages").select("id", { count: "exact", head: true });
  const { count: workspaceCount } = await sb.from("workspaces").select("id", { count: "exact", head: true });
  const { count: workspaceMessageCount } = await sb.from("workspace_messages").select("id", { count: "exact", head: true });
  const { count: flaggedCount } = await sb.from("messages").select("id", { count: "exact", head: true }).eq("flagged_for_contact_info", true);
  const { count: ghostedCount } = await sb.from("workspace_messages").select("id", { count: "exact", head: true }).eq("is_ghosted", true);
  const { count: activeMonitors } = await sb.from("admin_monitoring_sessions").select("id", { count: "exact", head: true }).is("ended_at", null);

  // Pre-hiring chat & Q&A stats
  const { count: preHiringCount } = await sb.from("task_messages").select("id", { count: "exact", head: true });
  const { count: queryCount } = await sb.from("task_queries").select("id", { count: "exact", head: true });

  // Recent pre-hiring chats
  const { data: recentPreHiring } = await sb
    .from("task_messages")
    .select("id, task_id, sender_id, receiver_id, body, created_at, sender:users!task_messages_sender_id_fkey(full_name), receiver:users!task_messages_receiver_id_fkey(full_name)")
    .order("created_at", { ascending: false })
    .limit(15);

  // Recent Q&A activity
  const { data: recentQueries } = await sb
    .from("task_queries")
    .select("id, task_id, body, is_answer, created_at, asker_id, asker:users!task_queries_asker_id_fkey(full_name)")
    .order("created_at", { ascending: false })
    .limit(15);

  // Recent errors / flagged messages (contract chat)
  const { data: flagged } = await sb
    .from("messages")
    .select("id, contract_id, sender_id, content, created_at")
    .eq("flagged_for_contact_info", true)
    .order("created_at", { ascending: false })
    .limit(15);

  // Recent errors / ghosted messages (workspace chat)
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
        <p className="text-sm text-muted-foreground">System health, technical operations, and live chat monitoring.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-5">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Database className="h-3 w-3" />Contracts</div>
            <p className="mt-1 text-2xl font-bold">{contractCount ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Briefcase className="h-3 w-3" />Workspaces</div>
            <p className="mt-1 text-2xl font-bold">{workspaceCount ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><MessageSquare className="h-3 w-3" />Messages</div>
            <p className="mt-1 text-2xl font-bold">{(messageCount ?? 0) + (workspaceMessageCount ?? 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><AlertTriangle className="h-3 w-3" />Flagged + ghosted</div>
            <p className="mt-1 text-2xl font-bold text-rose-600">{(flaggedCount ?? 0) + (ghostedCount ?? 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Eye className="h-3 w-3" />Active monitors</div>
            <p className="mt-1 text-2xl font-bold text-primary">{activeMonitors ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      <LiveMonitoringPanel monitorPath="/admin/tech/chat" />
      <VaultMonitorPanel />
      <SettlementMonitorPanel />

      <RealtimePreHiringChats initialData={recentPreHiring as any} />

      {/* Pre-hiring chat count stat card */}
      <div className="text-right text-xs text-muted-foreground">
        Total pre-hiring messages: {preHiringCount ?? 0}
      </div>

      {/* Q&A monitoring */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-600">
            <Activity className="h-4 w-4" />Q&A activity ({queryCount ?? 0})
          </CardTitle>
          <CardDescription>Recent questions and answers (task_queries). All monitored for compliance.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5">
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

      {flagged && flagged.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="h-4 w-4" />Flagged contract messages
            </CardTitle>
            <CardDescription>Last 15 contract-chat messages auto-blocked for sharing contact info.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {flagged.map((m: any) => (
              <Link
                key={m.id}
                href={m.contract_id ? `/admin/monitor/${m.contract_id}` : "#"}
                className="block rounded-lg border border-rose-200 bg-rose-50/50 p-2.5 text-xs hover:bg-rose-50"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-rose-700">[blocked: contact-info attempt]</span>
                  <span className="text-muted-foreground">{timeAgo(m.created_at)}</span>
                </div>
                <p className="mt-0.5 truncate text-muted-foreground">{m.content}</p>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {ghosted && ghosted.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="h-4 w-4" />Ghosted workspace messages
            </CardTitle>
            <CardDescription>Workspace messages blocked by the ghost-block trigger. Recipients never saw these.</CardDescription>
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

    </div>
  );
}
