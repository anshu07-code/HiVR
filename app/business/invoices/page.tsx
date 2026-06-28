import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Plus, Calendar, IndianRupee } from "lucide-react";
import { formatINR } from "@/lib/utils";

export const metadata = { title: "HiVR Business — Invoices" };
export const dynamic = "force-dynamic";

export default async function BusinessInvoicesPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/business/invoices");
  const { data: bp } = await sb.from("business_profiles").select("id, brand_name, legal_name, gstin")
    .eq("owner_user_id", user.id).maybeSingle();
  if (!bp) redirect("/onboarding/business");

  // Each contract gets an invoice. We don't have a separate invoices table;
  // the contract id IS the invoice id. Pull all contracts with at least
  // one paid milestone or a paid advance.
  const { data: contracts } = await sb.from("contracts")
    .select("id, agreed_price, status, advance_paise, advance_paid_at, started_at, employee:users!contracts_employee_id_fkey(id, full_name), job:business_jobs!contracts_business_job_id_fkey(id, title)")
    .eq("business_id", bp.id)
    .order("started_at", { ascending: false });

  const items = (contracts as any[]) ?? [];
  const totalInvoiced = items.reduce((s, c) => s + Number(c.advance_paise ?? 0), 0);

  // Pull all paid milestone totals for breakdown
  const { data: paidMilestones } = await sb.from("business_milestones")
    .select("id, contract_id, amount_paise, status, paid_at")
    .eq("status", "paid");
  const totalPaid = (paidMilestones as any[])?.reduce((s, m) => s + Number(m.amount_paise), 0) ?? 0;

  return (
    <div className="container max-w-4xl space-y-5 py-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Invoices</h1>
        <p className="text-sm text-muted-foreground">
          GST-compliant tax invoices per contract. Click "Print / Save as PDF" to download.
        </p>
      </header>

      {/* KPI tiles */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase text-muted-foreground">Total invoiced</p>
            <p className="mt-1 font-display text-2xl font-semibold">{formatINR(Math.round(totalInvoiced / 100))}</p>
            <p className="mt-1 text-xs text-muted-foreground">across {items.length} contracts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase text-muted-foreground">Total paid out</p>
            <p className="mt-1 font-display text-2xl font-semibold">{formatINR(Math.round(totalPaid / 100))}</p>
            <p className="mt-1 text-xs text-muted-foreground">via milestone releases</p>
          </CardContent>
        </Card>
      </div>

      {(!items || items.length === 0) ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <FileText className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No invoices yet. Invoices are generated per contract as soon as work begins.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((c: any) => (
            <Link key={c.id} href={`/business/invoices/${c.id}`}>
              <Card className="transition-colors hover:border-primary/50">
                <CardContent className="flex flex-wrap items-center gap-3 p-4">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{c.job?.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.employee?.full_name ?? "Employee"} · {new Date(c.started_at).toLocaleDateString()}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{c.job?.title ?? "Contract"}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-lg font-semibold">
                      {formatINR(Math.round((c.advance_paise ?? 0) / 100))}
                    </p>
                    <p className="text-[10px] uppercase text-muted-foreground">invoiced</p>
                  </div>
                  <Badge variant="outline" className="text-[10px]">View</Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How invoices work</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• Each contract gets its own invoice. The invoice number is generated per billing period and is unique.</p>
          <p>• The invoice includes a per-milestone breakdown of all paid amounts, with CGST/SGST split (18% total — 9% + 9%).</p>
          <p>• Your GSTIN appears on every invoice for input tax credit claims.</p>
          <p>• Invoices are computer-generated and don't require a signature.</p>
        </CardContent>
      </Card>
    </div>
  );
}
