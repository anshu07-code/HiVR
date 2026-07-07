"use server";
// Shared server-side loader for both /dashboard/contracts/[id] and
// /dashboard/workspaces/[id]. Returns the data needed to render either
// a contract document or the interactive workspace shell.

import { createClient } from "@/lib/supabase/server";

export type ContractViewData = {
  contract: any | null;
  task: any | null;
  contractCategory: any | null;
  workspace: any | null;
  checklist: any[];
  buyer: any | null;
  employee: any | null;
  buyerContract: any | null;
  employeeContract: any | null;
  error: string | null;
};

export async function loadContractBundle(contractId: string): Promise<ContractViewData> {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { contract: null, task: null, contractCategory: null, workspace: null, checklist: [], buyer: null, employee: null, buyerContract: null, employeeContract: null, error: "Not signed in" };

  const { data: c } = await sb
    .from("contracts")
    .select("*, buyer:users!contracts_buyer_id_fkey(id, full_name, avatar_url, email), employee:users!contracts_employee_id_fkey(id, full_name, avatar_url, email)")
    .eq("id", contractId)
    .single();
  if (!c) return { contract: null, task: null, contractCategory: null, workspace: null, checklist: [], buyer: null, employee: null, buyerContract: null, employeeContract: null, error: "Contract not found" };

  const isBuyer = user.id === (c as any).buyer_id;
  const isEmployee = user.id === (c as any).employee_id;
  if (!isBuyer && !isEmployee) return { contract: null, task: null, contractCategory: null, workspace: null, checklist: [], buyer: null, employee: null, buyerContract: null, employeeContract: null, error: "Not a party to this contract" };

  const { data: task } = await sb
    .from("task_posts")
    .select("id, title, description, pricing_model, budget_min, budget_max, estimated_hours, incentive_condition_type, incentive_threshold, incentive_amount_paise, brief, created_at, category_id, category:skill_categories(slug, name, icon, tier)")
    .eq("id", (c as any).task_post_id)
    .maybeSingle();

  // For contracts without a task (e.g. gig-based), look up the category directly
  let contractCategory: any = null;
  if (!task && (c as any).category_id) {
    const { data: cat } = await sb
      .from("skill_categories")
      .select("id, name, slug, icon, tier")
      .eq("id", (c as any).category_id)
      .maybeSingle();
    contractCategory = cat;
  }

  let workspace: any = null;
  const { data: workspaceData } = await sb
    .from("workspaces")
    .select("id, contract_id, buyer_id, employee_id, status, escrow_funded, escrow_amount_paise, chat_locked_at, freeze_reason, completed_at, delivered_at, funded_at, previous_workspace_id")
    .eq("contract_id", (c as any).id)
    .maybeSingle();
  workspace = workspaceData;
  if (!workspace) {
    // backfill: same logic as the original page
    const { data: prev } = await sb
      .from("workspaces")
      .select("id")
      .eq("buyer_id", (c as any).buyer_id)
      .eq("employee_id", (c as any).employee_id)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: created } = await sb
      .from("workspaces")
      .insert({
        contract_id: (c as any).id,
        buyer_id: (c as any).buyer_id,
        employee_id: (c as any).employee_id,
        status: "awaiting_funding",
        escrow_amount_paise: (c as any).agreed_price ?? 0,
        previous_workspace_id: (prev as any)?.id ?? null,
      })
      .select("id, contract_id, buyer_id, employee_id, status, escrow_funded, escrow_amount_paise, chat_locked_at, freeze_reason, completed_at, delivered_at, funded_at, previous_workspace_id")
      .single();
    workspace = created ?? null;
  }

  const { data: checklist } = await sb
    .from("delivery_checklist_items")
    .select("id, brief_item_key, description, sort_order, status, buyer_comment, employee_response, employee_evidence_url, disputed")
    .eq("contract_id", (c as any).id)
    .order("sort_order");

  // Optional signed countersign/acknowledgement rows (may not exist yet —
  // the loader returns nulls in that case so the document renders an
  // unsigned placeholder line.)
  let buyerContract: any = null, employeeContract: any = null;
  try {
    const { data: ack } = await sb
      .from("contract_acknowledgements")
      .select("party_role, signed_at, signature_name, ip_address")
      .eq("contract_id", (c as any).id);
    for (const r of (ack ?? []) as any[]) {
      if (r.party_role === "buyer")    buyerContract    = r;
      if (r.party_role === "employee") employeeContract = r;
    }
  } catch { /* table may not exist yet — silent */ }

  return {
    contract: c,
    task,
    contractCategory,
    workspace,
    checklist: (checklist ?? []) as any[],
    buyer: (c as any).buyer ?? null,
    employee: (c as any).employee ?? null,
    buyerContract,
    employeeContract,
    error: null,
  };
}
