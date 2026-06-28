import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Phone, Shield, AlertCircle } from "lucide-react";
import { StartCallForm } from "./start-call-form";

export const metadata = { title: "HiVR Business — Schedule a call" };
export const dynamic = "force-dynamic";

export default async function NewBusinessCallPage({ searchParams }: { searchParams: { to?: string; contract?: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/business/calls/new");
  const { data: bp } = await sb.from("business_profiles")
    .select("id, brand_name, legal_name, is_suspended").eq("owner_user_id", user.id).maybeSingle();
  if (!bp) redirect("/onboarding/business");
  if (bp.is_suspended) {
    return (
      <div className="container max-w-3xl py-12">
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>Your business is suspended</CardTitle>
            <CardDescription>You cannot schedule calls while suspended.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Pull all employees with active contracts (so the form can pick one)
  const { data: members } = await sb.from("business_members")
    .select("user_id, user:users!business_members_user_id_fkey(id, full_name, avatar_url, trust_tier)")
    .eq("business_id", bp.id).eq("status", "active").eq("is_hired", true);

  // Also pull the contract context if provided
  const contractId = searchParams?.contract;
  let contract: any = null;
  if (contractId) {
    const { data } = await sb.from("contracts")
      .select("id, status, employee:users!contracts_employee_id_fkey(id, full_name)")
      .eq("id", contractId).eq("business_id", bp.id).maybeSingle();
    contract = data as any;
  }

  // Default recipient: ?to=userId, then contract.employee.id
  const defaultTo = searchParams?.to ?? contract?.employee?.id ?? "";

  return (
    <div className="container max-w-2xl space-y-5 py-8">
      <Button asChild variant="ghost" size="sm">
        <Link href="/business/calls"><ArrowLeft className="h-4 w-4" /> Back to calls</Link>
      </Button>

      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Schedule a call</h1>
        <p className="text-sm text-muted-foreground">
          HiVR bridges the call through a proxy number. Your number stays private.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Phone className="h-4 w-4" /> Call details</CardTitle>
          <CardDescription>Pick who you want to call. We'll dial both parties and bridge the call.</CardDescription>
        </CardHeader>
        <CardContent>
          <StartCallForm
            businessId={bp.id}
            defaultTo={defaultTo}
            contractId={contractId}
            members={(members as any[]) ?? []}
            defaultName={contract?.employee?.full_name}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Shield className="h-4 w-4" /> How it works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>1. <strong>Pick a recipient</strong> from your active team (employees with current contracts).</p>
          <p>2. <strong>Set a topic</strong> so the call is purposeful and the recording is useful for the contract audit trail.</p>
          <p>3. <strong>HiVR dials</strong> both parties through our proxy number. Your real number is never shared.</p>
          <p>4. <strong>Recording + transcript</strong> are saved automatically. Both parties get a copy of the transcript.</p>
          <p>5. <strong>Billing</strong> is at ₹1/min (proxy + Twilio transcription). Added to your monthly invoice.</p>
        </CardContent>
      </Card>
    </div>
  );
}
