import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadContractBundle } from "@/lib/contract-bundle";
import { ContractView } from "@/components/contract/contract-view";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { FolderKanban } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ContractDocumentPage({ params }: { params: { id: string } }) {
  // The workspace page still redirects here for backward-compat, so check
  // first that this id really is a contract (not a workspace id).
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect(`/auth/signin?next=/dashboard/contracts/${params.id}`);

  // If the id belongs to a workspace (e.g. /dashboard/contracts/<workspace-id>
  // was opened via a stale link), bounce the user to the proper workspace
  // route.
  const { data: wsCheck } = await sb
    .from("workspaces")
    .select("id, contract_id, buyer_id, employee_id")
    .eq("id", params.id)
    .maybeSingle();
  if (wsCheck && (user.id === (wsCheck as any).buyer_id || user.id === (wsCheck as any).employee_id)) {
    redirect(`/dashboard/workspaces/${params.id}`);
  }

  const bundle = await loadContractBundle(params.id);
  if (bundle.error) {
    if (bundle.error === "Not signed in") redirect(`/auth/signin?next=/dashboard/contracts/${params.id}`);
    if (bundle.error === "Not a party to this contract") redirect("/dashboard/contracts");
    if (bundle.error === "Contract not found") notFound();
    return (
      <div className="container max-w-2xl py-12 text-center">
        <FolderKanban className="mx-auto h-12 w-12 text-muted-foreground" />
        <h1 className="mt-4 font-display text-xl font-semibold">Couldn&apos;t open contract</h1>
        <p className="mt-2 text-sm text-muted-foreground">{bundle.error}</p>
        <Button asChild className="mt-4"><Link href="/dashboard/contracts">Back to contracts</Link></Button>
      </div>
    );
  }

  const isBuyer = user.id === bundle.contract.buyer_id;

  return (
    <ContractView
      contract={bundle.contract}
      task={bundle.task}
      workspace={bundle.workspace}
      checklist={bundle.checklist}
      buyer={bundle.buyer}
      employee={bundle.employee}
      buyerAck={bundle.buyerContract}
      employeeAck={bundle.employeeContract}
      currentUserRole={isBuyer ? "buyer" : "employee"}
    />
  );
}
