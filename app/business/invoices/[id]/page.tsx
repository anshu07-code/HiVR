import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Printer, ArrowLeft } from "lucide-react";
import { nextInvoiceNumber, splitGST, fmtINR, fmtDate } from "@/lib/invoice";
import Link from "next/link";

export const metadata = { title: "HiVR Business — Invoice" };
export const dynamic = "force-dynamic";

export default async function BusinessInvoiceDetailPage({ params, searchParams }: { params: { id: string }; searchParams: { download?: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect(`/auth/signin?next=/business/invoices/${params.id}`);

  const { data: bp } = await sb.from("business_profiles")
    .select("id, legal_name, brand_name, gstin, pan, registered_address, city, state, pincode, country, bank_account_name, bank_account_number, bank_ifsc, payout_upi_id")
    .eq("owner_user_id", user.id).maybeSingle();
  if (!bp) redirect("/onboarding/business");

  // The invoice id is the contract id (we generate one invoice per
  // monthly billing period for the contract). For the MVP, we generate
  // a per-contract invoice on demand.
  const { data: contract } = await sb.from("contracts")
    .select("id, status, agreed_price, advance_paise, advance_paid_at, started_at, employee_id, job:business_jobs!contracts_business_job_id_fkey(id, title), employee:users!contracts_employee_id_fkey(id, full_name, trust_tier)")
    .eq("id", params.id).eq("business_id", bp.id).maybeSingle();
  if (!contract) notFound();

  // Pull the milestones for line items
  const { data: milestones } = await sb.from("business_milestones")
    .select("id, title, amount_paise, status, paid_at")
    .eq("contract_id", contract.id)
    .order("created_at", { ascending: true });

  const lines = (milestones as any[]) ?? [];
  const totalBase = lines.reduce((s, m) => s + Number(m.amount_paise), 0);
  const split = splitGST(totalBase);

  // Pull any advance paid + its invoice number
  const advancePaise = Number((contract as any).advance_paise ?? 0);
  const advancePaid = !!(contract as any).advance_paid_at;
  const advanceLine = advancePaid
    ? { description: "Advance payment (held in escrow)", amount: advancePaise, date: (contract as any).advance_paid_at }
    : null;

  // Number this invoice
  const inv = await nextInvoiceNumber();
  const isPrint = searchParams?.download === "1";

  return (
    <div className={`${isPrint ? "" : "container max-w-4xl py-6"} bg-background`}>
      {!isPrint && (
        <div className="mb-4 flex items-center justify-between print:hidden">
          <Button asChild variant="ghost" size="sm">
            <Link href="/business/invoices"><ArrowLeft className="h-4 w-4" /> Back to invoices</Link>
          </Button>
          <Button asChild variant="gradient" size="sm">
            <a href={`/business/invoices/${params.id}?download=1`} target="_blank" rel="noreferrer">
              <Printer className="h-3.5 w-3.5" /> Print / Save as PDF
            </a>
          </Button>
        </div>
      )}

      <style>{`
        @page { size: A4; margin: 16mm; }
        @media print {
          body { background: #fff !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="rounded-lg border bg-white p-8 text-foreground shadow-sm print:shadow-none print:border-0">
        {/* Header */}
        <div className="flex items-start justify-between border-b-2 border-foreground/80 pb-4">
          <div>
            <p className="font-display text-2xl font-bold tracking-tight">HiVR</p>
            <p className="text-xs text-muted-foreground">Small jobs, verified people.</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Tax Invoice</p>
            <p className="font-mono text-sm font-medium">{inv.number}</p>
            <p className="text-xs text-muted-foreground">Issued {fmtDate(inv.issuedAt)}</p>
          </div>
        </div>

        {/* Billed from / Billed to */}
        <div className="mt-4 grid grid-cols-2 gap-6 text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Billed from</p>
            <p className="mt-1 font-semibold">HiVR Technologies Pvt Ltd</p>
            <p className="text-muted-foreground">123 Market Street, Bengaluru, KA 560001</p>
            <p className="text-muted-foreground">GSTIN: 29ABCDE1234F1Z5</p>
            <p className="text-muted-foreground">PAN: ABCDE1234F</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Billed to</p>
            <p className="mt-1 font-semibold">{bp.brand_name || bp.legal_name}</p>
            {(bp as any).registered_address && <p className="text-muted-foreground">{(bp as any).registered_address}</p>}
            <p className="text-muted-foreground">{(bp as any).city}, {(bp as any).state} {(bp as any).pincode}</p>
            {(bp as any).gstin && <p className="text-muted-foreground">GSTIN: {(bp as any).gstin}</p>}
            {(bp as any).pan && <p className="text-muted-foreground">PAN: {(bp as any).pan}</p>}
          </div>
        </div>

        {/* Period */}
        <div className="mt-4 grid grid-cols-3 gap-4 rounded-md border bg-muted/30 p-3 text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Contract</p>
            <p className="font-medium">{(contract as any).job?.title}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Period</p>
            <p className="mt-0.5">{fmtDate(inv.periodStart)} – {fmtDate(inv.periodEnd)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Employee</p>
            <p className="mt-0.5 font-medium">{(contract as any).employee?.full_name}</p>
          </div>
        </div>

        {/* Line items */}
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="py-2">#</th>
              <th className="py-2">Description</th>
              <th className="py-2">Date</th>
              <th className="py-2 text-right">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            {advanceLine && (
              <tr className="border-b">
                <td className="py-2 text-muted-foreground">A1</td>
                <td className="py-2">{advanceLine.description}</td>
                <td className="py-2 text-muted-foreground">{fmtDate(advanceLine.date)}</td>
                <td className="py-2 text-right tabular-nums">{fmtINR(advanceLine.amount)}</td>
              </tr>
            )}
            {lines.map((m, i) => (
              <tr key={m.id} className="border-b">
                <td className="py-2 text-muted-foreground">{(advanceLine ? "B" : "A")}{i + 1}</td>
                <td className="py-2">{m.title} <span className="text-muted-foreground">({m.status})</span></td>
                <td className="py-2 text-muted-foreground">{m.paid_at ? fmtDate(m.paid_at) : "—"}</td>
                <td className="py-2 text-right tabular-nums">{fmtINR(m.amount_paise)}</td>
              </tr>
            ))}
            {lines.length === 0 && !advanceLine && (
              <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">No paid milestones yet.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="py-2 text-right text-muted-foreground">Subtotal</td>
              <td className="py-2 text-right tabular-nums">{fmtINR(split.base)}</td>
            </tr>
            <tr>
              <td colSpan={3} className="py-2 text-right text-muted-foreground">CGST @ 9%</td>
              <td className="py-2 text-right tabular-nums">{fmtINR(split.cgst)}</td>
            </tr>
            <tr>
              <td colSpan={3} className="py-2 text-right text-muted-foreground">SGST @ 9%</td>
              <td className="py-2 text-right tabular-nums">{fmtINR(split.sgst)}</td>
            </tr>
            <tr className="border-t-2 border-foreground/80">
              <td colSpan={3} className="py-3 text-right font-display text-base font-semibold">Total</td>
              <td className="py-3 text-right font-display text-base font-semibold tabular-nums">{fmtINR(split.total)}</td>
            </tr>
          </tfoot>
        </table>

        {/* Notes */}
        <div className="mt-6 border-t pt-4 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Notes</p>
          <ul className="mt-1 list-disc pl-4 space-y-0.5">
            <li>This is a computer-generated invoice. No signature required.</li>
            <li>All amounts in INR.</li>
            <li>Payment was made through Razorpay. Reference: see payment row in the Payments page.</li>
            <li>For questions, contact support@hivr.example.</li>
          </ul>
        </div>
      </div>

      {!isPrint && (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Use your browser's Print dialog to save as PDF. Invoice number <span className="font-mono">{inv.number}</span>.
        </p>
      )}
    </div>
  );
}
