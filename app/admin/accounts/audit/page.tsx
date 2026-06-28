import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireAdmin } from "@/lib/admin-auth";
import { formatDate } from "@/lib/utils";
import { ScrollText, Wallet, KeyRound, EyeOff } from "lucide-react";

export const metadata = { title: "Audit Log — Accounts Panel" };
export const revalidate = 0;

export default async function AuditPage() {
  await requireAdmin();
  const sb = createClient();

  const [walletAudit, passwordAudit] = await Promise.all([
    sb.from("wallet_audit_log")
      .select("user_id, action, metadata, ip_address, created_at")
      .order("created_at", { ascending: false } as any)
      .limit(100) as any,
    sb.from("change_password_audit")
      .select("user_id, action, metadata, ip_address, created_at")
      .order("created_at", { ascending: false } as any)
      .limit(100) as any,
  ]);

  const walletEntries = (walletAudit as any)?.data ?? walletAudit ?? [];
  const pwEntries = (passwordAudit as any)?.data ?? passwordAudit ?? [];

  const allEntries = [
    ...walletEntries.map((e: any) => ({ ...e, source: "wallet" })),
    ...pwEntries.map((e: any) => ({ ...e, source: "password" })),
  ].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 100);

  return (
    <div className="container max-w-6xl space-y-6 py-8">
      <div className="flex items-center gap-2">
        <ScrollText className="h-5 w-5 text-primary" />
        <div>
          <h1 className="font-display text-2xl font-semibold">Audit Log</h1>
          <p className="text-sm text-muted-foreground">Recent wallet and security audit events</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Events</CardTitle>
          <CardDescription>Last 100 events across wallet and password audit logs</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {allEntries.length === 0 ? (
            <div className="grid place-items-center py-10 text-sm text-muted-foreground">
              No audit events yet
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Time</th>
                  <th className="px-4 py-3 text-left">User</th>
                  <th className="px-4 py-3 text-left">Source</th>
                  <th className="px-4 py-3 text-left">Action</th>
                  <th className="px-4 py-3 text-left">IP</th>
                </tr>
              </thead>
              <tbody>
                {allEntries.map((entry: any, i: number) => (
                  <tr key={`${entry.source}-${i}`} className="border-t">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{formatDate(entry.created_at)}</td>
                    <td className="max-w-[120px] truncate px-4 py-3 font-mono text-xs">{entry.user_id}</td>
                    <td className="px-4 py-3">
                      <Badge variant={entry.source === "wallet" ? "secondary" : "outline"} className="text-[10px]">
                        {entry.source === "wallet" ? <Wallet className="mr-0.5 h-3 w-3" /> : <KeyRound className="mr-0.5 h-3 w-3" />}
                        {entry.source}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{entry.action}</code>
                      {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          {JSON.stringify(entry.metadata).slice(0, 60)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{entry.ip_address ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
