import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadContractBundle } from "@/lib/contract-bundle";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { FolderKanban, FileText, ArrowRight } from "lucide-react";
import { isUuid, decodeWorkspaceSlug } from "@/lib/workspace-slug";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function WorkspaceById({ params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect(`/auth/signin?next=/dashboard/workspaces/${params.id}`);

  let workspaceId: string;

  if (isUuid(params.id)) {
    workspaceId = params.id;
  } else {
    const parsed = decodeWorkspaceSlug(params.id);
    if (!parsed) notFound();
    // Look up workspace by last-8-chars of ID (the slug suffix).
    // PostgREST doesn't support type-cast filters like id::text ILIKE,
    // so we fetch the user's workspace IDs and filter in JS.
    const { data: userWs } = await sb
      .from("workspaces")
      .select("id")
      .or(`buyer_id.eq.${user.id},employee_id.eq.${user.id}`);
    const match = (userWs ?? []).find(
      (w: any) => w.id.slice(-8) === parsed.shortId
    );
    if (!match) notFound();
    workspaceId = match.id;
  }

  const { data: ws } = await sb
    .from("workspaces")
    .select("id, contract_id, buyer_id, employee_id")
    .eq("id", workspaceId)
    .maybeSingle();

  let contractId: string;
  if (ws) {
    if (user.id !== (ws as any).buyer_id && user.id !== (ws as any).employee_id) {
      redirect("/dashboard/workspaces");
    }
    contractId = (ws as any).contract_id;
  } else {
    const { data: c } = await sb
      .from("contracts")
      .select("id, buyer_id, employee_id")
      .eq("id", params.id)
      .maybeSingle();
    if (c && (user.id === (c as any).buyer_id || user.id === (c as any).employee_id)) {
      redirect(`/dashboard/contracts/${params.id}`);
    }
    notFound();
  }

  const bundle = await loadContractBundle(contractId);
  if (bundle.error || !bundle.workspace) {
    return (
      <div className="container max-w-2xl py-12 text-center">
        <FolderKanban className="mx-auto h-12 w-12 text-muted-foreground" />
        <h1 className="mt-4 font-display text-xl font-semibold">Workspace not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {bundle.error ?? "This workspace isn&apos;t available. Try refreshing."}
        </p>
        <Button asChild className="mt-4"><Link href="/dashboard/workspaces">Back to workspaces</Link></Button>
      </div>
    );
  }

  const isBuyer = user.id === bundle.contract.buyer_id;
  const me = isBuyer ? bundle.buyer : bundle.employee;
  const counterparty = isBuyer ? bundle.employee : bundle.buyer;
  const task = bundle.task as any;

  const myAck = isBuyer ? bundle.buyerContract : bundle.employeeContract;
  const needsSigning = !myAck && bundle.workspace.status !== "completed" && bundle.workspace.status !== "cancelled";

  if (needsSigning) {
    return (
      <div className="container max-w-lg py-12">
        <Card className="border-amber-500/30">
          <CardHeader className="text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber-500/10">
              <FileText className="h-7 w-7 text-amber-600" />
            </div>
            <CardTitle className="mt-2 text-xl">Sign the contract first</CardTitle>
            <CardDescription>
              You need to sign the contract before accessing the workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <Button asChild size="lg" className="w-full max-w-xs">
              <Link href={`/dashboard/contracts/${bundle.contract.id}`}>
                Go to contract <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/contracts">Back to all contracts</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <WorkspaceShell
      workspace={{
        id: bundle.workspace.id,
        contract_id: bundle.workspace.contract_id,
        buyer_id: bundle.workspace.buyer_id,
        employee_id: bundle.workspace.employee_id,
        status: bundle.workspace.status,
        escrow_funded: bundle.workspace.escrow_funded,
        escrow_amount_paise: bundle.workspace.escrow_amount_paise,
        chat_locked_at: bundle.workspace.chat_locked_at,
        freeze_reason: bundle.workspace.freeze_reason,
        completed_at: bundle.workspace.completed_at,
        delivered_at: bundle.workspace.delivered_at,
        funded_at: bundle.workspace.funded_at,
        previous_workspace_id: bundle.workspace.previous_workspace_id,
      }}
      contract={{
        id: bundle.contract.id,
        agreed_price: bundle.contract.agreed_price,
        status: bundle.contract.status,
        incentive_earned: !!bundle.contract.incentive_earned,
        incentive_paid_at: bundle.contract.incentive_paid_at,
      }}
      task={{
        id: task?.id ?? "",
        title: task?.title ?? "Task",
        pricing_model: task?.pricing_model ?? bundle.contract.pricing_model ?? "fixed",
        incentive_condition_type: task?.incentive_condition_type ?? bundle.contract.incentive_condition_type ?? null,
        incentive_threshold: task?.incentive_threshold ?? bundle.contract.incentive_threshold ?? null,
        incentive_amount_paise: task?.incentive_amount_paise ?? bundle.contract.incentive_amount_paise ?? null,
      }}
      brief={task?.brief ?? null}
      counterparty={{
        id: counterparty?.id ?? "",
        full_name: counterparty?.full_name ?? null,
        avatar_url: counterparty?.avatar_url ?? null,
      }}
      me={{
        id: me?.id ?? user.id,
        full_name: me?.full_name ?? null,
        avatar_url: me?.avatar_url ?? null,
      }}
      currentUserRole={isBuyer ? "buyer" : "employee"}
      initialChecklist={bundle.checklist.map((c) => ({
        id: c.id,
        brief_item_key: c.brief_item_key,
        description: c.description,
        sort_order: c.sort_order,
        status: c.status,
        buyer_comment: c.buyer_comment,
        employee_response: c.employee_response,
        employee_evidence_url: c.employee_evidence_url,
        disputed: c.disputed,
      }))}
    />
  );
}
