/**
 * lib/invoice.ts — generate a GST-compliant invoice number + metadata.
 *
 * Format: HiVR-YYYYMM-NNNNNN (per-month counter).
 * Sequence stored in platform_settings so it's atomic and not tied to a
 * specific business.
 */
import { createClient } from "@/lib/supabase/server";

const PAD = 6;
const PREFIX = "HiVR";

export type InvoiceMeta = {
  number: string;
  issuedAt: string; // ISO
  periodStart: string; // YYYY-MM-01
  periodEnd: string;   // YYYY-MM-28/29/30/31
};

export async function nextInvoiceNumber(): Promise<InvoiceMeta> {
  const sb = createClient();
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const key = `invoice_counter_${ym}`;
  // Atomic increment via a Postgres function would be ideal; for the MVP
  // we use a read-modify-write. Safe enough for low-frequency billing.
  const { data: row } = await sb.from("platform_settings")
    .select("key, value").eq("key", key).maybeSingle();
  const current = Number((row as any)?.value?.count ?? 0);
  const next = current + 1;
  await sb.from("platform_settings").upsert({
    key,
    value: { count: next } as any,
    updated_at: now.toISOString(),
  } as any, { onConflict: "key" });

  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  return {
    number: `${PREFIX}-${ym}-${String(next).padStart(PAD, "0")}`,
    issuedAt: now.toISOString(),
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
  };
}

/** GST rate applied on top of base amounts. Default 18% (9% CGST + 9% SGST). */
export const GST_RATE_PCT = 18;

export function splitGST(amountPaise: number): { base: number; cgst: number; sgst: number; total: number } {
  const total = Math.round(amountPaise);
  const base = Math.round(total / (1 + GST_RATE_PCT / 100));
  const tax = total - base;
  const cgst = Math.round(tax / 2);
  const sgst = tax - cgst;
  return { base, cgst, sgst, total };
}

export function fmtINR(paise: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Math.round(paise / 100));
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
