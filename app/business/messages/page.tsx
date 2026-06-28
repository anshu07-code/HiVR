import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

export const metadata = { title: "HiVR Business — Messages" };
export const dynamic = "force-dynamic";

export default async function BusinessMessagesListPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/business/messages");
  const { data: bp } = await sb.from("business_profiles").select("id, brand_name, legal_name").eq("owner_user_id", user.id).maybeSingle();
  if (!bp) redirect("/onboarding/business");

  // Pull all business contracts (with employee) to build a thread list.
  const { data: contracts } = await sb.from("contracts")
    .select("id, status, agreed_price, started_at, employee_id, employee:users!contracts_employee_id_fkey(id, full_name, avatar_url, trust_tier, is_verified), job:business_jobs!contracts_business_job_id_fkey(id, title)")
    .eq("business_id", bp.id)
    .order("started_at", { ascending: false });

  // For each contract, pull the last message
  const contractIds = (contracts ?? []).map((c: any) => c.id);
  const { data: lastMsgs } = contractIds.length
    ? await sb.from("messages")
        .select("id, contract_id, sender_id, content, created_at, blocked, flagged_for_contact_info")
        .in("contract_id", contractIds)
        .order("created_at", { ascending: false })
    : { data: [] as any[] };

  const lastByContract = new Map<string, any>();
  for (const m of (lastMsgs as any[]) ?? []) {
    if (m.contract_id && !lastByContract.has(m.contract_id)) {
      lastByContract.set(m.contract_id, m);
    }
  }

  return (
    <div className="container max-w-3xl space-y-4 py-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Messages</h1>
        <p className="text-sm text-muted-foreground">
          Mediated by Trust & Safety. Off-platform contact sharing is blocked.
        </p>
      </header>

      {(!contracts || contracts.length === 0) ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <MessageSquare className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No threads yet. Sign a contract or send an offer to start a conversation.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {contracts.map((c: any) => {
            const last = lastByContract.get(c.id);
            return (
              <Link
                key={c.id}
                href={`/business/messages/${c.employee?.id ?? ""}`}
                className="flex items-start gap-3 rounded-md border p-3 transition-colors hover:bg-accent"
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 font-semibold text-primary">
                  {(c.employee?.full_name ?? "?").slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{c.employee?.full_name ?? "Employee"}</p>
                      <Badge variant="outline" className="text-[10px] capitalize">{c.status}</Badge>
                    </div>
                    {last && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(last.created_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{c.job?.title ?? "—"}</p>
                  {last ? (
                    <p className={cn(
                      "mt-1 line-clamp-1 text-sm",
                      last.blocked ? "italic text-muted-foreground" : "text-foreground/80",
                    )}>
                      {last.blocked ? "[blocked: contact-info attempt]" : last.content}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm italic text-muted-foreground">No messages yet — start the conversation.</p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
