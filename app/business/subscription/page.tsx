import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Crown, Sparkles, CheckCircle2, X, Building2, Calendar, AlertCircle, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import { getBusinessPlan } from "@/lib/plan-gate";
import { SubscribeButton } from "./subscribe-button";
import { CancelButton } from "./cancel-button";
import { formatINR } from "@/lib/utils";

export const metadata = { title: "HiVR Business — Subscription" };
export const dynamic = "force-dynamic";

const PLANS = [
  {
    key: "business_free",
    name: "Free",
    Icon: Building2,
    monthlyPaise: 0,
    tagline: "Try HiVR for small businesses",
    features: [
      "1 active job at a time",
      "1 active contract at a time",
      "1 seat",
      "Basic support (community)",
      "Standard escrow protection",
    ],
    cta: "Current plan",
  },
  {
    key: "business_pro",
    name: "Pro",
    Icon: Crown,
    monthlyPaise: 99900,
    yearlyPaise: 999000, // ~17% off
    tagline: "For growing businesses hiring regularly",
    features: [
      "10 active jobs",
      "10 active contracts",
      "5 seats",
      "Priority listing in candidate search",
      "Priority support (24h response)",
      "Bulk invite applicants",
      "Advanced analytics",
      "Priority moderation",
    ],
    cta: "Upgrade to Pro",
    popular: true,
  },
  {
    key: "business_enterprise",
    name: "Enterprise",
    Icon: Sparkles,
    monthlyPaise: 999900,
    yearlyPaise: 9999000, // ~17% off
    tagline: "For agencies and large teams",
    features: [
      "Unlimited active jobs & contracts",
      "Unlimited seats",
      "Everything in Pro",
      "Dedicated account manager",
      "Custom contract templates",
      "SSO + audit log",
      "API access",
      "SLA-backed support",
    ],
    cta: "Contact sales",
  },
] as const;

