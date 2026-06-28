import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { Users, Star, CheckCircle2, Plus } from "lucide-react";
import { requireAdmin } from "@/lib/admin-auth";

export const metadata = { title: "Support agents - HiVR admin" };
export const revalidate = 0;

async function addAgent(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim();
  const display = String(formData.get("display_name") ?? "").trim();
  const specialty = String(formData.get("specialty") ?? "general");
  if (!email || !display) return;
  const sb = createClient();
  const { data: { data: u } } = await sb.from("users").select("id").eq("email", email).single();
  if (!u) return;
  const admin = createAdminClient();
  await admin.from("support_agents").upsert({ user_id: (u as any).id, display_name: display, specialty, status: "offline" });
  revalidatePath("/admin/support/agents");
}
async function setStatus(formData: FormData) {
  "use server";
  const id = String(formData.get("user_id") ?? "");
  const status = String(formData.get("status") ?? "offline");
  const admin = createAdminClient();
  await admin.from("support_agents").update({ status }).eq("user_id", id);
  revalidatePath("/admin/support/agents");
}

export default async function AdminSupportAgentsPage() {
  await requireAdmin();
  const sb = createClient();
  const { data: agents } = await sb
    .from("support_agents")
    .select("user_id, display_name, specialty, status, rating_avg, total_resolved, user:users!support_agents_user_id_fkey(full_name, email), active_at")
    .order("rating_avg", { ascending: false });

  return (
    <div className="container max-w-4xl space-y-6 py-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Support agents</h1>
        <p className="text-sm text-muted-foreground">Add, remove, and set the status of customer care agents.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add an agent</CardTitle>
          <CardDescription>The user must already have an account. Use their signup email.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={addAgent} className="grid gap-3 sm:grid-cols-[2fr,2fr,1fr,auto]">
            <div>
              <Label htmlFor="email" className="text-xs">User email</Label>
              <Input id="email" name="email" type="email" required placeholder="agent@hivr.com" />
            </div>
            <div>
              <Label htmlFor="display_name" className="text-xs">Display name</Label>
              <Input id="display_name" name="display_name" required placeholder="Asha P." />
            </div>
            <div>
              <Label htmlFor="specialty" className="text-xs">Specialty</Label>
              <select id="specialty" name="specialty" defaultValue="general" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="general">General</option>
                <option value="payments">Payments</option>
                <option value="verification">Verification</option>
                <option value="disputes">Disputes</option>
                <option value="technical">Technical</option>
                <option value="business">Business</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button type="submit"><Plus className="h-3.5 w-3.5" />Add</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All agents</CardTitle>
        </CardHeader>
        <CardContent>
          {(agents ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No agents yet.</p>
          ) : (
            <ul className="divide-y">
              {(agents ?? []).map(a => (
                <li key={a.user_id} className="flex items-center gap-3 py-3">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary">
                    <Users className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{a.display_name}</p>
                    <p className="text-xs text-muted-foreground">{(a.user as any)?.email} · {a.specialty}</p>
                  </div>
                  <div className="text-right text-xs">
                    <p className="font-medium">{a.total_resolved} resolved</p>
                    {a.rating_avg > 0 && <p className="text-muted-foreground">{Number(a.rating_avg).toFixed(2)} ★</p>}
                  </div>
                  <form action={setStatus} className="flex items-center gap-1">
                    <input type="hidden" name="user_id" value={a.user_id} />
                    {(["online","busy","offline"] as const).map(s => (
                      <Button key={s} type="submit" name="status" value={s} size="sm" variant={a.status === s ? "default" : "ghost"}>
                        {s}
                      </Button>
                    ))}
                  </form>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
