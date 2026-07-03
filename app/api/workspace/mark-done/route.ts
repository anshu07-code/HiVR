import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notifications/helpers";
import { SecurityError, requireUuid, enforceRateLimit } from "@/lib/security";
import { encodeWorkspaceSlug } from "@/lib/workspace-slug";
import { formatPaise } from "@/lib/utils";

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
      .select("id, buyer_id, employee_id, contract_id")
      .eq("id", workspaceId)
      .maybeSingle();
    if (wsErr || !ws) {
      return NextResponse.json({ ok: false, error: "Workspace not found" }, { status: 404 });
    }
    const w = ws as any;
    if (w.buyer_id !== user.id && w.employee_id !== user.id) {
      return NextResponse.json({ ok: false, error: "Not a party to this workspace" }, { status: 403 });
    }
    if (!w.contract_id) {
      return NextResponse.json({ ok: false, error: "Workspace has no associated contract" }, { status: 400 });
    }

    // Mark workspace done via RPC. Migration 0127 moved the wallet
    // credit + payment status update + employee_profiles bump INTO
    // this function so the whole "complete contract" transaction is
    // atomic. The RPC now returns { wallet_credited_paise, has_razorpay,
    // employee_payout_paise, ... }.
    const { data: markResult, error: markErr } = await sb.rpc("mark_workspace_done" as any, {
      p_workspace_id: workspaceId,
    } as any);
    if (markErr) return NextResponse.json({ ok: false, error: markErr.message }, { status: 500 });
    const result = markResult as any;
    if (!result || result.ok === false) return NextResponse.json({ ok: false, error: result?.error ?? "Failed" }, { status: 400 });

    const employeeId = w.employee_id;
    const employeePayout = Number(result.employee_payout_paise ?? 0);
    const platformFee = Number(result.platform_fee_paise ?? 0);
    const awaitingWebhook = !!result.awaiting_webhook;

    // Migration 0133 split the credit: employee's wallet + HiVR Revenue.
    // For Razorpay-funded contracts the money is still in Razorpay's
    // escrow — both wallets get `pending_paise` (not withdrawable)
    // until the transfer.processed webhook fires. For wallet-funded
    // contracts both wallets get `balance_paise` immediately.
    if (awaitingWebhook) {
      await notify({
        userId: employeeId,
        kind: "payment_released",
        title: "Payment pending Razorpay release",
        body: `${formatPaise(employeePayout)} is pending Razorpay escrow release. Once it settles in HiVR's pool, you'll be able to withdraw it.`,
        link: `/dashboard/workspaces/${encodeWorkspaceSlug("workspace", workspaceId)}`,
      });
    } else {
      await notify({
        userId: employeeId,
        kind: "payment_released",
        title: "Payment released ✓",
        body: `${formatPaise(employeePayout)} has been credited to your wallet for the completed contract.`,
        link: `/dashboard/workspaces/${encodeWorkspaceSlug("workspace", workspaceId)}`,
      });
    }

    // Notify the closer (the user who clicked mark-done).
    await notify({
      userId: user.id,
      kind: "workspace_done",
      title: "Workspace completed ✓",
      body: awaitingWebhook
        ? `All vault files approved. Employee's ${formatPaise(employeePayout)} is pending Razorpay escrow release.`
        : "All vault files approved. Payment has been released to the employee.",
      link: `/dashboard/workspaces/${workspaceId}`,
    });

    // Force the dashboard to re-fetch. Without this, the page is stuck
    // on whatever the server saw at the last navigation. Realtime can
    // take a moment to deliver events (or might not fire in some edge
    // cases like payment-provider webhooks), so an explicit
    // revalidatePath is the belt-and-braces guarantee.
    revalidatePath("/dashboard", "layout");
    revalidatePath("/dashboard/contracts", "page");
    revalidatePath(`/dashboard/contracts/${w.contract_id}`, "page");
    revalidatePath("/dashboard/workspaces", "page");
    revalidatePath("/dashboard/payments", "page");
    revalidatePath("/dashboard/earnings", "page");

    return NextResponse.json({
      ok: true,
      employee_id: employeeId,
      employee_payout_paise: employeePayout,
      platform_fee_paise: platformFee,
      awaiting_webhook: awaitingWebhook,
    });
  } catch (e) {
    if (e instanceof SecurityError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
