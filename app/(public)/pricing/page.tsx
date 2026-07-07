import { Badge } from "@/components/ui/badge";
import { Sparkles, Clock, Zap, ShieldCheck, Star, Wallet, Gift } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Pricing - HiVR" };

const perks = [
  { icon: Zap, text: "Reduced platform fees" },
  { icon: Star, text: "Featured task posts & profiles" },
  { icon: Wallet, text: "Priority in search results" },
  { icon: ShieldCheck, text: "Priority customer support" },
  { icon: Gift, text: "Bonus points & multipliers" },
  { icon: Clock, text: "Bulk hiring & team tools" },
];

export default function PricingPage() {
  return (
    <main className="flex min-h-[70vh] items-center">
      <div className="container py-20">
        <div className="mx-auto max-w-3xl text-center">
          <Badge variant="outline" className="mb-4 border-primary/30 bg-primary/5 px-4 py-1.5 text-xs">
            <Sparkles className="mr-1.5 h-3.5 w-3.5 text-primary" />
            Coming soon
          </Badge>
          <h1 className="font-display text-4xl font-semibold tracking-tight md:text-5xl lg:text-6xl">
            HiVR subscription plans
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground text-pretty">
            We&rsquo;re building something special. Subscription plans are launching soon with
            powerful features, priority support, and minimal pricing — designed to help you
            earn more and save more.
          </p>
          <p className="mt-2 text-base text-muted-foreground/80 italic">
            Huge earnings. Huge savings. Stay tuned.
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-3xl gap-3 sm:grid-cols-2 md:grid-cols-3">
          {perks.map((p) => (
            <Card key={p.text} className="shadow-sm ring-1 ring-border">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <p.icon className="h-4 w-4" />
                </div>
                <span className="text-sm text-muted-foreground">{p.text}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}
