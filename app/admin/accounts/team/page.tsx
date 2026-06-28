import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireAdmin } from "@/lib/admin-auth";
import { formatDate } from "@/lib/utils";
import { UserCheck, Users, Shield } from "lucide-react";

export const metadata = { title: "Team — Accounts Panel" };
export const revalidate = 0;

export default async function TeamPage() {
  await requireAdmin();
  const sb = createClient();

  const [teamGrants, adminUsers] = await Promise.all([
    sb.from("accounts_team_grants")
      .select("user_id, granted_at, admin_users!inner(user_id, admin_role)")
      .order("granted_at", { ascending: false } as any)
      .limit(50) as any,
    sb.from("admin_users")
      .select("user_id, admin_role, granted_at")
      .order("granted_at", { ascending: false } as any)
      .limit(50) as any,
  ]);

  const teamMembers = (teamGrants as any)?.data ?? teamGrants ?? [];
  const allAdmins = (adminUsers as any)?.data ?? adminUsers ?? [];

  return (
    <div className="container max-w-5xl space-y-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Accounts Team</h1>
          <p className="text-sm text-muted-foreground">
            {teamMembers.length} member{teamMembers.length === 1 ? "" : "s"} with accounts access
          </p>
        </div>
        <Badge variant="secondary">{teamMembers.length} members</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCheck className="h-4 w-4 text-primary" />
            Accounts Team Members
          </CardTitle>
          <CardDescription>
            These users can review anonymous profile requests, verify documents, and access anonymous profile data.
            Only a super_admin can add or remove members via the database.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {teamMembers.length === 0 ? (
            <div className="grid place-items-center py-10 text-sm text-muted-foreground">
              <Users className="mb-2 h-8 w-8" />
              No accounts team members yet
              <p className="mt-1 text-xs">A super_admin needs to add members via the accounts_team_grants table.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr><th className="px-4 py-3 text-left">User ID</th><th className="px-4 py-3 text-left">Admin Role</th><th className="px-4 py-3 text-left">Granted</th></tr>
              </thead>
              <tbody>
                {(teamMembers ?? []).map((grant: any) => (
                  <tr key={grant.user_id} className="border-t">
                    <td className="max-w-[160px] truncate px-4 py-3 font-mono text-xs">{grant.user_id}</td>
                    <td className="px-4 py-3"><Badge variant="secondary">{grant.admin_users?.admin_role ?? "—"}</Badge></td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(grant.granted_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 text-muted-foreground" />
            All Admin Users
          </CardTitle>
          <CardDescription>Full list of admin_users for reference</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr><th className="px-4 py-3 text-left">User ID</th><th className="px-4 py-3 text-left">Role</th><th className="px-4 py-3 text-left">Granted</th></tr>
            </thead>
            <tbody>
              {(allAdmins ?? []).map((admin: any) => (
                <tr key={admin.user_id} className="border-t">
                  <td className="max-w-[160px] truncate px-4 py-3 font-mono text-xs">{admin.user_id}</td>
                  <td className="px-4 py-3"><Badge>{admin.admin_role}</Badge></td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(admin.granted_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
