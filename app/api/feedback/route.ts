import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const { message, page } = await req.json();
  if (!message) {
    return NextResponse.json({ error: "Missing message" }, { status: 400 });
  }

  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();

  await sb.from("user_feedback").insert({
    user_id: user?.id ?? null,
    message: message.slice(0, 2000),
    page: page?.slice(0, 500) ?? null,
  });

  return NextResponse.json({ ok: true });
}
