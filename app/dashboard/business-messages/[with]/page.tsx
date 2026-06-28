import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Shield, FileText } from "lucide-react";
import { ChatThread } from "./chat-thread";
import { Suspense } from "react";

export const metadata = { title: "Business message — HiVR" };
export const dynamic = "force-dynamic";

export default async function EmployeeBusinessMessageThreadPage({
  params,
}: { params: { with: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect(`/auth/signin?next=/dashboard/business-messages/${params.with}`);

  const businessOwnerId = params.with;

  // Pull the business
  const { data: business } = await sb.from("business_profiles")
    .select("id, legal_name, brand_name, owner_user_id, owner:users!business_profiles_owner_user_id_fkey(id, full_name, avatar_url)")
    .eq("owner_user_id", businessOwnerId).maybeSingle();
  if (!business) notFound();

  // Find a contract between this employee and this business
  const { data: contract } = await sb.from("contracts")
    .select("id, status, agreed_price, started_at, job:business_jobs!contracts_business_job_id_fkey(id, title)")
    .eq("business_id", business.id).eq("employee_id", user.id)
    .order("started_at", { ascending: false }).limit(1).maybeSingle();

  if (!contract) {
    return (
      <div className="container max-w-3xl py-8">
        <Button asChild variant="ghost" size="sm"><Link href="/dashboard/business-messages"><ArrowLeft className="h-4 w-4" /> Back</Link></Button>
        <Card className="mt-4">
          <CardContent className="p-6 text-sm text-muted-foreground">
            You don't have an active contract with this business yet.
          </CardContent>
        </Card>
      </div>
    );
  }

  const { data: messages } = await sb.from("messages")
    .select("id, sender_id, content, created_at, blocked, flagged_for_contact_info")
    .eq("contract_id", contract.id)
    .order("created_at", { ascending: true });

  return (
    <div className="container max-w-3xl space-y-3 py-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/dashboard/business-messages"><ArrowLeft className="h-4 w-4" /> All messages</Link>
      </Button>

      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 font-semibold text-primary">
            {(business.brand_name || business.legal_name).slice(0, 1).toUpperCase()}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="font-semibold">{business.brand_name || business.legal_name}</p>
              <Badge variant="outline" className="text-[10px] capitalize">{contract.status}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              with <span className="text-foreground">{(business as any).owner?.full_name}</span>
              {" · "}
              <Link href={`/dashboard/contracts`} className="text-primary underline">{(contract as any).job?.title}</Link>
            </p>
          </div>
        </div>
      </header>

      <Card className="flex h-[60vh] flex-col overflow-hidden">
        <CardContent className="flex flex-1 flex-col gap-0 p-0">
          <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading messages...</div>}>
            <ChatThread
              contractId={contract.id}
              currentUserId={user.id}
              otherUserName={business.brand_name || business.legal_name}
              initialMessages={(messages as any[]) ?? []}
            />
          </Suspense>
        </CardContent>
      </Card>

      <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-700 dark:text-amber-300">
        <Shield className="mr-1 inline h-3 w-3" />
        Sharing contact details outside HiVR (phone, email, social handle) is auto-blocked. Repeat attempts result in suspension.
      </p>
    </div>
  );
}
