import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await req.json() as { gig_id?: string; reason?: string; description?: string };

    if (!body.gig_id || !body.reason) {
      return NextResponse.json({ error: "gig_id and reason are required" }, { status: 400 });
    }

    const { error } = await sb.from("gig_reports").insert({
      gig_id: body.gig_id,
      reporter_id: user.id,
      reason: body.reason,
      description: body.description || "",
    } as any);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
