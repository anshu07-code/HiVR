import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Sparkles, Briefcase, Building2, User, Users } from "lucide-react";
import Link from "next/link";
import { listPublicPlans } from "@/lib/subscriptions";
import { PricingAIChat } from "@/components/marketing/pricing-ai-chat";

export const metadata = { title: "Pricing - HiVR" };
export const revalidate = 0;

const AUDIENCE_META: Record<string, { title: string; subtitle: string; Icon: any; cta: string; href: string; iconBg: string; iconFg: string; ring: string }> = {
  individual_buyer: {
    title: "For buyers",
    subtitle: "Hire faster, pay less in fees, get featured task posts.",
    Icon: Briefcase,
    cta: "Choose Buyer Pro",
    href: "/dashboard/subscription",
    iconBg: "bg-primary/10", iconFg: "text-primary", ring: "border-primary/40 ring-primary/20",
  },
  individual_employee: {
    title: "For employees",
    subtitle: "Get featured, earn 2x points, pay less in fees, appear first in search.",
    Icon: User,
    cta: "Choose Employee Pro",
    href: "/dashboard/subscription",
    iconBg: "bg-violet-500/10", iconFg: "text-violet-600 dark:text-violet-400", ring: "border-violet-500/40 ring-violet-500/20",
  },
  business: {
    title: "For businesses",
    subtitle: "Bulk hire with team seats, GSTIN invoicing, dedicated account manager.",
    Icon: Building2,
    cta: "Choose Business plan",
    href: "/dashboard/subscription",
    iconBg: "bg-amber-500/10", iconFg: "text-amber-600 dark:text-amber-400", ring: "border-amber-500/40 ring-amber-500/20",
  },
};

