import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { formatPaise } from "@/lib/utils";

export async function POST(req: NextRequest) {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const userName = user.user_metadata?.full_name || user.email || "A buyer";

    const body = await req.json() as {
      gig_id?: string;
      employee_id?: string;
      action: "direct" | "negotiate";
      proposed_price?: number;
      requirements?: string;
      expected_days?: number;
    };

    if (!body.gig_id || !body.employee_id) {
      return NextResponse.json({ error: "gig_id and employee_id required" }, { status: 400 });
    }
    if (body.employee_id === user.id) {
      return NextResponse.json({ error: "You cannot hire yourself" }, { status: 400 });
    }

    // Verify gig exists and is active
    const { data: gig } = await sb
      .from("gigs")
      .select("id, title, employee_id, price, package_basic_price, category_id, employee_id")
      .eq("id", body.gig_id)
      .eq("status", "active")
      .single();
    if (!gig) return NextResponse.json({ error: "gig not found" }, { status: 404 });

    const listedPrice = (gig as any).price || (gig as any).package_basic_price || 0;
    const price = body.proposed_price || listedPrice;

    if (body.action === "negotiate") {
      const minPrice = Math.round(listedPrice * 0.8);
      if (price > listedPrice || price < minPrice) {
        return NextResponse.json({
          error: `Price must be between ${formatPaise(minPrice)} and ${formatPaise(listedPrice)}`,
        }, { status: 400 });
      }
    }

    // Use regular client — RLS allows insert because buyer_id = current user.
    // Notification RPC is also granted to authenticated role.

    if (body.action === "direct") {
      const { data: offer, error: oErr } = await sb.from("negotiation_offers").insert({
        task_post_id: null,
        gig_id: body.gig_id,
        gig_requirements: body.requirements || null,
        employee_id: body.employee_id,
        buyer_id: user.id,
        offer_type: "instant_hire_pushback",
        offer_type_new: "gig_direct",
        proposed_price: price,
        comment: (gig as any).title,
        created_by: user.id,
        status: "pending",
      } as any).select().single();
      if (oErr) throw oErr;

      // Notify the employee
      await (sb.rpc as any)("create_notification", {
        p_user_id: body.employee_id,
        p_type: "offer",
        p_title: "New direct hire offer!",
        p_body: `${userName} wants to hire you for "${(gig as any).title}" — ${formatPaise(price)}`,
        p_link: "/dashboard/job-offers",
      });

      return NextResponse.json({
        offer_id: (offer as any).id,
        action: "direct",
        gig_title: (gig as any).title,
        price,
      });
    } else {
      // Start Negotiation — create negotiation_offer with first round
      const minPrice = Math.round(listedPrice * 0.8);

      const roundComment = body.expected_days
        ? JSON.stringify({ text: body.requirements || "Let's negotiate!", expected_days: body.expected_days })
        : (body.requirements || "Let's negotiate!");

      const { data: offer, error: oErr } = await sb.from("negotiation_offers").insert({
        task_post_id: null,
        gig_id: body.gig_id,
        gig_requirements: body.requirements || null,
        employee_id: body.employee_id,
        buyer_id: user.id,
        offer_type: "custom_scope_negotiation",
        offer_type_new: "gig_negotiation",
        proposed_price: price,
        comment: (gig as any).title,
        created_by: user.id,
        status: "pending",
      } as any).select().single();
      if (oErr) throw oErr;

      // Create first round with proposed price and expected days (RLS allows buyer to insert)
      await sb.from("negotiation_rounds").insert({
        negotiation_id: (offer as any).id,
        round_number: 1,
        proposed_by: "buyer",
        proposed_price: price,
        comment: roundComment,
      } as any);

      // Notify the employee
      await (sb.rpc as any)("create_notification", {
        p_user_id: body.employee_id,
        p_type: "offer",
        p_title: "New negotiation request",
        p_body: `${userName} wants to negotiate for "${(gig as any).title}" — ₹${Number(price).toLocaleString("en-IN")}`,
        p_link: "/dashboard/job-offers",
      });

      return NextResponse.json({
        negotiation_id: (offer as any).id,
        action: "negotiate",
        listed_price: listedPrice,
        proposed_price: price,
        max_rounds: 4,
        current_round: 1,
      });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
