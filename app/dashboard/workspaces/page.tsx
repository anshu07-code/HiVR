import { createClient } from "@/lib/supabase/server";
import { WorkspacesListClient } from "@/components/dashboard/workspaces-list-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type WorkspaceRow = {
  id: string;
  status: string;
  escrow_amount_paise: number;
  escrow_funded: boolean;
  last_message_at: string | null;
  updated_at: string;
  completed_at: string | null;
  contract_id: string;
  buyer_id: string;
  employee_id: string;
  created_at: string;
  title: string;
  buyer_name: string | null;
  employee_name: string | null;
};

export default async function WorkspacesList() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();

  if (!user) {
    return (
      <div className="container max-w-5xl py-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Workspaces</h1>
        <p className="mt-2 text-sm text-muted-foreground">Sign in to view your workspaces.</p>
      </div>
    );
  }

  const [
    { data: workspaces },
    { data: profiles },
    { data: contracts },
  ] = await Promise.all([
    sb
      .from("workspaces")
      .select("id, status, escrow_amount_paise, escrow_funded, last_message_at, updated_at, completed_at, contract_id, buyer_id, employee_id, created_at")
      .or(`buyer_id.eq.${user.id},employee_id.eq.${user.id}`)
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(100),
    sb.from("users").select("id, full_name, email"),
    sb.from("contracts").select("id, task_post_id, agreed_price, status"),
  ]);

  const userById: Record<string, { full_name: string | null; email: string | null }> = {};
  for (const u of (profiles ?? []) as any[]) userById[u.id] = u;

  const myContractIds = new Set((workspaces ?? []).map((w: any) => w.contract_id).filter(Boolean));
  const myContracts = (contracts ?? []).filter((c: any) => myContractIds.has(c.id));
  const taskIds = Array.from(new Set(myContracts.map((c: any) => c.task_post_id).filter(Boolean))) as string[];

  const { data: tasks } = taskIds.length > 0
    ? await sb.from("task_posts").select("id, title, status").in("id", taskIds)
    : { data: [] as any[] };

  const taskById: Record<string, any> = {};
  for (const t of tasks ?? []) taskById[(t as any).id] = t;

  const contractById: Record<string, any> = {};
  for (const c of contracts ?? []) contractById[(c as any).id] = c;

  const initialList: WorkspaceRow[] = (workspaces ?? []).map((w: any) => {
    const contract = contractById[w.contract_id];
    const task = contract ? taskById[contract.task_post_id] : null;
    const buyer = userById[w.buyer_id];
    const employee = userById[w.employee_id];
    return {
      id: w.id,
      status: w.status,
      escrow_amount_paise: w.escrow_amount_paise,
      escrow_funded: w.escrow_funded,
      last_message_at: w.last_message_at,
      updated_at: w.updated_at,
      completed_at: w.completed_at,
      contract_id: w.contract_id,
      buyer_id: w.buyer_id,
      employee_id: w.employee_id,
      created_at: w.created_at,
      title: task?.title ?? "Workspace",
      buyer_name: buyer?.full_name ?? null,
      employee_name: employee?.full_name ?? null,
    };
  });

  return <WorkspacesListClient initialList={initialList} currentUserId={user.id} />;
}
