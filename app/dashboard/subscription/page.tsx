import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles, X, AlertCircle } from "lucide-react";
import { subscribeToPlan, cancelSubscription } from "./actions";
import { listPublicPlans } from "@/lib/subscriptions";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

export const metadata = { title: "Subscription - HiVR" };
export const revalidate = 0;

export default async function SubscriptionPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;

  const [{ data: activeSub }, by] = await Promise.all([
    sb.from("user_subscriptions")
      .select("*, plan:subscription_plans(*)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .maybeSingle(),
    listPublicPlans(),
  ]);

  const planFeatures = (activeSub?.plan?.features ?? {}) as Record<string, any>;

  return (
    <div className="container max-w-4xl space-y-6 py-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Subscription</h1>
        <p className="text-sm text-muted-foreground">Manage your HiVR Pro plan.</p>
      </header>

      {activeSub ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle>{(activeSub.plan as any)?.name}</CardTitle>
              <Badge variant="success">Active</Badge>
            </div>
            <CardDescription>
              Renews on {formatDate(activeSub.expires_at)} ·
              ₹{(activeSub.amount_paid_inr ?? 0).toLocaleString("en-IN")} ·
              Auto-renew {activeSub.auto_renew ? "ON" : "OFF"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-medium">Your active features</p>
              <ul className="grid gap-1 text-sm sm:grid-cols-2">
                {Object.entries(planFeatures).filter(([_, v]) => v === true || (typeof v === "number" && v > 0)).map(([k, v]) => (
                  <li key={k} className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-success" />
                    <span>{humanizeFeatureKey(k)}: {typeof v === "number" ? (v < 1 ? `${Math.round(v * 100)}%` : `×${v}`) : "on"}</span>
                  </li>
                ))}
              </ul>
            </div>
            <form action={async () => { "use server"; await cancelSubscription(); }}>
              <Button type="submit" variant="outline" size="sm">
                <X className="h-3.5 w-3.5" />Cancel subscription
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex items-start gap-3 p-6">
            <AlertCircle className="mt-0.5 h-5 w-5 text-muted-foreground" />
            <div>
              <p className="font-medium">No active subscription</p>
              <p className="mt-1 text-sm text-muted-foreground">You're on the free plan. Browse the plans below to unlock featured placement, lower fees, and more.</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="mb-3 font-display text-xl font-semibold">Choose a plan</h2>
        <p className="text-sm text-muted-foreground">
          Full plan comparison on the <Link href="/pricing" className="text-primary underline">/pricing</Link> page.
        </p>
      </div>

      {(["individual_buyer", "individual_employee", "business"] as const).map(audience => {
        const plans = by[audience] ?? [];
        if (plans.length === 0) return null;
        return (
          <section key={audience} className="space-y-2">
            <h3 className="text-sm font-semibold uppercase text-muted-foreground">{audience.replace("_", " ")}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map(p => {
                const isCurrent = activeSub?.plan_id === p.id;
                return (
                  <Card key={p.id} className={isCurrent ? "border-primary/40" : ""}>
                    <CardContent className="space-y-2 p-4">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold">{p.name}</p>
                        {isCurrent && <Badge variant="success">Current</Badge>}
                      </div>
                      <p className="text-sm">
                        <span className="font-display text-2xl font-semibold">₹{p.price_inr.toLocaleString("en-IN")}</span>
                        <span className="text-muted-foreground"> /{p.period.replace("ly", "").replace("one_time", "once")}</span>
                      </p>
                      {!isCurrent && (
                        <form action={async () => { "use server"; await subscribeToPlan(p.id); }}>
                          <Button type="submit" variant="gradient" size="sm" className="w-full">Subscribe</Button>
                        </form>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function humanizeFeatureKey(k: string): string {
  return k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
