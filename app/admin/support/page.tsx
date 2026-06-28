import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, MessageSquare, Star, AlertCircle, CheckCircle2, Clock, TrendingUp } from "lucide-react";
import Link from "next/link";
import { timeAgo } from "@/lib/utils";
import { requireAdmin } from "@/lib/admin-auth";

export const metadata = { title: "Support - HiVR admin" };
export const revalidate = 0;

export default async function AdminSupportPage() {
  await requireAdmin();
  const sb = createClient();
  const [{ data: tickets }, { data: agents }, { data: ratings }] = await Promise.all([
    sb.from("support_tickets")
      .select("id, subject, category, status, priority, created_at, first_response_at, resolved_at, user:users!support_tickets_user_id_fkey(full_name, email), agent:users!support_tickets_agent_id_fkey(full_name)")
      .order("updated_at", { ascending: false })
      .limit(50),
    sb.from("support_agents")
      .select("user_id, display_name, specialty, status, rating_avg, total_resolved, user:users!support_agents_user_id_fkey(full_name, email), active_at")
      .order("rating_avg", { ascending: false }),
    sb.from("support_ratings").select("satisfaction, resolved, agent_id"),
  ]);

  const open = (tickets ?? []).filter(t => ["open","pending","in_progress","waiting_user"].includes(t.status));
  const resolved = (tickets ?? []).filter(t => ["resolved","closed"].includes(t.status));
  const unassigned = open.filter(t => !t.agent_id);
  const avgSat = (ratings ?? []).length > 0 ? (ratings ?? []).reduce((s, r) => s + r.satisfaction, 0) / (ratings ?? []).length : 0;
  const resolvedPct = (ratings ?? []).length > 0 ? Math.round((ratings ?? []).filter(r => r.resolved).length / (ratings ?? []).length * 100) : 0;

  return (
    <div className="container max-w-6xl space-y-6 py-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Support console</h1>
        <p className="text-sm text-muted-foreground">Customer care overview, ticket queue, and agent performance.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi Icon={MessageSquare} label="Open tickets" value={String(open.length)} hint={`${unassigned.length} unassigned`} />
        <Kpi Icon={CheckCircle2} label="Resolved" value={String(resolved.length)} hint={`${resolvedPct}% resolution rate`} />
        <Kpi Icon={Star} label="Avg satisfaction" value={avgSat > 0 ? `${avgSat.toFixed(1)} / 5` : "—"} />
        <Kpi Icon={Users} label="Active agents" value={String((agents ?? []).filter(a => a.status === "online").length)} hint={`${(agents ?? []).length} total`} />
      </div>

      {/* AGENT PERFORMANCE TABLE */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Agent performance</CardTitle>
              <CardDescription>Sorted by rating. Click to see tickets handled by each agent.</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/support/agents">Manage agents</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {(agents ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No agents yet. <Link href="/admin/support/agents" className="text-primary underline">Add one</Link>.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr><th className="px-2 py-1">Agent</th><th className="px-2 py-1">Specialty</th><th className="px-2 py-1">Status</th><th className="px-2 py-1 text-right">Resolved</th><th className="px-2 py-1 text-right">Rating</th></tr>
              </thead>
              <tbody>
                {(agents ?? []).map(a => (
                  <tr key={a.user_id} className="border-t">
                    <td className="px-2 py-2">
                      <div className="font-medium">{a.display_name}</div>
                      <div className="text-xs text-muted-foreground">{(a.user as any)?.email}</div>
                    </td>
                    <td className="px-2 py-2 capitalize">{a.specialty}</td>
                    <td className="px-2 py-2">
                      <Badge variant={a.status === "online" ? "success" : a.status === "busy" ? "warning" : "secondary"} className="capitalize">{a.status}</Badge>
                    </td>
                    <td className="px-2 py-2 text-right">{a.total_resolved}</td>
                    <td className="px-2 py-2 text-right">
                      {a.rating_avg > 0 ? <span className="font-medium">{Number(a.rating_avg).toFixed(2)} ★</span> : <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* TICKET QUEUE */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ticket queue (last 50)</CardTitle>
        </CardHeader>
        <CardContent>
          {(tickets ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No tickets yet.</p>
          ) : (
            <ul className="divide-y">
              {(tickets ?? []).map(t => (
                <li key={t.id} className="py-3">
                  <Link href={`/admin/support/${t.id}`} className="flex items-start gap-3 -mx-3 px-3 py-2 rounded-md hover:bg-accent/30">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium">{t.subject}</p>
                        <StatusBadge status={t.status} />
                        <PriorityBadge priority={t.priority} />
                        {!t.agent_id && <Badge variant="destructive" className="text-[10px]">Unassigned</Badge>}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {(t.user as any)?.full_name} · {t.category} · {timeAgo(t.created_at)}
                        {(t.agent as any)?.full_name ? ` · ${(t.agent as any).full_name}` : ""}
                        {t.first_response_at ? ` · first reply ${timeAgo(t.first_response_at)}` : ""}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ Icon, label, value, hint }: { Icon: any; label: string; value: string; hint?: string }) {
  return (
    <Card><CardContent className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-2 font-display text-2xl font-semibold">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </CardContent></Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const v = status === "resolved" || status === "closed" ? "secondary" : status === "in_progress" ? "warning" : "outline";
  return <Badge variant={v as any} className="capitalize">{status.replace("_", " ")}</Badge>;
}
function PriorityBadge({ priority }: { priority: string }) {
  const v = priority === "urgent" ? "destructive" : priority === "high" ? "warning" : "secondary";
  return <Badge variant={v as any} className="capitalize">{priority}</Badge>;
}
