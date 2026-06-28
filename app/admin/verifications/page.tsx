import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { requireAdmin } from "@/lib/admin-auth";

export default async function AdminVerifications() {
  await requireAdmin();
  const sb = createClient();
  const { data: pending } = await sb
    .from("verifications")
    .select("id, user_id, doc_type, status, created_at, users!verifications_user_id_fkey(full_name, email)")
    .eq("status", "pending")
    .order("created_at");
  return (
    <div className="container max-w-5xl space-y-6 py-8">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Verifications</h1>
      <p className="text-sm text-muted-foreground">Pending review queue.</p>
      <div className="space-y-3">
        {(pending ?? []).length === 0 && (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">Nothing pending. ✓</CardContent></Card>
        )}
        {(pending ?? []).map((v: any) => (
          <Card key={v.id}>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex-1">
                <div className="text-sm font-semibold">{v.users?.full_name ?? v.users?.email ?? v.user_id}</div>
                <div className="text-xs text-muted-foreground uppercase">{v.doc_type} · submitted {new Date(v.created_at).toLocaleString()}</div>
              </div>
              <form action={async (fd) => {
                "use server";
                const decision = String(fd.get("decision"));
                await sb.from("verifications").update({ status: decision, verified_at: decision === "verified" ? new Date().toISOString() : null }).eq("id", v.id);
              }} className="flex gap-2">
                <Button name="decision" value="verified" type="submit" size="sm" variant="default">Approve</Button>
                <Button name="decision" value="rejected" type="submit" size="sm" variant="outline">Reject</Button>
              </form>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
