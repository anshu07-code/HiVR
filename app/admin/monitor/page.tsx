import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Eye, ShieldAlert } from "lucide-react";
import { LiveMonitoringPanel } from "@/components/admin/live-monitoring-panel";

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

      <LiveMonitoringPanel monitorPath="/admin/monitor" />
    </div>
  );
}
