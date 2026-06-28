import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MessageSquare, Eye } from "lucide-react";
import { AdminWorkspaceChatView } from "@/components/admin/admin-workspace-chat-view";
import { AdminContractChatView } from "@/components/admin/admin-contract-chat-view";

const ALLOWED_ROLES = new Set([
  "super_admin", "contact_admin", "tech_executive", "trust_safety_admin",
]);

export default async function AdminMonitorPage({ params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/admin/monitor");

  const { data: adminRow } = await sb
    .from("admin_users")
    .select("admin_role")
    .eq("user_id", user.id)
    .maybeSingle();
  const role = (adminRow as any)?.admin_role as string | undefined;
  if (!role || !ALLOWED_ROLES.has(role)) {
    return (
      <div className="container max-w-3xl py-12 text-center">
        <Eye className="mx-auto h-12 w-12 text-rose-500" />
        <h1 className="mt-4 text-xl font-semibold">Not authorised</h1>
        <p className="mt-2 text-sm text-muted-foreground">Monitoring is restricted to admins.</p>
      </div>
    );
  }

  const { data: profile } = await sb.from("users").select("full_name").eq("id", user.id).maybeSingle();
  const currentAdminName = (profile as any)?.full_name ?? "Admin";

  // Try workspace first
  const { data: ws } = await sb
    .from("workspaces")
    .select(`
      id, status, chat_locked_at,
      buyer:users!workspaces_buyer_id_fkey(id, full_name, email, avatar_url, is_suspended, contact_warning_count),
      employee:users!workspaces_employee_id_fkey(id, full_name, email, avatar_url, is_suspended, contact_warning_count),
      contract:contracts(id, category:skill_categories(name, tier), agreed_price)
    `)
    .eq("id", params.id)
    .maybeSingle();

  if (ws) {
    const w = ws as any;
    return (
      <div className="container max-w-6xl space-y-3 py-6">
        <div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/tech"><ArrowLeft className="h-3.5 w-3.5" />Back to tech panel</Link>
          </Button>
        </div>
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 p-4 text-sm">
            <Eye className="h-4 w-4 text-primary" />
            <div>
              <p className="font-semibold">Monitoring workspace</p>
              <p className="text-xs text-muted-foreground">
                {w.buyer?.full_name} ↔ {w.employee?.full_name} · {w.contract?.category?.name ?? "—"} · ₹{w.contract?.agreed_price ? (w.contract.agreed_price / 100).toFixed(0) : "—"} · status: <span className="font-mono">{w.status}</span>
              </p>
            </div>
          </CardContent>
        </Card>
        <AdminWorkspaceChatView
          workspaceId={w.id}
          currentAdminId={user.id}
          currentAdminName={currentAdminName}
          buyer={w.buyer}
          employee={w.employee}
        />
      </div>
    );
  }

  // Try contract
  const { data: c } = await sb
    .from("contracts")
    .select(`
      id, status, agreed_price, started_at, last_message_at,
      buyer:users!contracts_buyer_id_fkey(id, full_name, email, avatar_url, is_suspended, contact_warning_count),
      employee:users!contracts_employee_id_fkey(id, full_name, email, avatar_url, is_suspended, contact_warning_count),
      category:skill_categories(name, tier)
    `)
    .eq("id", params.id)
    .maybeSingle();

  if (c) {
    const contract = c as any;
    return (
      <div className="container max-w-6xl space-y-3 py-6">
        <div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/contact"><ArrowLeft className="h-3.5 w-3.5" />Back to contact panel</Link>
          </Button>
        </div>
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 p-4 text-sm">
            <MessageSquare className="h-4 w-4 text-primary" />
            <div>
              <p className="font-semibold">Monitoring contract chat</p>
              <p className="text-xs text-muted-foreground">
                {contract.buyer?.full_name} ↔ {contract.employee?.full_name} · {contract.category?.name} · ₹{(contract.agreed_price / 100).toFixed(0)} · status: <span className="font-mono">{contract.status}</span>
              </p>
            </div>
          </CardContent>
        </Card>
        <AdminContractChatView
          contractId={contract.id}
          currentAdminId={user.id}
          buyer={contract.buyer}
          employee={contract.employee}
        />
      </div>
    );
  }

  notFound();
}
