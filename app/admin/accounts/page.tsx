import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/admin-auth";
import { formatDate } from "@/lib/utils";
import { CheckCircle2, XCircle, Clock, UserCheck, FileText, Globe, Briefcase, EyeOff, ArrowRight } from "lucide-react";
import { approveAnonymousAction, rejectAnonymousAction } from "./actions";

export const metadata = { title: "Accounts Panel — HiVR Admin" };
export const revalidate = 0;

export default async function AdminAccountsDashboard() {
  await requireAdmin();
  const sb = createClient();

  const [pendingReq, approvedReq, pendingDocs, pendingSocial, pendingWork, teamCount, auditRecent] = await Promise.all([
    sb.from("anonymous_requests").select("id, user_id, requested_tier, justification, created_at").eq("status", "pending").order("created_at", { ascending: false }).limit(10) as any,
    sb.from("anonymous_profiles").select("user_id, display_id, tier, created_at").eq("status", "approved").order("created_at", { ascending: false }).limit(5) as any,
    sb.from("anonymous_documents").select("id, filename, document_type, created_at, user_id").eq("verification_status", "pending").order("created_at", { ascending: false }).limit(5) as any,
    sb.from("anonymous_social_links").select("id, platform, url, created_at, user_id").eq("verification_status", "pending").order("created_at", { ascending: false }).limit(5) as any,
    sb.from("anonymous_work_experience").select("id, company, role, created_at, user_id").eq("verification_status", "pending").order("created_at", { ascending: false }).limit(5) as any,
    sb.from("accounts_team_grants").select("user_id", { count: "exact" }) as any,
    sb.from("wallet_audit_log").select("user_id, action, created_at").eq("action", "anonymous_approve").order("created_at", { ascending: false }).limit(10) as any,
  ]);

  const pending = pendingReq?.data ?? pendingReq ?? [];
  const approved = approvedReq?.data ?? approvedReq ?? [];
  const pendingDocList = pendingDocs?.data ?? pendingDocs ?? [];
  const pendingSocList = pendingSocial?.data ?? pendingSocial ?? [];
  const pendingWorkList = pendingWork?.data ?? pendingWork ?? [];
  const teamMembers = teamCount?.count ?? teamCount?.length ?? 0;
  const auditEntries = auditRecent?.data ?? auditRecent ?? [];

  const totalPendingVerifications = pendingDocList.length + pendingSocList.length + pendingWorkList.length;

  return (
    <div className="container max-w-7xl space-y-6 py-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-primary to-purple-600 text-white shadow-lg">
            <EyeOff className="h-6 w-6" />
          </div>
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">Accounts Panel</h1>
            <p className="text-sm text-muted-foreground">
              Manage anonymous profile requests, verifications, and team members
            </p>
          </div>
        </div>
        <Badge variant="secondary" className="text-xs">{teamMembers} team members</Badge>
      </div>

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard
          icon={<UserCheck className="h-4 w-4" />}
          label="Pending Requests"
          value={pending.length}
          href="/admin/accounts"
          variant={pending.length > 0 ? "amber" : "default"}
        />
        <StatCard
          icon={<FileText className="h-4 w-4" />}
          label="Pending Verifications"
          value={totalPendingVerifications}
          href="/admin/accounts/verifications"
          variant={totalPendingVerifications > 0 ? "amber" : "default"}
        />
        <StatCard
          icon={<EyeOff className="h-4 w-4" />}
          label="Active Anonymous"
          value={approved.length}
          variant="default"
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="Recent Actions"
          value={auditEntries.length}
          href="/admin/accounts/audit"
          variant="default"
        />
      </div>

      {/* Pending anonymous requests */}
      <Card className="border-amber-500/30">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" />
              Pending Anonymous Requests
              <Badge variant="outline" className="ml-1 text-xs">{pending.length}</Badge>
            </CardTitle>
            <CardDescription>Employees requesting anonymous profiles</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {pending.length === 0 ? (
            <div className="grid place-items-center py-8 text-sm text-muted-foreground">
              <CheckCircle2 className="mb-2 h-5 w-5 text-emerald-500" />
              No pending requests
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">User</th>
                  <th className="px-4 py-3 text-left">Tier</th>
                  <th className="px-4 py-3 text-left">Justification</th>
                  <th className="px-4 py-3 text-left">Submitted</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(pending ?? []).map((req: any) => (
                  <tr key={req.id} className="border-t">
                    <td className="max-w-[140px] truncate px-4 py-3 font-mono text-xs">{req.user_id}</td>
                    <td className="px-4 py-3"><Badge variant={req.requested_tier === "A" ? "tierA" : "tierB"}>Tier {req.requested_tier}</Badge></td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-muted-foreground">{req.justification ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(req.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <form action={approveAnonymousAction.bind(null, req.id)}>
                          <Button type="submit" size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />Approve
                          </Button>
                        </form>
                        <form action={rejectAnonymousAction.bind(null, req.id)}>
                          <Button type="submit" size="sm" variant="outline" className="text-destructive">
                            <XCircle className="mr-1 h-3.5 w-3.5" />Reject
                          </Button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Pending verifications summary */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Pending Verifications
              <Badge variant="outline" className="ml-1 text-xs">{totalPendingVerifications}</Badge>
            </CardTitle>
            <CardDescription>Documents, social links, and work experience awaiting verification</CardDescription>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/accounts/verifications">View all <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
          </Button>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <MiniVerificationCard icon={<FileText className="h-4 w-4" />} label="Documents" count={pendingDocList.length} items={pendingDocList} />
          <MiniVerificationCard icon={<Globe className="h-4 w-4" />} label="Social Links" count={pendingSocList.length} items={pendingSocList} />
          <MiniVerificationCard icon={<Briefcase className="h-4 w-4" />} label="Work Experience" count={pendingWorkList.length} items={pendingWorkList} />
        </CardContent>
      </Card>

      {/* Approved profiles */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <EyeOff className="h-4 w-4 text-primary" />
            Active Anonymous Profiles
          </CardTitle>
          <CardDescription>Approved and active anonymous profiles</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {approved.length === 0 ? (
            <div className="grid place-items-center py-6 text-sm text-muted-foreground">No approved profiles yet</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr><th className="px-4 py-3 text-left">Display ID</th><th className="px-4 py-3 text-left">Tier</th><th className="px-4 py-3 text-left">Created</th></tr>
              </thead>
              <tbody>
                {(approved ?? []).map((ap: any) => (
                  <tr key={ap.user_id} className="border-t">
                    <td className="px-4 py-3 font-medium">{ap.display_id}</td>
                    <td className="px-4 py-3"><Badge variant={ap.tier === "A" ? "tierA" : "tierB"}>Tier {ap.tier}</Badge></td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(ap.created_at)}</td>
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

function StatCard({ icon, label, value, href, variant = "default" }: { icon: React.ReactNode; label: string; value: number; href?: string; variant?: string }) {
  const inner = (
    <Card className={variant === "amber" ? "border-amber-500/30" : ""}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground">{icon}<span className="text-xs">{label}</span></div>
        <div className={`mt-1 font-display text-2xl font-semibold ${variant === "amber" ? "text-amber-600" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}

function MiniVerificationCard({ icon, label, count, items }: { icon: React.ReactNode; label: string; count: number; items: any[] }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">{icon}{label}</div>
        <Badge variant={count > 0 ? "outline" : "secondary"}>{count}</Badge>
      </div>
      {items.length > 0 && (
        <div className="mt-2 space-y-1">
          {items.slice(0, 3).map((item: any) => (
            <p key={item.id} className="truncate text-[10px] text-muted-foreground font-mono">{item.id}</p>
          ))}
        </div>
      )}
    </div>
  );
}
