import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** POST /api/applications/offer/[id]/respond  — employee accepts or declines. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const response = String(body.response ?? "");
  if (!["accepted", "declined"].includes(response)) {
    return NextResponse.json({ error: "response must be 'accepted' or 'declined'" }, { status: 400 });
  }

  // Guard: prevent re-creating a contract for the same task_post_id
  if (response === "accepted") {
    const { data: offer } = await sb
      .from("application_offers")
      .select("application_id")
      .eq("id", params.id)
      .maybeSingle();
    if (offer) {
      const { data: app } = await sb
        .from("task_applications")
        .select("task_id, employee_id")
        .eq("id", (offer as any).application_id)
        .maybeSingle();
      if (app) {
        const { count } = await sb
          .from("contracts")
          .select("id", { count: "exact", head: true })
          .eq("task_post_id", (app as any).task_id)
          .eq("employee_id", (app as any).employee_id)
          .in("status", ["active", "pending_acceptance", "completed", "delivered", "disputed"]);
        if (count && count > 0) {
          return NextResponse.json({
            error: "This task already has a contract. Cannot create another.",
          }, { status: 409 });
        }
      }
    }
  }

  const { data, error } = await sb.rpc("respond_to_offer" as any, {
    p_offer_id: params.id,
    p_response: response,
  } as any);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.ok === false) {
    return NextResponse.json({ error: data?.error || "Not allowed" }, { status: 400 });
  }
  return NextResponse.json(data);
}
