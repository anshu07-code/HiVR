import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const contractId = String(body.contractId ?? "");
  const reason = String(body.reason ?? "");
  const evidence = Array.isArray(body.evidence) ? body.evidence : [];
  if (!contractId || reason.length < 10) {
    return NextResponse.json({ ok: false, error: "contractId and reason (min 10 chars) required" }, { status: 400 });
  }

  // Try the RPC first — it works for supported contract statuses
  const { data, error } = await (sb.rpc as any)("file_scope_mismatch_dispute", {
    p_contract_id: contractId,
    p_reason: reason,
    p_evidence: evidence,
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (data && data.ok === true) return NextResponse.json(data);

  // If the RPC returned ok:false (e.g. contract status not supported),
  // verify the user is the employee and create the dispute directly.
  const rpcError = data?.error ?? "RPC failed";

  const { data: contract } = await sb
    .from("contracts")
    .select("id, employee_id, buyer_id, status")
    .eq("id", contractId)
    .single();
  if (!contract) return NextResponse.json({ ok: false, error: "Contract not found" }, { status: 404 });
  if (contract.employee_id !== user.id) return NextResponse.json({ ok: false, error: "Not your contract" }, { status: 403 });

  // Pause the contract
  await sb.from("contracts").update({ status: "disputed" }).eq("id", contractId);

  const { data: dispute, error: insErr } = await sb
    .from("disputes")
    .insert({
      contract_id: contractId,
      raised_by: user.id,
      raised_by_role: "employee",
      reason,
      status: "open",
      dispute_type: "scope_mismatch",
      contract_status_at_raise: contract.status,
    })
    .select("id")
    .single();

  if (insErr || !dispute) {
    return NextResponse.json({ ok: false, error: insErr?.message ?? "Failed to create dispute" }, { status: 500 });
  }

  // Insert evidence rows
  if (evidence.length > 0) {
    const evidenceRows = evidence.map((e: any) => ({
      dispute_id: dispute.id,
      submitted_by: user.id,
      submitted_by_role: "employee",
      evidence_type: e.evidence_type ?? "text",
      content: e.content ?? "",
      file_url: e.file_url ?? null,
    }));
    await sb.from("dispute_evidence").insert(evidenceRows);
  }

  // Notify the buyer
  await (sb.rpc as any)("create_notification", {
    p_user_id: contract.buyer_id,
    p_type: "dispute",
    p_title: "Scope dispute opened",
    p_body: "The employee filed a scope-mismatch dispute. An admin will review shortly.",
    p_link: "/admin/disputes",
  }).catch(() => {});

  return NextResponse.json({ ok: true, dispute_id: dispute.id });
}
