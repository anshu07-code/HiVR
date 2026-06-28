import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { formatINR } from "@/lib/utils";
import { PlanActiveToggle } from "./plan-active-toggle";
import { requireAdmin } from "@/lib/admin-auth";

export const metadata = { title: "Subscriptions - HiVR admin" };
export const revalidate = 0;

async function togglePlanActive(formData: FormData) {
  "use server";
  const id = String(formData.get("plan_id") ?? "");
  const active = formData.get("active") === "on";
  const admin = createAdminClient();
  await admin.from("subscription_plans").update({ is_active: active }).eq("id", id);
  revalidatePath("/admin/subscriptions");
}

async function updatePrice(formData: FormData) {
  "use server";
  const id = String(formData.get("plan_id") ?? "");
  const price = Number(formData.get("price_inr") ?? 0);
  if (price < 0) return;
  const admin = createAdminClient();
  await admin.from("subscription_plans").update({ price_inr: price }).eq("id", id);
  revalidatePath("/admin/subscriptions");
  revalidatePath("/pricing");
}

export default async function AdminSubscriptionsPage() {
  await requireAdmin();
  const sb = createClient();
  const [{ data: plans }, { data: subs }] = await Promise.all([
    sb.from("subscription_plans").select("*").order("audience").order("sort_order"),
    sb.from("user_subscriptions")
      .select("id, status, started_at, expires_at, amount_paid_inr, user:users!user_subscriptions_user_id_fkey(full_name, email), plan:subscription_plans(name, audience)")
      .order("started_at", { ascending: false })
      .limit(50),
  ]);

  const active = (subs ?? []).filter(s => s.status === "active");
  const cancelled = (subs ?? []).filter(s => s.status === "cancelled");

  return (
    <div className="container max-w-5xl space-y-6 py-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Subscriptions</h1>
        <p className="text-sm text-muted-foreground">Manage plan prices, toggle plan availability, and monitor subscribers.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Active subs" value={String(active.length)} />
        <Stat label="Cancelled (last 50)" value={String(cancelled.length)} />
        <Stat label="Plans" value={String((plans ?? []).length)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plans</CardTitle>
          <CardDescription>Toggle availability and adjust prices. Changes appear on /pricing immediately.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(plans ?? []).map(p => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-md border p-3">
              <div className="flex-1 min-w-[200px]">
                <p className="font-semibold">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  {p.audience.replace("_", " ")} · {p.period} · code: {p.code}
                </p>
              </div>
              <form action={updatePrice} className="flex items-end gap-1">
                <input type="hidden" name="plan_id" value={p.id} />
                <div>
                  <Label htmlFor={`price-${p.id}`} className="text-xs">Price (₹)</Label>
                  <Input id={`price-${p.id}`} name="price_inr" type="number" min={0} defaultValue={p.price_inr} className="w-28" />
                </div>
                <Button type="submit" size="sm" variant="outline">Update</Button>
              </form>
              <PlanActiveToggle planId={p.id} isActive={p.is_active} action={togglePlanActive} />
              <Badge variant="secondary" className="text-[10px]">₹{formatINR(p.price_inr)}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent subscribers</CardTitle>
        </CardHeader>
        <CardContent>
          {(subs ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No subscriptions yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {(subs ?? []).map(s => (
                <li key={s.id} className="flex items-center gap-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{(s.user as any)?.full_name ?? "-"}</p>
                    <p className="text-xs text-muted-foreground">{(s.user as any)?.email}</p>
                  </div>
                  <Badge variant="secondary">{(s.plan as any)?.name}</Badge>
                  <Badge variant={s.status === "active" ? "success" : "destructive"} className="capitalize">{s.status}</Badge>
                  <span className="text-xs text-muted-foreground">₹{s.amount_paid_inr ?? 0}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="p-5">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold">{value}</div>
    </CardContent></Card>
  );
}
