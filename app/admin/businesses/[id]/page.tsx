import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Building2, AlertTriangle, ShieldCheck, FileText, IndianRupee, Users, Briefcase, MessageCircle, AlertCircle, History, Wallet } from "lucide-react";
import { formatINR } from "@/lib/utils";
import { AdminBusinessActions } from "./actions";
import { requireAdmin } from "@/lib/admin-auth";

export const metadata = { title: "Admin — Business" };
export const dynamic = "force-dynamic";

const KYC_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  in_review: "secondary",
  verified: "default",
  rejected: "destructive",
};

export default async function AdminBusinessDetailPage({ params }: { params: { id: string } }) {
  await requireAdmin();
  const sb = createClient();

  const { data: bp } = await sb.from("business_profiles")
    .select("*, owner:users!business_profiles_owner_user_id_fkey(id, full_name, email, phone, created_at, last_sign_in_at, is_suspended, contact_warning_count)")
    .eq("id", params.id).maybeSingle();
  if (!bp) notFound();

  // Pull all related data
  const [
    { data: subs },
    { data: members },
    { data: jobs },
    { data: contracts },
    { data: disputes },
    { data: messages },
    { data: recentPayments },
  ] = await Promise.all([
    sb.from("business_subscriptions")
      .select("plan_key, status, started_at, current_period_start, current_period_end, cancel_at, cancelled_at, lifetime_spend_paise, month_to_date_spend_paise, razorpay_subscription_id")
      .eq("business_id", bp.id).order("created_at", { ascending: false }),
    sb.from("business_members")
      .select("id, user_id, member_role, status, is_hired, invited_at, joined_at, hired_at, user:users!business_members_user_id_fkey(id, full_name, email, trust_tier)")
      .eq("business_id", bp.id).order("invited_at", { ascending: false }),
    sb.from("business_jobs")
      .select("id, title, status, created_at, positions, positions_filled")
      .eq("business_id", bp.id).order("created_at", { ascending: false }).limit(20),
    sb.from("contracts")
      .select("id, status, agreed_price, started_at, approved_at, employee:users!contracts_employee_id_fkey(id, full_name)")
      .eq("business_id", bp.id).order("started_at", { ascending: false }).limit(20),
    sb.from("business_disputes")
      .select("id, status, reason, raised_by_role, created_at, resolved_at, contract_id")
      .eq("business_id", bp.id).order("created_at", { ascending: false }).limit(20),
    sb.from("messages")
      .select("id, contract_id, sender_id, content, created_at, blocked")
      .in("contract_id", (await sb.from("contracts").select("id").eq("business_id", bp.id).limit(50)).data?.map(c => c.id) ?? [])
      .order("created_at", { ascending: false }).limit(20),
    sb.from("payments")
      .select("id, amount, status, created_at, contract_id, milestone_id")
      .in("contract_id", (await sb.from("contracts").select("id").eq("business_id", bp.id).limit(50)).data?.map(c => c.id) ?? [])
      .order("created_at", { ascending: false }).limit(20),
  ]);

  const activeSub = (subs as any[])?.find(s => s.status === "active" || s.status === "trialing");
  const planKey = activeSub?.plan_key ?? "business_free";

  return (
    <div className="container max-w-5xl space-y-5 py-8">
      <Button asChild variant="ghost" size="sm">
        <Link href="/admin/businesses"><ArrowLeft className="h-4 w-4" /> Back to businesses</Link>
      </Button>

      <header className="flex flex-wrap items-start gap-3">
        <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-lg ${(bp as any).is_suspended ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
          <Building2 className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              {(bp as any).brand_name || (bp as any).legal_name}
            </h1>
            <Badge variant={KYC_VARIANT[(bp as any).kyc_status] ?? "outline"} className="capitalize">
              KYC: {(bp as any).kyc_status}
            </Badge>
            {(bp as any).is_suspended && <Badge variant="destructive" className="capitalize">Suspended</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            Owner: <span className="font-medium text-foreground">{(bp as any).owner?.full_name}</span> · {(bp as any).owner?.email}
            {(bp as any).owner?.phone && <> · {(bp as any).owner.phone}</>}
          </p>
        </div>
      </header>

      {/* Suspended banner */}
      {(bp as any).is_suspended && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-center gap-2 p-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span><strong>Suspended.</strong> Reason: {(bp as any).suspended_reason ?? "—"}</span>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-5 lg:col-span-2">
          {/* KPIs */}
          <div className="grid gap-3 sm:grid-cols-4">
            <Kpi label="Contracts" value={String((bp as any).total_contracts_signed ?? 0)} />
            <Kpi label="Hires" value={String((bp as any).total_employees_hired ?? 0)} />
            <Kpi label="Disputes" value={String((bp as any).total_disputes ?? 0)} />
            <Kpi label="Lifetime spend" value={formatINR(Math.round(((bp as any).total_spend_paise ?? 0) / 100))} />
          </div>

          {/* Active subscription */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Wallet className="h-4 w-4" /> Subscription</CardTitle>
            </CardHeader>
            <CardContent>
              {!activeSub ? (
                <p className="text-sm text-muted-foreground">No active subscription (free trial).</p>
              ) : (
                <div className="space-y-2 text-sm">
                  <Row label="Plan" value={planKey.replace("business_", "")} />
                  <Row label="Status" value={activeSub.status} />
                  <Row label="Started" value={new Date(activeSub.started_at).toLocaleDateString()} />
                  <Row label="Period ends" value={new Date(activeSub.current_period_end).toLocaleDateString()} />
                  {activeSub.cancel_at && <Row label="Cancels at" value={new Date(activeSub.cancel_at).toLocaleDateString()} highlight />}
                  <Row label="MTD spend" value={formatINR(Math.round((activeSub.month_to_date_spend_paise ?? 0) / 100))} />
                  <Row label="Lifetime" value={formatINR(Math.round((activeSub.lifetime_spend_paise ?? 0) / 100))} />
                  {activeSub.razorpay_subscription_id && (
                    <Row label="Razorpay sub id" value={activeSub.razorpay_subscription_id} mono />
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Members */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Users className="h-4 w-4" /> Members ({(members as any[])?.length ?? 0})</CardTitle>
            </CardHeader>
            <CardContent>
              {(!members || (members as any[]).length === 0) ? (
                <p className="text-sm text-muted-foreground">No team members.</p>
              ) : (
                <ul className="space-y-1.5">
                  {(members as any[]).slice(0, 10).map((m: any) => (
                    <li key={m.id} className="flex items-center gap-2 text-sm">
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                        {(m.user?.full_name ?? "?").slice(0, 1).toUpperCase()}
                      </span>
                      <span className="font-medium">{m.user?.full_name}</span>
                      <Badge variant="outline" className="text-[10px] capitalize">{m.member_role}</Badge>
                      <Badge variant={m.status === "active" ? "default" : "outline"} className="text-[10px] capitalize">{m.status}</Badge>
                      {m.is_hired && <Badge variant="secondary" className="text-[10px]">hired</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Recent contracts */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Briefcase className="h-4 w-4" /> Recent contracts</CardTitle>
            </CardHeader>
            <CardContent>
              {(!contracts || (contracts as any[]).length === 0) ? (
                <p className="text-sm text-muted-foreground">No contracts yet.</p>
              ) : (
                <ul className="space-y-1">
                  {(contracts as any[]).slice(0, 10).map((c: any) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                      <Link href={`/admin/contracts?focus=${c.id}`} className="font-medium text-primary hover:underline">{c.employee?.full_name}</Link>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="capitalize">{c.status}</Badge>
                        <span>{formatINR(Math.round(c.agreed_price / 100))}</span>
                        <span>{new Date(c.started_at).toLocaleDateString()}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Disputes */}
          {(disputes as any[])?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><AlertCircle className="h-4 w-4" /> Disputes ({(disputes as any[]).length})</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5">
                  {(disputes as any[]).slice(0, 10).map((d: any) => (
                    <li key={d.id} className="rounded-md border p-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="capitalize">{d.status.replace("_", " ")}</Badge>
                        <span className="text-xs text-muted-foreground">{d.raised_by_role}</span>
                        <span className="ml-auto text-xs text-muted-foreground">{new Date(d.created_at).toLocaleDateString()}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{d.reason}</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <AdminBusinessActions
            businessId={bp.id}
            isSuspended={(bp as any).is_suspended}
            kycStatus={(bp as any).kyc_status}
            ownerName={(bp as any).owner?.full_name}
            businessName={(bp as any).brand_name || (bp as any).legal_name}
          />

          <Card>
            <CardHeader><CardTitle className="text-base">Business details</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Legal name" value={(bp as any).legal_name} />
              {(bp as any).brand_name && <Row label="Brand" value={(bp as any).brand_name} />}
              <Row label="Entity" value={(bp as any).entity_type} />
              {(bp as any).pan && <Row label="PAN" value={(bp as any).pan} mono />}
              {(bp as any).gstin && <Row label="GSTIN" value={(bp as any).gstin} mono />}
              {(bp as any).cin && <Row label="CIN" value={(bp as any).cin} mono />}
              {(bp as any).llpin && <Row label="LLPIN" value={(bp as any).llpin} mono />}
              <Row label="Joined" value={new Date(bp.created_at).toLocaleDateString()} />
            </CardContent>
          </Card>

          {(bp as any).is_suspended && (bp as any).suspended_reason && (
            <Card className="border-destructive/40">
              <CardHeader>
                <CardTitle className="text-base text-destructive">Suspension reason</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">{(bp as any).suspended_reason}</CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4" /> Audit log</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>Created: {new Date(bp.created_at).toLocaleString()}</li>
                {(bp as any).kyc_verified_at && <li>KYC verified: {new Date((bp as any).kyc_verified_at).toLocaleString()}</li>}
                {(bp as any).suspended_at && <li className="text-destructive">Suspended: {new Date((bp as any).suspended_at).toLocaleString()}</li>}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase text-muted-foreground">{label}</p>
        <p className="mt-1 font-display text-lg font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, highlight, mono }: { label: string; value: string; highlight?: boolean; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={`${highlight ? "font-medium text-amber-600" : "font-medium"} ${mono ? "font-mono text-xs" : ""} break-all text-right`}>{value}</span>
    </div>
  );
}
