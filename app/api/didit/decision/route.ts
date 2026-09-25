import { NextResponse } from "next/server";
import { getSessionDecision } from "@/lib/didit/session";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const url = new URL(req.url);
    const sessionId = url.searchParams.get("session_id");
    if (!sessionId) {
      return NextResponse.json({ error: "session_id query param required" }, { status: 400 });
    }

    const decision = await getSessionDecision(sessionId);
    return NextResponse.json(decision);
  } catch (e: any) {
    const status = e.status || 500;
    return NextResponse.json(
      { error: e.message || "Failed to retrieve Didit decision" },
      { status },
    );
  }
}
