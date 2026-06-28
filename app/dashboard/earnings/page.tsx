import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PaymentsHistory } from "@/components/payments/payments-history";

export const dynamic = "force-dynamic";
export const metadata = { title: "Earnings & Payouts — HiVR" };

export default async function EarningsPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/dashboard/earnings");

  const { data: me } = await sb
    .from("users")
    .select("roles, payout_method, upi_id, upi_provider_name, upi_verified_at, account_holder, account_last4, ifsc, bank_verified_at")
    .eq("id", user.id)
    .single();
  const roles: string[] = ((me as any)?.roles as string[]) ?? [];
  const isBuyer = roles.includes("buyer");
  const isEmployee = roles.includes("employee");
  const role: "buyer" | "employee" | "both" =
    isBuyer && isEmployee ? "both" : isBuyer ? "buyer" : "employee";

  const { data: payments } = await sb
    .from("payments")
    .select(`
      id, contract_id, milestone_id, amount, platform_fee_amount,
      razorpay_payment_id, status, escrow_released, created_at,
      contract:contracts!inner(
        id, status, agreed_price, started_at, completed_at,
        buyer_id, employee_id, category_id, task_post_id,
        task:task_posts(id, title, category_id),
        buyer:users!contracts_buyer_id_fkey(id, full_name, avatar_url),
        employee:users!contracts_employee_id_fkey(id, full_name, avatar_url)
      )
    `)
    .order("created_at", { ascending: false })
    .limit(500);

  const refunds = (payments ?? []).filter((p: any) => p.status === "refunded" || p.status === "disputed");

  const { data: wallet } = await sb
    .from("user_wallets")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: tips } = await sb
    .from("tips")
    .select("id, contract_id, from_user_id, to_user_id, amount, platform_cut_pct, paid_at, flagged_for_review")
    .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
    .order("paid_at", { ascending: false })
    .limit(100);

  let earningsData: any = null;
  if (isEmployee) {
    const { data: ep } = await sb
      .from("employee_profiles")
      .select("lifetime_earnings, current_month_earnings, available_for_withdrawal, pending_in_escrow, total_withdrawn, total_platform_fees, payouts_lifetime_count, payouts_pending_count, withdrawal_penalty_paise, withdrawals_this_month, last_withdrawal_at")
      .eq("user_id", user.id)
      .maybeSingle();
    earningsData = ep;
  }

  return (
    <PaymentsHistory
      userId={user.id}
      role={role}
      defaultTab="earnings"
      initialPayments={(payments ?? []) as any[]}
      initialRefunds={refunds as any[]}
      initialWallet={(wallet ?? null) as any}
      initialTips={(tips ?? []) as any[]}
      initialPayout={{
        method: (me as any)?.payout_method ?? null,
        upi_id: (me as any)?.upi_id ?? null,
        upi_provider_name: (me as any)?.upi_provider_name ?? null,
        upi_verified_at: (me as any)?.upi_verified_at ?? null,
        account_holder: (me as any)?.account_holder ?? null,
        account_last4: (me as any)?.account_last4 ?? null,
        ifsc: (me as any)?.ifsc ?? null,
        bank_verified_at: (me as any)?.bank_verified_at ?? null,
      }}
      initialEarnings={earningsData}
    />
  );
}