export default async function PricingPage() {
  const by = await listPublicPlans();
  // Show plans in this order regardless of sort_order in DB: monthly, quarterly, yearly.
  // This matches the "pocket-friendly" preference: cheapest commitment first, longest last.
  const periodOrder: Record<string, number> = { monthly: 0, quarterly: 1, yearly: 2, one_time: 3 };
  const sortByPeriod = (arr: any[] = []) =>
    [...arr].sort((a, b) => (periodOrder[a.period] ?? 99) - (periodOrder[b.period] ?? 99));
  const sections = [
    { key: "individual_buyer",   plans: sortByPeriod(by.individual_buyer) },
    { key: "individual_employee", plans: sortByPeriod(by.individual_employee) },
    { key: "business",            plans: sortByPeriod(by.business) },
  ];

  return (
    <>      <main className="container py-16">
        <header className="mb-12 text-center max-w-2xl mx-auto">
          <Badge variant="tierA" className="mb-3">Pricing</Badge>
          <h1 className="font-display text-4xl font-semibold tracking-tight md:text-5xl">
            Plans for individuals, employees, and businesses.
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Start free. Upgrade when you need featured placement, lower fees, or bulk-hiring tools.
            All plans are admin-editable.
          </p>
        </header>

        {sections.map(({ key, plans }) => {
          const meta = AUDIENCE_META[key];
          const Icon = meta.Icon;
          if (plans.length === 0) {
            return (
              <section key={key} className="mb-14">
                <div className="mb-6 flex items-center gap-3">
                  <div className={`grid h-10 w-10 place-items-center rounded-lg ${meta.iconBg} ${meta.iconFg}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-display text-2xl font-semibold tracking-tight">{meta.title}</h2>
                    <p className="text-sm text-muted-foreground">{meta.subtitle}</p>
                  </div>
                </div>
                <div className="rounded-md border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">
                  No plans published yet for this audience. An admin can add them in{" "}
                  <a href="/admin/subscriptions" className="text-primary underline">/admin/subscriptions</a>.
                </div>
              </section>
            );
          }
          return (
            <section key={key} className="mb-14">
              <div className="mb-6 flex items-center gap-3">
                <div className={`grid h-10 w-10 place-items-center rounded-lg ${meta.iconBg} ${meta.iconFg}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-display text-2xl font-semibold tracking-tight">{meta.title}</h2>
                  <p className="text-sm text-muted-foreground">{meta.subtitle}</p>
                </div>
              </div>
              <div className={`grid gap-4 items-stretch ${plans.length === 1 ? "sm:grid-cols-1 max-w-md" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
                {plans.map(plan => <PlanCard key={plan.id} plan={plan} meta={meta} />)}
              </div>
              <ComparisonMatrix plans={plans} />
            </section>
          );
        })}

        {/* FAQ + Ask the AI side-by-side */}
        <section className="mt-16 grid gap-6 md:grid-cols-2 md:items-stretch">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight mb-4">Common questions</h2>
            <div className="space-y-3 text-sm">
              <Faq q="How does the platform fee discount work?">
                Free accounts pay 20% on each contract (default). Pro buyers pay 15% (monthly), 14% (quarterly), or 12% (yearly). Pro employees pay 18% / 17% / 15%. Business plans go down to 12%.
              </Faq>
              <Faq q="What does 'featured' mean?">
                Featured task posts (buyers) appear first in /browse and get a visible badge. Featured profiles (employees) appear first on /employees and in search within their categories.
              </Faq>
              <Faq q="How do 2x points work?">
                Points earned per completed contract are doubled on the Employee Pro plan. Points are still non-cash-convertible — they redeem for fee discounts and perks only.
              </Faq>
              <Faq q="Can I cancel anytime?">
                Yes. Pro plans auto-cancel at period end unless auto-renew is on. Business plans cancel at the next billing cycle. No refunds for partial periods.
              </Faq>
              <Faq q="How does the business plan work?">
                One owner creates a business account, invites team members (recruiters, viewers) up to your seat count. All members post and manage tasks under one billing relationship. GSTIN invoices generated monthly.
              </Faq>
            </div>
          </div>

          <div className="flex flex-col">
            <h2 className="font-display text-2xl font-semibold tracking-tight mb-4 leading-tight">
              Still having queries?<br />Resolve here
            </h2>
            <div className="flex flex-1">
              <PricingAIChat />
            </div>
          </div>
        </section>
      </main>    </>
  );
}

function PlanCard({ plan, meta }: { plan: any; meta: any }) {
  const features = (plan.features ?? {}) as Record<string, any>;
  const periodLabel = plan.period === "monthly" ? "/month" : plan.period === "yearly" ? "/year" : plan.period === "quarterly" ? "/quarter" : "one-time";
  const isYearly = plan.period === "yearly";
  const isQuarterly = plan.period === "quarterly";
  // Yearly = "best value" (deepest discount). Quarterly = "popular" (sweet spot, pocket-friendly).
  const showBestValue = isYearly;
  const showPopular = isQuarterly;

  return (
    <Card className={`flex h-full flex-col ${showBestValue ? `${meta.ring} border-2` : ""}`}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg">{plan.name}</CardTitle>
          {showBestValue && <Badge variant="success"><Sparkles className="mr-1 h-3 w-3" />Best value</Badge>}
          {showPopular && <Badge variant="default"><Sparkles className="mr-1 h-3 w-3" />Popular</Badge>}
        </div>
        <CardDescription>
          <span className="font-display text-3xl font-semibold text-foreground">₹{plan.price_inr.toLocaleString("en-IN")}</span>
          <span className="text-muted-foreground"> {periodLabel}</span>
          {isQuarterly && (
            <p className="mt-1 text-xs text-muted-foreground">~ ₹{Math.round(plan.price_inr / 3).toLocaleString("en-IN")} per month · save vs monthly</p>
          )}
          {isYearly && (
            <p className="mt-1 text-xs text-muted-foreground">~ ₹{Math.round(plan.price_inr / 12).toLocaleString("en-IN")} per month · best long-term price</p>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2 p-4">
        {plan.seat_count > 1 && (
          <p className="text-xs font-medium text-muted-foreground">
            <Users className="mr-1 inline h-3 w-3" />Includes {plan.seat_count} team seats
          </p>
        )}
        <ul className="space-y-1.5 text-sm">
          {features.featured_listing && <Feat>Featured task posts (3x more views)</Feat>}
          {features.featured_profile && <Feat>Featured employee profile</Feat>}
          {features.priority_in_search && <Feat>Priority in search results</Feat>}
          {features.priority_support && <Feat>Priority customer support</Feat>}
          {features.points_multiplier && features.points_multiplier > 1 && <Feat>{features.points_multiplier}x points on every contract</Feat>}
          {features.platform_fee_pct && <Feat>Reduced platform fee ({Math.round(features.platform_fee_pct * 100)}%)</Feat>}
          {features.unlimited_drafts && <Feat>Unlimited task drafts</Feat>}
          {features.advanced_filters && <Feat>Advanced search & filters</Feat>}
          {features.analytics_dashboard && <Feat>Analytics dashboard</Feat>}
          {features.skill_test_retake_free && <Feat>Free skill-test retakes</Feat>}
          {features.verified_badge_boost && <Feat>Boosted verified-employee badge</Feat>}
          {features.bulk_posting && <Feat>Bulk task posting</Feat>}
          {features.gstin_invoicing && <Feat>GSTIN invoicing</Feat>}
          {features.dedicated_account_manager && <Feat>Dedicated account manager</Feat>}
          {features.api_access && <Feat>REST API access</Feat>}
          {features.custom_integrations && <Feat>Custom integrations</Feat>}
          {features.sso && <Feat>SSO / SAML</Feat>}
        </ul>
        <Button asChild variant={showBestValue ? "gradient" : "outline"} className="mt-auto w-full">
          <Link href={meta.href}>{meta.cta}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function Feat({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
      <span>{children}</span>
    </li>
  );
}

function ComparisonMatrix({ plans }: { plans: any[] }) {
  return (
    <div className="mt-6 rounded-lg border">
      <details className="group">
        <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm font-medium hover:bg-muted/30 transition-colors [&::-webkit-details-marker]:hidden list-none">
          <span className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded bg-muted text-muted-foreground text-xs font-bold transition-transform group-open:rotate-90">&#9656;</span>
            Compare features across {plans.length} plans
          </span>
          <span className="text-xs text-muted-foreground">Click to expand</span>
        </summary>
        <div className="border-t">
          <ComparisonTable plans={plans} />
        </div>
      </details>
    </div>
  );
}

function ComparisonTable({ plans }: { plans: any[] }) {
  // Define a canonical list of features for the matrix. We compare values
  // across all the plans that are present so the user can see the difference
  // between monthly, quarterly, and yearly at a glance.
  const rows: { key: keyof RowData; label: string; format: (v: any) => React.ReactNode }[] = [
    { key: "price",      label: "Total price",         format: v => v },
    { key: "monthly",    label: "Effective per month", format: v => v },
    { key: "fee",        label: "Platform fee",        format: v => v },
    { key: "points",     label: "Points multiplier",   format: v => v },
    { key: "featured",   label: "Featured listing/profile", format: v => v },
    { key: "priority",   label: "Priority in search",  format: v => v },
    { key: "support",    label: "Priority support",    format: v => v },
    { key: "analytics",  label: "Analytics dashboard", format: v => v },
    { key: "bulk",       label: "Bulk posting",        format: v => v },
    { key: "gstin",      label: "GSTIN invoicing",     format: v => v },
    { key: "am",         label: "Dedicated AM",        format: v => v },
    { key: "api",        label: "API access",          format: v => v },
    { key: "sso",        label: "SSO / SAML",          format: v => v },
  ];

  type RowData = { price: any; monthly: any; fee: any; points: any; featured: any; priority: any; support: any; analytics: any; bulk: any; gstin: any; am: any; api: any; sso: any };

  const cellFor = (plan: any, key: keyof RowData): React.ReactNode => {
    const f = (plan.features ?? {}) as any;
    const Yes = <Check className="inline h-3.5 w-3.5 text-success" />;
    const No = <span className="text-muted-foreground">-</span>;
    switch (key) {
      case "price":     return <>₹{plan.price_inr.toLocaleString("en-IN")} <span className="text-xs text-muted-foreground">/ {plan.period.replace("ly", "")}</span></>;
      case "monthly":   return <>~ ₹{Math.round(plan.price_inr / (plan.period === "yearly" ? 12 : plan.period === "quarterly" ? 3 : 1)).toLocaleString("en-IN")} <span className="text-xs text-muted-foreground">/ mo</span></>;
      case "fee":       return f.platform_fee_pct ? <>{Math.round(f.platform_fee_pct * 100)}%</> : <span className="text-muted-foreground">20% (default)</span>;
      case "points":    return f.points_multiplier ? <>{f.points_multiplier}x</> : <span className="text-muted-foreground">1x</span>;
      case "featured":  return f.featured_listing || f.featured_profile ? Yes : No;
      case "priority":  return f.priority_in_search ? Yes : No;
      case "support":   return f.priority_support ? Yes : No;
      case "analytics": return f.analytics_dashboard ? Yes : No;
      case "bulk":      return f.bulk_posting ? Yes : No;
      case "gstin":     return f.gstin_invoicing ? Yes : No;
      case "am":        return f.dedicated_account_manager ? Yes : No;
      case "api":       return f.api_access ? Yes : No;
      case "sso":       return f.sso ? Yes : No;
    }
  };

  // Order columns by period so the table reads monthly -> quarterly -> yearly.
  const periodOrder: Record<string, number> = { monthly: 0, quarterly: 1, yearly: 2, one_time: 3 };
  const ordered = [...plans].sort((a, b) => (periodOrder[a.period] ?? 99) - (periodOrder[b.period] ?? 99));

  return (
    <div className="mt-6 overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Feature</th>
            {ordered.map(p => (
              <th key={p.id} className="px-4 py-3 font-medium">
                <div className="capitalize">{p.period === "one_time" ? "one-time" : p.period.replace("ly", "")}</div>
                <div className="text-[10px] normal-case font-normal text-muted-foreground">{p.name.replace(/.*- /, "")}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={row.key} className={idx % 2 ? "bg-muted/10" : ""}>
              <td className="px-4 py-2.5 font-medium">{row.label}</td>
              {ordered.map(p => (
                <td key={p.id} className="px-4 py-2.5">
                  {row.format(cellFor(p, row.key))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-card p-4">
      <p className="font-medium">{q}</p>
      <p className="mt-1 text-muted-foreground">{children}</p>
    </div>
  );
}
