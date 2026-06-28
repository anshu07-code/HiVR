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
  const { data, error } = await sb.rpc("respond_to_offer" as any, {
    p_offer_id: params.id,
    p_response: response,
  } as any);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // data is now a jsonb { ok, status, contract_id?, ... }
  if (!data || data.ok === false) {
    return NextResponse.json({ error: data?.error || "Not allowed" }, { status: 400 });
  }
  return NextResponse.json(data);
}
