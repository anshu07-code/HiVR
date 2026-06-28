import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Briefcase, Eye, ShieldAlert, ExternalLink } from "lucide-react";
import { LiveMonitoringPanel } from "@/components/admin/live-monitoring-panel";
import { timeAgo, formatPaise } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set([
  "super_admin", "contact_admin", "tech_executive", "trust_safety_admin",
]);

export default async function MonitorIndex() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/admin/monitor");

  const { data: adminRow } = await sb.from("admin_users").select("admin_role").eq("user_id", user.id).maybeSingle();
  const role = (adminRow as any)?.admin_role as string | undefined;
  if (!role || !ALLOWED_ROLES.has(role)) {
    return (
      <div className="container max-w-3xl py-12 text-center">
        <ShieldAlert className="mx-auto h-12 w-12 text-rose-500" />
        <h1 className="mt-4 text-xl font-semibold">Not authorised</h1>
        <p className="mt-2 text-sm text-muted-foreground">Live monitoring is restricted to admins.</p>
      </div>
    );
  }

  // Get all contracts + workspaces with recent activity
  const { data: contracts } = await sb
    .from("contracts")
    .select(`
      id, status, agreed_price, last_message_at,
      buyer:users!contracts_buyer_id_fkey(id, full_name, avatar_url, is_suspended, contact_warning_count),
      employee:users!contracts_employee_id_fkey(id, full_name, avatar_url, is_suspended, contact_warning_count),
      category:skill_categories(name, tier)
    `)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(50);

  const { data: workspaces } = await sb
    .from("workspaces")
    .select(`
      id, status, last_message_at,
      buyer:users!workspaces_buyer_id_fkey(id, full_name, avatar_url, is_suspended, contact_warning_count),
      employee:users!workspaces_employee_id_fkey(id, full_name, avatar_url, is_suspended, contact_warning_count),
      contract:contracts(id, category:skill_categories(name, tier), agreed_price)
    `)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(50);

  return (
    <div className="container max-w-6xl space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Eye className="h-6 w-6 text-primary" />Live monitor
        </h1>
        <p className="text-sm text-muted-foreground">
          Click any chat to start a live monitoring session. Sessions heartbeat every 15s and auto-expire after 2 minutes of inactivity.
        </p>
      </div>

      <LiveMonitoringPanel />

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Briefcase className="h-4 w-4" />Workspace chats
            </CardTitle>
            <CardDescription>All workspace conversations. Click to monitor live.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {!workspaces || workspaces.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No workspaces yet.</p>
            ) : (workspaces as any[]).map((w) => (
              <Link
                key={w.id}
                href={`/admin/monitor/${w.id}`}
                className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
              >
                <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary text-xs font-bold">
                  {(w.contract?.category?.name ?? "?")[0]?.toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    <span className="font-semibold">{w.buyer?.full_name ?? "Buyer"}</span>
                    <span className="text-muted-foreground"> ↔ </span>
                    <span className="font-semibold">{w.employee?.full_name ?? "Employee"}</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {w.contract?.category?.name} · ₹{w.contract?.agreed_price ? (w.contract.agreed_price / 100).toFixed(0) : "—"} · {w.last_message_at ? `last activity ${timeAgo(w.last_message_at)}` : "no activity yet"}
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px]">{w.status}</Badge>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="h-4 w-4" />Contract chats
            </CardTitle>
            <CardDescription>Legacy contract chat (pre-workspace). Also monitored live.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {!contracts || contracts.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No contract chats yet.</p>
            ) : (contracts as any[]).map((c) => (
              <Link
                key={c.id}
                href={`/admin/monitor/${c.id}`}
                className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
              >
                <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary text-xs font-bold">
                  {(c.category?.name ?? "?")[0]?.toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    <span className="font-semibold">{c.buyer?.full_name ?? "Buyer"}</span>
                    <span className="text-muted-foreground"> ↔ </span>
                    <span className="font-semibold">{c.employee?.full_name ?? "Employee"}</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {c.category?.name} · {formatPaise(c.agreed_price)} · {c.last_message_at ? `last activity ${timeAgo(c.last_message_at)}` : "no activity"}
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px]">{c.status}</Badge>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
