import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/points/redeem
 *
 * Redeem loyalty points for a reward.
 *
 *   Body: { rewardId: string, cost: number }
 *
 * The actual application of the reward (e.g. profile boost
 * activation, fee discount record, leaderboard flag) is logged as a
 * points_ledger row with negative `change_amount` and reason
 * matching the reward. Other side-effects (e.g. setting
 * `profile_boost_until` on the user) are handled here for the small
 * subset of rewards that map to a real flag.
 *
 * Cost must match the catalog exactly. The catalog lives in the
 * client (`components/points/points-rewards-view.tsx`); for
 * production this should be moved to a server-side source of
 * truth. For now we trust the cost sent by the client and re-check
 * that the user has enough balance.
 */
const REWARD_CATALOG: Record<string, { cost: number; reason: string; message: string; apply?: (admin: any, userId: string) => Promise<void> }> = {
  boost_24h: {
    cost: 200,
    reason: "boost_redeemed",
    message: "Profile boost activated for 24 hours. You'll appear at the top of Find People.",
    apply: async (admin, userId) => {
      const until = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      await admin.from("users").update({ profile_boost_until: until }).eq("id", userId);
    },
  },
  boost_7d: {
    cost: 1000,
    reason: "boost_redeemed",
    message: "Profile boost activated for 7 days. Top-of-feed placement is yours.",
    apply: async (admin, userId) => {
      const until = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
      await admin.from("users").update({ profile_boost_until: until }).eq("id", userId);
    },
  },
  fee_discount_5: {
    cost: 500,
    reason: "fee_discount",
    message: "5% platform-fee discount unlocked for your next 3 contracts. HiVR fee drops from 20% to 15%.",
    apply: async (admin, userId) => {
      await admin.from("users").update({
        fee_discount_5_remaining: 3,
      }).eq("id", userId);
    },
  },
  fee_discount_15: {
    cost: 1500,
    reason: "fee_discount",
    message: "15% platform-fee discount unlocked for your next 5 contracts. HiVR fee drops from 20% to 5%.",
    apply: async (admin, userId) => {
      await admin.from("users").update({
        fee_discount_15_remaining: 5,
      }).eq("id", userId);
    },
  },
  instant_match: {
    cost: 800,
    reason: "boost_redeemed",
    message: "Instant Hire priority active for 30 days. You'll surface first in Smart Match.",
    apply: async (admin, userId) => {
      const until = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
      await admin.from("users").update({ instant_match_priority_until: until }).eq("id", userId);
    },
  },
  tier_boost: {
    cost: 3000,
    reason: "tier_upgrade",
    message: "Top-Rated badge unlocked for 90 days. Your public profile will show 'Top-Rated' regardless of current tier.",
    apply: async (admin, userId) => {
      const until = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString();
      await admin.from("employee_profiles").update({ tier_boost_top_rated_until: until }).eq("user_id", userId);
    },
  },
  tier_b_skip: {
    cost: 5000,
    reason: "tier_upgrade",
    message: "Tier B interview skip unlocked. Apply to your next Tier B application.",
    apply: async (admin, userId) => {
      await admin.from("users").update({ tier_b_skip_available: true }).eq("id", userId);
    },
  },
  leaderboard: {
    cost: 600,
    reason: "boost_redeemed",
    message: "Featured on the Top Earners leaderboard for 7 days.",
    apply: async (admin, userId) => {
      const until = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
      await admin.from("employee_profiles").update({ leaderboard_featured_until: until }).eq("user_id", userId);
    },
  },
};

export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const rewardId = String(body.rewardId ?? "");
  const clientCost = Number(body.cost ?? 0);
  if (!rewardId) return NextResponse.json({ ok: false, error: "rewardId required" }, { status: 400 });

  const reward = REWARD_CATALOG[rewardId];
  if (!reward) return NextResponse.json({ ok: false, error: "Unknown reward" }, { status: 400 });
  if (clientCost !== reward.cost) {
    return NextResponse.json({ ok: false, error: "Cost mismatch" }, { status: 400 });
  }

  const admin = createAdminClient();
  // 1. Lock + read the balance
  const { data: lp, error: lpErr } = await admin
    .from("loyalty_points")
    .select("points_balance")
    .eq("employee_id", user.id)
    .maybeSingle();
  if (lpErr) return NextResponse.json({ ok: false, error: lpErr.message }, { status: 500 });
  const balance = (lp as any)?.points_balance ?? 0;
  if (balance < reward.cost) {
    return NextResponse.json({ ok: false, error: "Insufficient points" }, { status: 400 });
  }

  // 2. Insert the ledger row (trigger updates loyalty_points.balance)
  const { error: ledgerErr } = await admin.from("points_ledger").insert({
    employee_id: user.id,
    change_amount: -reward.cost,
    reason: reward.reason,
  });
  if (ledgerErr) return NextResponse.json({ ok: false, error: ledgerErr.message }, { status: 500 });

  // 3. Apply the side-effect
  try {
    await reward.apply?.(admin, user.id);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[points/redeem] side-effect failed:", e);
  }

  return NextResponse.json({ ok: true, message: reward.message, cost: reward.cost });
}
