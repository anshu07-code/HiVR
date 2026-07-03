import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, ShieldAlert, Users, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/utils";
import { LiveFlaggedChats } from "./live-flagged-chats";
import { LiveMonitoringPanel } from "@/components/admin/live-monitoring-panel";
import { VaultMonitorPanel } from "@/components/admin/vault-monitor-panel";
import { SettlementMonitorPanel } from "@/components/admin/settlement-monitor-panel";
import { RealtimePreHiringChats } from "@/components/admin/realtime-prehiring";

export const dynamic = "force-dynamic";

export default async function ContactAdminHome() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/admin/contact");

  // Gate: must be contact_admin / super_admin / trust_safety_admin
  const { data: adminRow } = await sb.from("admin_users").select("admin_role").eq("user_id", user.id).maybeSingle();
  const role = adminRow?.admin_role;
  if (!role || !["super_admin", "contact_admin", "trust_safety_admin"].includes(role)) {
    return (
      <div className="container max-w-3xl py-12 text-center">
        <ShieldAlert className="mx-auto h-12 w-12 text-rose-500" />
        <h1 className="mt-4 text-xl font-semibold">Not authorised</h1>
        <p className="mt-2 text-sm text-muted-foreground">This page is for HiVR's contact &amp; trust-safety team only.</p>
      </div>
    );
  }

  // Get flagged messages
  const { data: flagged } = await sb
    .from("messages")
    .select("id, contract_id, sender_id, content, created_at, sender:users!messages_sender_id_fkey(full_name)")
    .eq("flagged_for_contact_info", true)
    .order("created_at", { ascending: false })
    .limit(50);

  // Pre-hiring chat & Q&A monitoring
  const { count: preHiringCount } = await sb.from("task_messages").select("id", { count: "exact", head: true });
  const { count: queryCount } = await sb.from("task_queries").select("id", { count: "exact", head: true });
  const { data: recentPreHiring } = await sb
    .from("task_messages")
    .select("id, task_id, sender_id, receiver_id, body, created_at, sender:users!task_messages_sender_id_fkey(full_name), receiver:users!task_messages_receiver_id_fkey(full_name)")
    .order("created_at", { ascending: false })
    .limit(20);
  const { data: recentQueries } = await sb
    .from("task_queries")
    .select("id, task_id, body, is_answer, created_at, asker_id, asker:users!task_queries_asker_id_fkey(full_name)")
    .order("created_at", { ascending: false })
    .limit(20);

  // Get suspended / warning users
  const { data: warned } = await sb
    .from("users")
    .select("id, full_name, email, is_suspended, contact_warning_count, suspension_reason")
    .or("is_suspended.eq.true,contact_warning_count.gt.0")
    .order("contact_warning_count", { ascending: false })
    .limit(30);

  return (
    <div className="container max-w-6xl space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-bold">Contact &amp; Trust-Safety Panel</h1>
        <p className="text-sm text-muted-foreground">
          Monitor all buyer↔employee conversations. Take action on suspicious content.
        </p>
      </div>

      <LiveFlaggedChats />
      <LiveMonitoringPanel monitorPath="/admin/monitor" />
      <VaultMonitorPanel />
      <SettlementMonitorPanel />

      {/* Quick actions */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Flagged messages</p>
            <p className="mt-1 text-2xl font-bold text-rose-600">{flagged?.length ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Suspended users</p>
            <p className="mt-1 text-2xl font-bold text-amber-600">{warned?.filter(w => w.is_suspended).length ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Flagged messages */}
      {flagged && flagged.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="h-4 w-4" />Flagged contact-info attempts
            </CardTitle>
            <CardDescription>Last 50 attempts blocked by the contact-info detector.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {flagged.map((m: any) => (
              <Link
                key={m.id}
                href={`/admin/monitor/${m.contract_id ?? ""}`}
                className="block rounded-lg border border-rose-200 bg-rose-50/50 p-3 hover:bg-rose-50"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm">
                    <span className="font-semibold">{m.sender?.full_name ?? "Anonymous"}</span>
                    <span className="text-muted-foreground"> tried to share contact info</span>
                  </p>
                  <span className="text-[10px] text-muted-foreground">{timeAgo(m.created_at)}</span>
                </div>
                <p className="mt-1 truncate rounded bg-background/60 px-2 py-1 text-xs text-muted-foreground">{m.content}</p>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <RealtimePreHiringChats initialData={recentPreHiring as any} />

      {/* Q&A monitoring */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-600">
            <MessageSquare className="h-4 w-4" />Q&A activity ({queryCount ?? 0})
          </CardTitle>
          <CardDescription>Public questions and answers on task listings (task_queries).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {!recentQueries || recentQueries.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No Q&A activity.</p>
          ) : recentQueries.map((q: any) => (
            <Link
              key={q.id}
              href={`/admin/monitor/${q.task_id}`}
              className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
            >
              <div className="grid h-9 w-9 place-items-center rounded-full bg-blue-500/10 text-blue-600">
                <MessageSquare className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {q.asker?.full_name ?? "?"}
                  {q.is_answer && <Badge variant="success" className="ml-1.5 text-[9px]">Answer</Badge>}
                </p>
                <p className="truncate text-xs text-muted-foreground">{q.body}</p>
              </div>
              <span className="whitespace-nowrap text-[10px] text-muted-foreground">{timeAgo(q.created_at)}</span>
            </Link>
          ))}
        </CardContent>
      </Card>

      {/* Suspended / warned users */}
      {warned && warned.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Users with warnings / suspensions</CardTitle>
            <CardDescription>Click to review the user's history.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {warned.map((u: any) => (
              <div key={u.id} className="flex items-center gap-3 rounded-lg border p-3">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-muted">
                  <Users className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{u.full_name ?? "Anonymous"}</p>
                  <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                  {u.suspension_reason && <p className="text-[10px] text-rose-600">{u.suspension_reason}</p>}
                </div>
                {u.is_suspended ? (
                  <Badge variant="destructive">Suspended</Badge>
                ) : (
                  <Badge variant="outline">{u.contact_warning_count} warning{u.contact_warning_count === 1 ? "" : "s"}</Badge>
                )}
                <form action="/api/admin/users/update" method="post">
                  <input type="hidden" name="user_id" value={u.id} />
                  <input type="hidden" name="is_suspended" value={String(!u.is_suspended)} />
                  <Button type="submit" size="sm" variant="outline">
                    {u.is_suspended ? "Unsuspend" : "Suspend"}
                  </Button>
                </form>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
