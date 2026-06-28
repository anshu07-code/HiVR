import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notifications/helpers";
import { SecurityError, requireUuid, enforceRateLimit } from "@/lib/security";
import { encodeWorkspaceSlug } from "@/lib/workspace-slug";

export async function POST(req: NextRequest) {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    enforceRateLimit(`workspace_mark_done:${user.id}`, { max: 30, windowMs: 60_000 });

    const body = await req.json().catch(() => ({}));
    let workspaceId: string;
    try {
      workspaceId = requireUuid(body.workspaceId, "workspaceId");
    } catch (e) {
      if (e instanceof SecurityError) {
        return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
      }
      throw e;
    }

    // Confirm user is a party to the workspace.
    const { data: ws, error: wsErr } = await sb
      .from("workspaces")
      .select("id, buyer_id, employee_id")
      .eq("id", workspaceId)
      .maybeSingle();
    if (wsErr || !ws) {
      return NextResponse.json({ ok: false, error: "Workspace not found" }, { status: 404 });
    }
    const w = ws as any;
    if (w.buyer_id !== user.id && w.employee_id !== user.id) {
      return NextResponse.json({ ok: false, error: "Not a party to this workspace" }, { status: 403 });
    }

    // Mark workspace done via RPC (sets contract status = 'completed', release_at, etc.).
    const { data: markResult, error: markErr } = await sb.rpc("mark_workspace_done" as any, {
      p_workspace_id: workspaceId,
    } as any);
    if (markErr) return NextResponse.json({ ok: false, error: markErr.message }, { status: 500 });
    const result = markResult as any;
    if (!result || result.ok === false) return NextResponse.json({ ok: false, error: result?.error ?? "Failed" }, { status: 400 });

    // Immediately release escrow — credit the employee's wallet.
    const admin = createAdminClient();
    const employeeId = w.employee_id;

    // Fetch contract + payment info.
    const { data: contract } = await admin
      .from("contracts")
      .select("id, employee_payout_paise, agreed_price, payments(id, amount, platform_fee_amount, razorpay_payment_id, escrow_released)")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (contract) {
      const c = contract as any;
      let employeeWalletCreditPaise = 0;

      // Release all unreleased payments.
      const payments = c.payments ?? [];
      for (const p of payments) {
        if (!p.escrow_released) {
          await admin.from("payments").update({
            status: "released",
            escrow_released: true,
          }).eq("id", p.id);

          // Wallet-funded payments (no razorpay_payment_id) — credit the employee.
          if (!p.razorpay_payment_id) {
            employeeWalletCreditPaise += Math.max(
              0,
              Number(p.amount ?? 0) - Number(p.platform_fee_amount ?? 0)
            );
          }
        }
      }

      const employeePayout = Number(c.employee_payout_paise ?? employeeWalletCreditPaise ?? 0);
      if (employeePayout > 0) {
        await admin.rpc("wallet_credit" as any, {
          p_user_id: employeeId,
          p_amount_paise: employeePayout,
          p_kind: "escrow_release",
          p_description: `Payment released for contract ${c.id}`,
          p_ref_type: "workspace",
          p_ref_id: workspaceId,
          p_metadata: { trigger: "mark_done", workspace_id: workspaceId, contract_id: c.id },
        } as any);
      }

      // Notify the employee about the payment.
      await notify({
        userId: employeeId,
        kind: "payment_released",
        title: "Payment released ✓",
        body: `₹${(employeePayout / 100).toFixed(2)} has been credited to your wallet for the completed contract.`,
        link: `/dashboard/workspaces/${encodeWorkspaceSlug("workspace", workspaceId)}`,
      });
    }

    // Notify the closer (the user who clicked mark-done).
    await notify({
      userId: user.id,
      kind: "workspace_done",
      title: "Workspace completed ✓",
      body: "All vault files approved. Payment has been released to the employee.",
      link: `/dashboard/workspaces/${workspaceId}`,
    });

    return NextResponse.json({ ok: true, amount_credited_paise: contract ? Number((contract as any).employee_payout_paise ?? 0) : 0 });
  } catch (e) {
    if (e instanceof SecurityError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
