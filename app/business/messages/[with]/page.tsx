import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Phone, Shield, FileText } from "lucide-react";
import { ChatThread } from "./chat-thread";
import { Suspense } from "react";

export const metadata = { title: "HiVR Business — Message" };
export const dynamic = "force-dynamic";

export default async function BusinessMessagesThreadPage({
  params,
}: { params: { with: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect(`/auth/signin?next=/business/messages/${params.with}`);
  const { data: bp } = await sb.from("business_profiles").select("id, brand_name, legal_name").eq("owner_user_id", user.id).maybeSingle();
  if (!bp) redirect("/onboarding/business");

  const withUserId = params.with;

  // Pull the other user
  const { data: other } = await sb.from("users")
    .select("id, full_name, avatar_url, trust_tier, is_verified, current_mode")
    .eq("id", withUserId).maybeSingle();
  if (!other) notFound();

  // Find a contract between this business and this user.
  const { data: contract } = await sb.from("contracts")
    .select("id, status, agreed_price, started_at, job:business_jobs!contracts_business_job_id_fkey(id, title)")
    .eq("business_id", bp.id).eq("employee_id", withUserId)
    .order("started_at", { ascending: false }).limit(1).maybeSingle();

  if (!contract) {
    return (
      <div className="container max-w-3xl py-8">
        <Button asChild variant="ghost" size="sm"><Link href="/business/messages"><ArrowLeft className="h-4 w-4" /> Back</Link></Button>
        <Card className="mt-4">
          <CardContent className="space-y-2 p-6 text-sm text-muted-foreground">
            <p>You don't have an active contract with this person yet.</p>
            <p>Sign a contract before messaging — it's how we keep all work on-platform and protected by HiVR escrow + dispute support.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Pull message history
  const { data: messages } = await sb.from("messages")
    .select("id, sender_id, content, created_at, blocked, flagged_for_contact_info")
    .eq("contract_id", contract.id)
    .order("created_at", { ascending: true });

  return (
    <div className="container max-w-3xl space-y-3 py-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/business/messages"><ArrowLeft className="h-4 w-4" /> All messages</Link>
      </Button>

      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 font-semibold text-primary">
            {(other.full_name ?? "?").slice(0, 1).toUpperCase()}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="font-semibold">{other.full_name}</p>
              <Badge variant="outline" className="text-[10px]">{other.trust_tier ?? "Unranked"}</Badge>
              {other.is_verified && <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-600/30">Verified</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">
              via contract — <Link href={`/business/contracts/${contract.id}`} className="text-primary underline">{(contract as any).job?.title}</Link>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline"><Link href={`/business/calls?to=${other.id}`}><Phone className="h-3.5 w-3.5" /> Call</Link></Button>
          <Button asChild size="sm" variant="outline"><Link href={`/business/contracts/${contract.id}`}><FileText className="h-3.5 w-3.5" /> Contract</Link></Button>
        </div>
      </header>

      <Card className="flex h-[60vh] flex-col overflow-hidden">
        <CardContent className="flex flex-1 flex-col gap-0 p-0">
          <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading messages...</div>}>
            <ChatThread
              contractId={contract.id}
              currentUserId={user.id}
              otherUserName={other.full_name ?? "Employee"}
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