export default async function BusinessSubscriptionPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/business/subscription");
  const { data: bp } = await sb.from("business_profiles")
    .select("id, legal_name, brand_name, is_suspended")
    .eq("owner_user_id", user.id).maybeSingle();
  if (!bp) redirect("/onboarding/business");

  const plan = await getBusinessPlan(bp.id);

  // Pull subscription history (most recent 6)
  const { data: history } = await sb.from("business_subscriptions")
    .select("id, plan_key, status, started_at, current_period_start, current_period_end, cancel_at, cancelled_at, created_at")
    .eq("business_id", bp.id)
    .order("created_at", { ascending: false })
    .limit(6);

  const currentKey = plan.planKey;
  const isBypass = !process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID.includes("your-key") || process.env.BYPASS_RAZORPAY_PAYOUTS === "true";

  return (
    <div className="container max-w-5xl space-y-6 py-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Subscription</h1>
        <p className="text-sm text-muted-foreground">Choose the plan that fits your hiring volume. Upgrade or cancel anytime.</p>
      </header>

      {/* Current plan card */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <div className={`grid h-10 w-10 place-items-center rounded-full ${plan.planKey === "business_free" ? "bg-muted" : "bg-primary/10 text-primary"}`}>
              {plan.planKey === "business_enterprise" ? <Sparkles className="h-5 w-5" /> : plan.planKey === "business_pro" ? <Crown className="h-5 w-5" /> : <Building2 className="h-5 w-5" />}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Current plan</p>
              <p className="font-display text-lg font-semibold">{plan.planName} · ₹{Math.round(plan.monthlyPaise / 100)}/mo</p>
              <p className="text-xs text-muted-foreground">
                {plan.status === "active" && <>Renews on {new Date(plan.currentPeriodEnd).toLocaleDateString()}</>}
                {plan.status === "trialing" && <>Trial ends {new Date(plan.currentPeriodEnd).toLocaleDateString()}</>}
                {plan.status === "past_due" && <span className="text-amber-600">Payment past due — update your card</span>}
                {plan.status === "cancelled" && <span className="text-muted-foreground">Cancelled</span>}
              </p>
            </div>
          </div>
          {plan.status === "active" && plan.planKey !== "business_free" && (
            <CancelButton subscriptionId={plan.planKey} />
          )}
        </CardContent>
      </Card>

      {isBypass && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex items-center gap-2 p-3 text-xs text-amber-700 dark:text-amber-300">
            <AlertCircle className="h-3.5 w-3.5" />
            <span>Sandbox mode — upgrades complete instantly without charging a card. Set <code className="rounded bg-amber-500/10 px-1 py-0.5">RAZORPAY_KEY_ID</code> in <code>.env.local</code> for real billing.</span>
          </CardContent>
        </Card>
      )}

      {bp.is_suspended && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 text-sm text-destructive">
            Your business is suspended. Resolve any open issues from <Link href="/business/disputes" className="underline">disputes</Link> before you can change your plan.
          </CardContent>
        </Card>
      )}

      {/* Plans grid */}
      <div className="grid gap-4 lg:grid-cols-3">
        {PLANS.map((p) => {
          const isCurrent = currentKey === p.key;
          const isDowngrade = planLimitsValue(currentKey) > planLimitsValue(p.key);
          return (
            <Card key={p.key} className={p.popular ? "border-primary/50 shadow-md" : ""}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <p.Icon className={`h-4 w-4 ${p.popular ? "text-primary" : "text-muted-foreground"}`} />
                    <CardTitle className="text-lg">{p.name}</CardTitle>
                  </div>
                  {p.popular && <Badge variant="default">Popular</Badge>}
                </div>
                <CardDescription>{p.tagline}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="font-display text-3xl font-bold">
                    ₹{Math.round(p.monthlyPaise / 100)}
                    <span className="text-sm font-normal text-muted-foreground">/mo</span>
                  </p>
                  {"yearlyPaise" in p && p.yearlyPaise && (
                    <p className="text-xs text-muted-foreground">or ₹{Math.round((p as any).yearlyPaise / 100)}/yr (save 17%)</p>
                  )}
                </div>
                <ul className="space-y-1.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-emerald-500" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <div className="pt-2">
                  {isCurrent ? (
                    <Button variant="outline" disabled className="w-full">
                      <CheckCircle2 className="h-4 w-4" /> Current plan
                    </Button>
                  ) : p.key === "business_enterprise" ? (
                    <Button asChild variant="outline" className="w-full">
                      <a href="mailto:sales@hivr.example?subject=HiVR%20Enterprise%20plan">Contact sales</a>
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <SubscribeButton
                        businessId={bp.id}
                        planKey={p.key as "business_pro"}
                        customerName={bp.brand_name || bp.legal_name}
                        customerEmail={user.email ?? ""}
                        isDowngrade={isDowngrade}
                      />
                      {isDowngrade && (
                        <p className="flex items-center gap-1.5 text-[11px] text-amber-600">
                          <ArrowDownCircle className="h-3 w-3" /> Downgrade takes effect at next renewal.
                        </p>
                      )}
                      {!isDowngrade && (
                        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <ArrowUpCircle className="h-3 w-3" /> Upgrade takes effect immediately.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle>Subscription history</CardTitle>
          <CardDescription>The 6 most recent subscription events.</CardDescription>
        </CardHeader>
        <CardContent>
          {(!history || history.length === 0) ? (
            <p className="text-sm text-muted-foreground">No subscription history yet.</p>
          ) : (
            <ul className="space-y-2">
              {history.map((h: any) => (
                <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant={
                      h.status === "active" || h.status === "trialing" ? "default" :
                      h.status === "cancelled" ? "outline" : "destructive"
                    } className="capitalize">{h.status}</Badge>
                    <span className="font-medium">{planNameFromKey(h.plan_key)}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(h.created_at).toLocaleDateString()}</span>
                    {h.current_period_end && <span>→ {new Date(h.current_period_end).toLocaleDateString()}</span>}
                    {h.cancelled_at && <span className="text-amber-600">Cancelled {new Date(h.cancelled_at).toLocaleDateString()}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function planLimitsValue(key: string): number {
  if (key === "business_enterprise") return 3;
  if (key === "business_pro") return 2;
  return 1;
}
function planNameFromKey(key: string): string {
  if (key === "business_enterprise") return "Enterprise";
  if (key === "business_pro") return "Pro";
  return "Free";
}
