import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "How it works — HiVR" };

export default function HowItWorks() {
  return (
    <>      <main className="container max-w-3xl py-12">
        <h1 className="font-display text-4xl font-semibold tracking-tight">How HiVR works</h1>
        <p className="mt-3 text-muted-foreground text-pretty">
          A short tour for buyers and employees.
        </p>
        <div className="mt-8 grid gap-6">
          {[
            { t: "Post a task in minutes", d: "Pick a category, describe the work, set a budget. AI helps tighten your description. Tier B buyers pick daily-rate or per-milestone — never hourly." },
            { t: "Browse verified people", d: "Every active employee is identity-verified and skill-tested for their category. See their wage tier, rating, response time, and completion rate before you hire." },
            { t: "Pay into escrow, not to a stranger", d: "When you hire, the agreed amount is held by Razorpay — not by us, not in our bank. Funds release only when you approve the deliverable, or auto-release after 5 days with no dispute." },
            { t: "Work in tiers that match the work", d: "Bounded single-sitting work (Tier A) and multi-week project work (Tier B) live on different rails — different pricing, different verification, different risk profile." },
            { t: "Reviews and points you can trust", d: "Reviews are tied to real paid contracts. Points are non-cash-convertible by design (a legal constraint we built for) and only redeemable inside HiVR." },
            { t: "No off-platform leakage", d: "Sharing contact info in chat is detected and blocked at three layers. Off-platform work bypasses every protection — staying on HiVR keeps your money safe." },
          ].map((s, i) => (
            <Card key={i}><CardContent className="p-6">
              <div className="text-xs font-semibold text-primary">0{i+1}</div>
              <h2 className="mt-1 font-display text-xl font-semibold">{s.t}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
            </CardContent></Card>
          ))}
        </div>
      </main>    </>
  );
}
