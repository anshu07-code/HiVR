import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/wallet
 *
 * Returns the current user's wallet balance, lifetime stats, and the
 * 20 most recent transactions. Auto-creates the wallet on first call.
 *
 * Real-time updates are handled client-side via Supabase realtime
 * subscription on wallet_transactions.
 */

export async function GET() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

  // Ensure wallet exists (the after-insert trigger on public.users
  // handles brand-new users; this covers existing users who pre-date
  // the migration).
  await sb.from("user_wallets").upsert({ user_id: user.id }, { onConflict: "user_id" });

  const [{ data: wallet }, { data: txs }] = await Promise.all([
    sb.from("user_wallets").select("*").eq("user_id", user.id).maybeSingle(),
    sb.from("wallet_transactions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return NextResponse.json({
    ok: true,
    wallet: wallet ?? { user_id: user.id, balance_paise: 0, lifetime_loaded_paise: 0, lifetime_spent_paise: 0, lifetime_received_paise: 0, is_frozen: false },
    transactions: txs ?? [],
  });
}
