import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, ShieldCheck, AlertTriangle, MapPin, IndianRupee, Mail, Phone, Globe, FileText, Calendar, BadgeCheck } from "lucide-react";
import { SettingsForm } from "./settings-form";
import { formatINR } from "@/lib/utils";

export const metadata = { title: "HiVR Business — Settings" };
export const dynamic = "force-dynamic";

const KYC_STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  in_review: "secondary",
  verified: "default",
  rejected: "destructive",
};

export default async function BusinessSettingsPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/business/settings");
  const { data: bp } = await sb.from("business_profiles")
    .select("*")
    .eq("owner_user_id", user.id).maybeSingle();
  if (!bp) redirect("/onboarding/business");

  // Pull any verifications on file (e.g. PAN, GSTIN, Aadhaar of the signatory)
  const { data: verifications } = await sb.from("verifications")
    .select("id, doc_type, status, created_at, reviewed_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  // Aggregate counts
  const [{ count: membersCount }, { count: jobsCount }, { count: contractsCount }] = await Promise.all([
    sb.from("business_members").select("id", { count: "exact", head: true }).eq("business_id", bp.id).eq("status", "active"),
    sb.from("business_jobs").select("id", { count: "exact", head: true }).eq("business_id", bp.id),
    sb.from("contracts").select("id", { count: "exact", head: true }).eq("business_id", bp.id),
  ]);

  return (
    <div className="container max-w-4xl space-y-5 py-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your business profile, KYC, payout details, and team.
        </p>
      </header>

      {/* KYC banner */}
      {bp.kyc_status !== "verified" && (
        <Card className={bp.kyc_status === "rejected" ? "border-destructive/40 bg-destructive/5" : "border-amber-500/40 bg-amber-500/5"}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <div className="flex items-center gap-3">
              {bp.kyc_status === "rejected" ? (
                <AlertTriangle className="h-4 w-4 text-destructive" />
              ) : (
                <ShieldCheck className="h-4 w-4 text-amber-600" />
              )}
              <div>
                <p className="font-medium">
                  {bp.kyc_status === "rejected" ? "KYC rejected" : "KYC pending review"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {bp.kyc_status === "rejected"
                    ? (bp as any).kyc_rejection_reason ?? "Reason not provided. Contact support."
                    : "We're reviewing your documents. You'll be able to send offers once verified."}
                </p>
              </div>
            </div>
            <Badge variant={KYC_STATUS_VARIANT[bp.kyc_status] ?? "outline"} className="capitalize">
              {bp.kyc_status}
            </Badge>
          </CardContent>
        </Card>
      )}

      {bp.is_suspended && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 text-sm text-destructive">
            <strong>Your business is suspended.</strong> Open offers, contract creation, and messages are disabled.
            {bp.suspended_reason && <> Reason: {bp.suspended_reason}</>}
            <br />
            <Link href="/support" className="text-xs underline">Contact support to appeal</Link>
          </CardContent>
        </Card>
      )}

      {/* Stats summary */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Active members" value={String(membersCount ?? 0)} />
        <StatCard label="Jobs posted" value={String(jobsCount ?? 0)} />
        <StatCard label="Contracts" value={String(contractsCount ?? 0)} />
      </div>

      {/* Editable profile form */}
      <SettingsForm profile={bp} />

      {/* Verifications log */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BadgeCheck className="h-4 w-4" /> Verifications on file</CardTitle>
          <CardDescription>Document verifications linked to the business owner / signatory</CardDescription>
        </CardHeader>
        <CardContent>
          {(!verifications || verifications.length === 0) ? (
            <p className="text-sm text-muted-foreground">No verifications submitted yet.</p>
          ) : (
            <ul className="space-y-2">
              {verifications.map((v: any) => (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm">
                  <div className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium uppercase">{v.doc_type}</span>
                    <span className="text-muted-foreground">· {new Date(v.created_at).toLocaleDateString()}</span>
                  </div>
                  <Badge variant={v.status === "verified" ? "default" : v.status === "rejected" ? "destructive" : "secondary"} className="capitalize">{v.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Danger zone</CardTitle>
          <CardDescription>Irreversible actions — proceed with care.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            To permanently close your business and cancel all subscriptions, contact <Link href="/support" className="text-primary underline">support</Link>.
            We do not offer a self-serve close button to prevent accidental data loss.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase text-muted-foreground">{label}</p>
        <p className="mt-1 font-display text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
