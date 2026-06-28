import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PointsRewardsView } from "@/components/points/points-rewards-view";

export const dynamic = "force-dynamic";

export default async function PointsPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/dashboard/points");

  const [{ data: lp }, { data: ledger }] = await Promise.all([
    sb.from("loyalty_points").select("*").eq("employee_id", user.id).maybeSingle(),
    sb.from("points_ledger").select("id, change_amount, reason, related_contract_id, created_at").eq("employee_id", user.id).order("created_at", { ascending: false }).limit(40),
  ]);

  return (
    <PointsRewardsView
      initialBalance={(lp as any)?.points_balance ?? 0}
      initialLifetime={(lp as any)?.lifetime_points_earned ?? 0}
      initialLedger={(ledger ?? []) as any[]}
    />
  );
}
