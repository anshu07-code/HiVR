import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/admin-auth";
import { formatDate } from "@/lib/utils";
import { CheckCircle2, XCircle, FileText, Globe, Briefcase } from "lucide-react";
import { verifyItemAction } from "./actions";

export const metadata = { title: "Verifications — Accounts Panel" };
export const revalidate = 0;

export default async function VerificationsPage() {
  await requireAdmin();
  const sb = createClient();

  const [workExp, socialLinks, documents] = await Promise.all([
    sb.from("anonymous_work_experience")
      .select("*, employee_profiles!inner(user_id, is_anonymous)")
      .eq("verification_status", "pending")
      .order("created_at", { ascending: false } as any)
      .limit(50) as any,
    sb.from("anonymous_social_links")
      .select("*, employee_profiles!inner(user_id, is_anonymous)")
      .eq("verification_status", "pending")
      .order("created_at", { ascending: false } as any)
      .limit(50) as any,
    sb.from("anonymous_documents")
      .select("*, employee_profiles!inner(user_id, is_anonymous)")
      .eq("verification_status", "pending")
      .order("created_at", { ascending: false } as any)
      .limit(50) as any,
  ]);

  const pendingWork = (workExp as any)?.data ?? workExp ?? [];
  const pendingSocial = (socialLinks as any)?.data ?? socialLinks ?? [];
  const pendingDocs = (documents as any)?.data ?? documents ?? [];
  const total = pendingWork.length + pendingSocial.length + pendingDocs.length;

  return (
    <div className="container max-w-6xl space-y-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Verifications</h1>
          <p className="text-sm text-muted-foreground">
            {total} item{total === 1 ? "" : "s"} pending verification
          </p>
        </div>
        <Badge variant="outline">{total} pending</Badge>
      </div>

      {/* Documents */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-primary" />
            Documents
            <Badge variant="outline" className="text-xs">{pendingDocs.length}</Badge>
          </CardTitle>
          <CardDescription>Uploaded files from anonymous profile applicants</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {pendingDocs.length === 0 ? (
            <div className="grid place-items-center py-6 text-sm text-muted-foreground">No documents pending</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr><th className="px-4 py-3 text-left">User ID</th><th className="px-4 py-3 text-left">Filename</th><th className="px-4 py-3 text-left">Type</th><th className="px-4 py-3 text-left">Uploaded</th><th className="px-4 py-3 text-right">Actions</th></tr>
              </thead>
              <tbody>
                {(pendingDocs ?? []).map((doc: any) => (
                  <tr key={doc.id} className="border-t">
                    <td className="max-w-[120px] truncate px-4 py-3 font-mono text-xs">{doc.user_id}</td>
                    <td className="max-w-[200px] truncate px-4 py-3">{doc.filename}</td>
                    <td className="px-4 py-3"><Badge variant="secondary" className="text-[10px]">{doc.document_type}</Badge></td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(doc.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <form action={verifyItemAction.bind(null, "anonymous_documents", doc.id, "verify")}>
                          <Button type="submit" size="sm" className="bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /></Button>
                        </form>
                        <form action={verifyItemAction.bind(null, "anonymous_documents", doc.id, "reject")}>
                          <Button type="submit" size="sm" variant="outline" className="text-destructive"><XCircle className="h-3.5 w-3.5" /></Button>
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

      {/* Social links */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-4 w-4 text-primary" />
            Social Links
            <Badge variant="outline" className="text-xs">{pendingSocial.length}</Badge>
          </CardTitle>
          <CardDescription>Social media profiles submitted for verification</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {pendingSocial.length === 0 ? (
            <div className="grid place-items-center py-6 text-sm text-muted-foreground">No social links pending</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr><th className="px-4 py-3 text-left">User ID</th><th className="px-4 py-3 text-left">Platform</th><th className="px-4 py-3 text-left">URL</th><th className="px-4 py-3 text-left">Added</th><th className="px-4 py-3 text-right">Actions</th></tr>
              </thead>
              <tbody>
                {(pendingSocial ?? []).map((link: any) => (
                  <tr key={link.id} className="border-t">
                    <td className="max-w-[120px] truncate px-4 py-3 font-mono text-xs">{link.user_id}</td>
                    <td className="px-4 py-3">{link.platform}</td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-muted-foreground">{link.url}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(link.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <form action={verifyItemAction.bind(null, "anonymous_social_links", link.id, "verify")}>
                          <Button type="submit" size="sm" className="bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /></Button>
                        </form>
                        <form action={verifyItemAction.bind(null, "anonymous_social_links", link.id, "reject")}>
                          <Button type="submit" size="sm" variant="outline" className="text-destructive"><XCircle className="h-3.5 w-3.5" /></Button>
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

      {/* Work Experience */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Briefcase className="h-4 w-4 text-primary" />
            Work Experience
            <Badge variant="outline" className="text-xs">{pendingWork.length}</Badge>
          </CardTitle>
          <CardDescription>Work history entries awaiting verification</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {pendingWork.length === 0 ? (
            <div className="grid place-items-center py-6 text-sm text-muted-foreground">No experience entries pending</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr><th className="px-4 py-3 text-left">User ID</th><th className="px-4 py-3 text-left">Company</th><th className="px-4 py-3 text-left">Role</th><th className="px-4 py-3 text-left">Added</th><th className="px-4 py-3 text-right">Actions</th></tr>
              </thead>
              <tbody>
                {(pendingWork ?? []).map((exp: any) => (
                  <tr key={exp.id} className="border-t">
                    <td className="max-w-[120px] truncate px-4 py-3 font-mono text-xs">{exp.user_id}</td>
                    <td className="px-4 py-3 font-medium">{exp.company}</td>
                    <td className="px-4 py-3 text-muted-foreground">{exp.role}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(exp.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <form action={verifyItemAction.bind(null, "anonymous_work_experience", exp.id, "verify")}>
                          <Button type="submit" size="sm" className="bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /></Button>
                        </form>
                        <form action={verifyItemAction.bind(null, "anonymous_work_experience", exp.id, "reject")}>
                          <Button type="submit" size="sm" variant="outline" className="text-destructive"><XCircle className="h-3.5 w-3.5" /></Button>
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
    </div>
  );
}
