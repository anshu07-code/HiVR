import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { formatINR } from "@/lib/utils";
import { requireAdmin } from "@/lib/admin-auth";

export default async function AdminFinance() {
  await requireAdmin();
  const sb = createClient();
  const [{ data: payments }, { data: tips }, { data: settings }] = await Promise.all([
    sb.from("payments").select("amount, platform_fee_amount, status, created_at"),
    sb.from("tips").select("amount, paid_at, platform_cut_pct"),
    sb.from("platform_settings").select("key, value"),
  ]);

  const gmv = (payments ?? []).reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const platformRev = (payments ?? []).reduce((s, p) => s + Number(p.platform_fee_amount ?? 0), 0);
  const tipRev = (tips ?? []).filter(t => t.paid_at).reduce((s, t) => s + (Number(t.amount ?? 0) * Number(t.platform_cut_pct ?? 0.05)), 0);

  return (
    <div className="container max-w-5xl space-y-6 py-8">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Finance</h1>
      <p className="text-sm text-muted-foreground">Aggregate platform revenue, GMV, payout queue. Source: payments + tips + platform_settings.</p>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="GMV (gross)" value={formatINR(Math.round(gmv / 100))} />
        <Stat label="Task-fee revenue" value={formatINR(Math.round(platformRev / 100))} />
        <Stat label="Tip revenue" value={formatINR(Math.round(tipRev / 100))} />
      </div>

      <Card>
        <CardContent className="p-5">
          <h2 className="font-display text-lg font-semibold">Platform settings</h2>
          <pre className="mt-3 max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">
{JSON.stringify(settings ?? [], null, 2)}
          </pre>
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
