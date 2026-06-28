import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Building2, Search, AlertTriangle, ShieldCheck, IndianRupee, Users, ChevronRight } from "lucide-react";
import { formatINR } from "@/lib/utils";
import { requireAdmin } from "@/lib/admin-auth";

export const metadata = { title: "Admin — Businesses" };
export const dynamic = "force-dynamic";

const KYC_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  in_review: "secondary",
  verified: "default",
  rejected: "destructive",
};

export default async function AdminBusinessesPage({ searchParams }: { searchParams: { q?: string; kyc?: string; suspended?: string } }) {
  await requireAdmin();
  const sb = createClient();
  const q = (searchParams?.q ?? "").trim();
  const kyc = searchParams?.kyc ?? "all";
  const suspended = searchParams?.suspended ?? "all";

  let query = sb.from("business_profiles")
    .select("id, legal_name, brand_name, gstin, pan, kyc_status, is_suspended, suspended_reason, total_spend_paise, total_contracts_signed, total_employees_hired, total_disputes, created_at, owner:users!business_profiles_owner_user_id_fkey(id, full_name, email, phone, created_at)")
    .order("created_at", { ascending: false });

  if (kyc === "verified") query = query.eq("kyc_status", "verified");
  else if (kyc === "pending") query = query.in("kyc_status", ["pending", "in_review"]);
  else if (kyc === "rejected") query = query.eq("kyc_status", "rejected");
  if (suspended === "yes") query = query.eq("is_suspended", true);
  if (q) {
    query = query.or(`legal_name.ilike.%${q}%,brand_name.ilike.%${q}%,gstin.ilike.%${q}%,pan.ilike.%${q}%`);
  }
  const { data: businesses } = await query;

  const list = (businesses as any[]) ?? [];

  // Counts
  const total = list.length;
  const kycPending = list.filter(b => b.kyc_status === "pending" || b.kyc_status === "in_review").length;
  const suspendedCount = list.filter(b => b.is_suspended).length;
  const totalSpend = list.reduce((s, b) => s + Number(b.total_spend_paise ?? 0), 0);

  return (
    <div className="container max-w-6xl space-y-5 py-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Businesses</h1>
        <p className="text-sm text-muted-foreground">
          All registered businesses on HiVR. Review KYC, suspend abusers, refund contracts.
        </p>
      </header>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase text-muted-foreground">Total</p>
            <p className="mt-1 font-display text-2xl font-semibold">{total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase text-muted-foreground">KYC pending</p>
            <p className="mt-1 font-display text-2xl font-semibold">{kycPending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase text-muted-foreground">Suspended</p>
            <p className="mt-1 font-display text-2xl font-semibold">{suspendedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase text-muted-foreground">Lifetime spend</p>
            <p className="mt-1 font-display text-2xl font-semibold">{formatINR(Math.round(totalSpend / 100))}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search by name, GSTIN, PAN…"
            className="pl-8"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {["all", "verified", "pending", "rejected"].map(s => (
            <Link key={s} href={`/admin/businesses?kyc=${s}`}>
              <Badge variant={kyc === s ? "default" : "secondary"} className="px-3 py-1 capitalize">{s === "all" ? "All KYC" : s}</Badge>
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {["all", "yes"].map(s => (
            <Link key={s} href={`/admin/businesses?suspended=${s}`}>
              <Badge variant={suspended === s ? "default" : "secondary"} className="px-3 py-1 capitalize">{s === "all" ? "All" : "Suspended"}</Badge>
            </Link>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No businesses match those filters.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {list.map((b: any) => (
            <Link key={b.id} href={`/admin/businesses/${b.id}`}>
              <Card className="transition-colors hover:border-primary/50">
                <CardContent className="flex flex-wrap items-center gap-3 p-4">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="font-semibold">{b.brand_name || b.legal_name}</p>
                      <Badge variant={KYC_VARIANT[b.kyc_status] ?? "outline"} className="capitalize">
                        KYC: {b.kyc_status}
                      </Badge>
                      {b.is_suspended && <Badge variant="destructive" className="capitalize">Suspended</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {b.owner?.full_name} · {b.owner?.email} · joined {new Date(b.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-right text-xs">
                    <div>
                      <p className="font-display text-base font-semibold">{b.total_contracts_signed ?? 0}</p>
                      <p className="text-[10px] text-muted-foreground">contracts</p>
                    </div>
                    <div>
                      <p className="font-display text-base font-semibold">{b.total_employees_hired ?? 0}</p>
                      <p className="text-[10px] text-muted-foreground">hires</p>
                    </div>
                    <div>
                      <p className="font-display text-base font-semibold">{formatINR(Math.round((b.total_spend_paise ?? 0) / 100))}</p>
                      <p className="text-[10px] text-muted-foreground">spent</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
