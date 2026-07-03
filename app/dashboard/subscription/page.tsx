import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles, X, AlertCircle, Zap, ShieldCheck, Crown, TrendingUp } from "lucide-react";
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
    <div className="container max-w-5xl space-y-8 py-8">
      <header className="text-center md:text-left">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          <Zap className="mr-2 inline-block h-6 w-6 text-primary" />
          Subscription
        </h1>
        <p className="text-sm text-muted-foreground">Unlock premium features and lower fees with a HiVR Pro plan.</p>
      </header>

      {activeSub ? (
        <Card className="relative overflow-hidden border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
          <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/10 blur-2xl" />
          <CardHeader>
            <div className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-primary" />
              <CardTitle className="text-xl">{(activeSub.plan as any)?.name}</CardTitle>
              <Badge variant="success" className="ml-auto">Active</Badge>
            </div>
            <CardDescription>
              Renews on {formatDate(activeSub.expires_at)} ·
              ₹{(activeSub.amount_paid_inr ?? 0).toLocaleString("en-IN")} ·
              Auto-renew {activeSub.auto_renew ? "ON" : "OFF"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="mb-3 text-sm font-semibold">Your active features</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.entries(planFeatures).filter(([_, v]) => v === true || (typeof v === "number" && v > 0)).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2 rounded-lg border bg-background/50 px-3 py-2 text-sm">
                    <Check className="h-4 w-4 shrink-0 text-success" />
                    <span>{humanizeFeatureKey(k)}: {typeof v === "number" ? (v < 1 ? `${Math.round(v * 100)}%` : `×${v}`) : "on"}</span>
                  </div>
                ))}
              </div>
            </div>
            <form action={async () => { "use server"; await cancelSubscription(); }}>
              <Button type="submit" variant="outline" size="sm">
                <X className="h-3.5 w-3.5" />Cancel subscription
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed bg-gradient-to-br from-muted/30 to-muted/10">
          <CardContent className="flex items-start gap-4 p-6">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold">You&apos;re on the free plan</p>
              <p className="mt-1 text-sm text-muted-foreground">Upgrade to unlock featured placement, lower platform fees, priority support, and more.</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-6">
        <div className="text-center md:text-left">
          <h2 className="font-display text-2xl font-semibold tracking-tight">Choose your plan</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Compare full plan details on the <Link href="/pricing" className="text-primary underline hover:text-primary/80">/pricing</Link> page.
          </p>
        </div>

        {(["individual_buyer", "individual_employee", "business"] as const).map(audience => {
          const plans = by[audience] ?? [];
          if (plans.length === 0) return null;
          return (
            <section key={audience} className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                <ShieldCheck className="h-4 w-4" />
                {audience.replace("_", " ")}
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {plans.map(p => {
                  const isCurrent = activeSub?.plan_id === p.id;
                  return (
                    <Card key={p.id} className={`relative overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5 ${isCurrent ? "border-primary/40 ring-1 ring-primary/20" : "hover:border-primary/30"}`}>
                      {p.name.toLowerCase().includes("pro") && !isCurrent && (
                        <div className="absolute right-2 top-2">
                          <Badge variant="gradient" className="text-[9px]">Popular</Badge>
                        </div>
                      )}
                      <CardContent className="space-y-3 p-5">
                        <div className="flex items-center justify-between">
                          <p className="font-semibold">{p.name}</p>
                          {isCurrent && <Badge variant="success" className="text-[9px]">Current</Badge>}
                        </div>
                        <div>
                          <span className="font-display text-3xl font-bold tracking-tight">₹{p.price_inr.toLocaleString("en-IN")}</span>
                          <span className="text-sm text-muted-foreground"> /{p.period.replace("ly", "").replace("one_time", "once")}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {audience === "individual_buyer" && "Lower fees, priority posting, advanced analytics."}
                          {audience === "individual_employee" && "More applications, featured profile, priority payouts."}
                          {audience === "business" && "Team accounts, bulk hiring, dedicated support."}
                        </p>
                        {!isCurrent && (
                          <form action={async () => { "use server"; await subscribeToPlan(p.id); }}>
                            <Button type="submit" variant="gradient" size="sm" className="w-full">
                              <Crown className="h-3.5 w-3.5" />
                              Subscribe
                            </Button>
                          </form>
                        )}
                        {isCurrent && (
                          <div className="flex items-center gap-2 text-xs text-success">
                            <Check className="h-3.5 w-3.5" />
                            Currently active
                          </div>
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
    </div>
  );
}

function humanizeFeatureKey(k: string): string {
  return k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
