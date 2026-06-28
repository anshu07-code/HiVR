import { NextResponse } from "next/server";
import { improveTaskDescription } from "@/lib/ai";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const { draft, category } = (await req.json()) as { draft?: string; category?: string };
    if (!draft || !category) return NextResponse.json({ error: "missing fields" }, { status: 400 });
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const improved = await improveTaskDescription(draft, category);
    return NextResponse.json({ improved });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
