import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FolderKanban, ArrowRight } from "lucide-react";
import { formatINR, timeAgo } from "@/lib/utils";
import { encodeWorkspaceSlug } from "@/lib/workspace-slug";
import { ContractsRealtimeWrapper } from "@/components/dashboard/contracts-realtime-wrapper";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MyContracts() {
  // Use the regular (RLS-enforced) client so each user only sees the
  // contracts they participate in (as buyer or as employee).
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();

  if (!user) {
    return (
      <div className="container max-w-5xl py-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Contracts</h1>
        <p className="mt-2 text-sm text-muted-foreground">Sign in to view your contracts.</p>
      </div>
    );
  }

  // Fetch the user's contracts + users in parallel.
  const [
    { data: contracts, error: contractsErr },
    { data: profiles, error: profilesErr },
  ] = await Promise.all([
    sb
      .from("contracts")
      .select("id, status, agreed_price, started_at, approved_at, buyer_id, employee_id, task_post_id, category_id")
      // Only contracts where the signed-in user is buyer OR employee.
      .or(`buyer_id.eq.${user.id},employee_id.eq.${user.id}`)
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(50),
    sb.from("users").select("id, full_name, email"),
  ]);

  if (contractsErr) {
    return (
      <div className="container max-w-5xl py-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Contracts</h1>
        <p className="mt-2 text-sm text-destructive">Error loading contracts: {contractsErr.message}</p>
      </div>
    );
  }

  const userById = new Map<string, any>();
  for (const u of profiles ?? []) userById.set(u.id, u);

  const contractIds = (contracts ?? []).map(c => c.id);
  const taskPostIds = Array.from(new Set((contracts ?? []).map(c => c.task_post_id).filter(Boolean))) as string[];
  const categoryIds = Array.from(new Set((contracts ?? []).map(c => c.category_id).filter(Boolean))) as string[];

  const [tasksRes, catsRes, wsRes] = await Promise.all([
    taskPostIds.length > 0
      ? sb.from("task_posts").select("id, title").in("id", taskPostIds)
      : Promise.resolve({ data: [], error: null } as any),
    categoryIds.length > 0
      ? sb.from("skill_categories").select("id, name").in("id", categoryIds)
      : Promise.resolve({ data: [], error: null } as any),
    contractIds.length > 0
      ? sb.from("workspaces").select("id, contract_id, status, escrow_funded, escrow_amount_paise").in("contract_id", contractIds)
      : Promise.resolve({ data: [], error: null } as any),
  ]);

  const taskById = new Map<string, any>();
  for (const t of tasksRes.data ?? []) taskById.set(t.id, t);

  const catById = new Map<string, any>();
  for (const c of catsRes.data ?? []) catById.set(c.id, c);

  const wsByContractId = new Map<string, any>();
  for (const w of wsRes.data ?? []) wsByContractId.set(w.contract_id, w);

  const list = (contracts ?? []) as any[];

  return (
    <ContractsRealtimeWrapper userId={user.id}>
    <div className="container max-w-5xl space-y-4 py-8">
      <div>
        <div className="flex items-center gap-2">
          <FolderKanban className="h-6 w-6 text-primary" />
          <h1 className="font-display text-3xl font-semibold tracking-tight">Contracts</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {list.length} contract{list.length === 1 ? "" : "s"} you participate in.
        </p>
      </div>

      {list.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            You don&apos;t have any contracts yet. They&apos;ll appear here once you hire someone (as a buyer) or get hired (as an employee).
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {list.map((c) => {
            const buyer = userById.get(c.buyer_id);
            const employee = userById.get(c.employee_id);
            const task = taskById.get(c.task_post_id);
            const cat = catById.get(c.category_id);
            const ws = wsByContractId.get(c.id);
            const title = task?.title ?? cat?.name ?? "Contract";
            const role = c.buyer_id === user.id ? "Buyer" : "Employee";
            return (
              <Card key={c.id} className="transition-colors hover:border-primary/40">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                      <span className="text-base font-semibold">{(cat?.name ?? "?")[0]?.toUpperCase()}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="truncate font-display text-base font-semibold">{title}</h3>
                        <Badge variant="outline" className="text-[10px]">{c.status}</Badge>
                        <Badge variant="secondary" className="text-[10px]">You are: {role}</Badge>
                        {ws?.escrow_funded && (
                          <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-sky-700 text-[10px]">
                            {formatINR(Math.round((ws.escrow_amount_paise ?? 0) / 100))} in escrow
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span>Buyer: <strong className="text-foreground">{buyer?.full_name ?? "—"}</strong></span>
                        <span>·</span>
                        <span>Employee: <strong className="text-foreground">{employee?.full_name ?? "—"}</strong></span>
                        {c.started_at && (
                          <>
                            <span>·</span>
                            <span>started {timeAgo(c.started_at)}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold">{formatINR(Math.round((c.agreed_price ?? 0) / 100))}</div>
                      <div className="text-[10px] text-muted-foreground">agreed price</div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/dashboard/contracts/${c.id}`}>
                        Open contract <ArrowRight className="h-3 w-3" />
                      </Link>
                    </Button>
                    {ws?.id && (
                      <Button asChild size="sm" variant="default">
                        <Link href={`/dashboard/workspaces/${encodeWorkspaceSlug(title, ws.id)}`}>
                          <FolderKanban className="h-3 w-3" />
                          Open workspace
                        </Link>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
    </ContractsRealtimeWrapper>
  );
}
