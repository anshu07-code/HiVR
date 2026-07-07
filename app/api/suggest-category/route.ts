import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const { domain, subcategories } = await req.json();
  if (!domain || !subcategories) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();

  await sb.from("category_suggestions").insert({
    user_id: user?.id ?? null,
    domain: domain.slice(0, 200),
    subcategories: subcategories.slice(0, 2000),
  });

  return NextResponse.json({ ok: true });
}
