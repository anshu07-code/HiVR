import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { formatPaise } from "@/lib/utils";

const MAX_ROUNDS = 4;

export async function POST(req: NextRequest) {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await req.json() as {
      negotiation_id?: string;
      action: "accept" | "counter" | "decline";
      proposed_price?: number;
      comment?: string;
    };

    if (!body.negotiation_id || !body.action) {
      return NextResponse.json({ error: "negotiation_id and action required" }, { status: 400 });
    }

    const { data: offer } = await sb
      .from("negotiation_offers")
      .select("*")
      .eq("id", body.negotiation_id)
      .single();
    if (!offer) return NextResponse.json({ error: "negotiation not found" }, { status: 404 });

    const o = offer as any;

    // Check expiry (24 hours)
    const createdAt = new Date(o.created_at);
    const now = new Date();
    if (o.status === "pending" && (now.getTime() - createdAt.getTime()) > 24 * 60 * 60 * 1000) {
      await (sb.from("negotiation_offers") as any).update({ status: "expired" }).eq("id", o.id).select().single();
      return NextResponse.json({ error: "This offer has expired (24h limit)" }, { status: 400 });
    }

    if (body.action === "accept") {
      // Look up the gig to get category_id (falls back to employee rates for people-direct)
      let categoryId: string | null = null;
      if (o.gig_id) {
        const { data: gig } = await sb.from("gigs").select("category_id").eq("id", o.gig_id).single();
        if (gig) categoryId = (gig as any).category_id;
      }
      // Fallback: use the first active category from employee_standing_rates
      if (!categoryId) {
        const { data: rate } = await sb.from("employee_standing_rates")
          .select("category_id")
          .eq("user_id", o.employee_id)
          .limit(1)
          .maybeSingle();
        if (rate) categoryId = (rate as any).category_id;
      }

      const { data: contract, error: cErr } = await (sb.from("contracts") as any).insert({
        buyer_id: o.buyer_id,
        employee_id: o.employee_id,
        gig_id: o.gig_id || null,
        task_post_id: o.task_post_id || null,
        category_id: categoryId,
        tier: "micro_task",
        pricing_model: "fixed",
        agreed_price: o.proposed_price,
        platform_fee_pct: 0.10,
        buyer_requirements: o.gig_requirements || null,
      }).select().single();
      if (cErr) throw cErr;

      // Update negotiation status + link to contract
      const { error: accErr } = await (sb.from("negotiation_offers") as any).update({
        status: "accepted",
        contract_id: (contract as any).id,
      }).eq("id", o.id).select().single();
      if (accErr) throw new Error(`Failed to accept offer: ${accErr.message}`);

      // Fetch the auto-created workspace
      let workspaceId: string | null = null;
      const { data: ws } = await sb.from("workspaces")
        .select("id")
        .eq("contract_id", (contract as any).id)
        .maybeSingle();
      if (ws) workspaceId = (ws as any).id;

      // Notify the other party
      const notifyUser = user.id === o.buyer_id ? o.employee_id : o.buyer_id;
      try {
        await (sb.rpc as any)("create_notification", {
          p_user_id: notifyUser,
          p_type: "hired",
          p_title: "Offer accepted!",
          p_body: `The offer has been accepted and a contract has been created.`,
          p_link: `/dashboard/contracts/${(contract as any).id}`,
        });
      } catch {}

      return NextResponse.json({
        contract_id: (contract as any).id,
        workspace_id: workspaceId,
        action: "accepted",
      });
    }

    if (body.action === "decline") {
      const { error: decErr } = await (sb.from("negotiation_offers") as any).update({ status: "declined" }).eq("id", o.id).select().single();
      if (decErr) throw new Error(`Failed to decline offer: ${decErr.message}`);
      return NextResponse.json({ action: "declined" });
    }

    if (body.action === "counter") {
      if (!body.proposed_price) {
        return NextResponse.json({ error: "proposed_price required for counter" }, { status: 400 });
      }

      // Validate price range: for gig negotiations, use the gig's listed price;
      // otherwise fall back to the first round's proposed price
      let refPricePaise: number | null = null;
      if (o.gig_id) {
        const { data: gig } = await sb.from("gigs").select("price, package_basic_price").eq("id", o.gig_id).single();
        if (gig) refPricePaise = (gig as any).price || (gig as any).package_basic_price;
      }
      if (!refPricePaise) {
        const { data: firstRound } = await sb.from("negotiation_rounds")
          .select("proposed_price")
          .eq("negotiation_id", o.id)
          .eq("round_number", 1)
          .single();
        if (firstRound) refPricePaise = (firstRound as any).proposed_price;
      }
      if (refPricePaise) {
        const refPrice = refPricePaise / 100;
        const minPrice = Math.round(refPrice * 0.8);
        if (body.proposed_price > refPrice || body.proposed_price < minPrice) {
          return NextResponse.json({
            error: `Price must be between ${formatPaise(minPrice * 100)} and ${formatPaise(refPrice * 100)}`,
          }, { status: 400 });
        }
      }

      // Check round limit (MAX_ROUNDS = 4, 2 per side)
      const { count } = await sb
        .from("negotiation_rounds")
        .select("id", { count: "exact", head: true })
        .eq("negotiation_id", o.id);
      if (count && count >= MAX_ROUNDS) {
        return NextResponse.json({ error: `Maximum ${MAX_ROUNDS} negotiation rounds reached` }, { status: 400 });
      }

      const nextRound = (count || 0) + 1;
      const isEmployee = user.id === o.employee_id;
      const pricePaise = Math.round(body.proposed_price * 100);

      // Insert the new round (both parties can now insert via the updated RLS policy)
      const { error: roundErr } = await (sb.from("negotiation_rounds") as any).insert({
        negotiation_id: o.id,
        round_number: nextRound,
        proposed_by: isEmployee ? "employee" : "buyer",
        proposed_price: pricePaise,
        comment: body.comment || null,
      }).select().single();
      if (roundErr) throw new Error(`Failed to create round: ${roundErr.message}`);

      // Update the offer with the new proposed price (party UPDATE RLS now exists)
      const { error: offErr } = await (sb.from("negotiation_offers") as any).update({
        proposed_price: pricePaise,
        status: "countered",
        comment: body.comment || null,
      }).eq("id", o.id).select().single();
      if (offErr) throw new Error(`Failed to update offer: ${offErr.message}`);

      // Notify the other party
      const notifyUserId = isEmployee ? o.buyer_id : o.employee_id;
      try {
        await (sb.rpc as any)("create_notification", {
          p_user_id: notifyUserId,
          p_type: "offer",
          p_title: "Counter offer received",
          p_body: `${isEmployee ? "The employee" : "The buyer"} has sent a counter offer.`,
          p_link: "/dashboard/job-offers",
        });
      } catch {}

      return NextResponse.json({
        action: "countered",
        round: nextRound,
        max_rounds: MAX_ROUNDS,
        rounds_left: MAX_ROUNDS - nextRound,
        price_paise: pricePaise,
      });
    }

    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
