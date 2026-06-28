import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const { theme } = (await req.json()) as { theme?: "light" | "dark" | "eye_shield" | "automatic" };
    if (!theme) return NextResponse.json({ ok: false }, { status: 400 });
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ ok: true }); // silently ignore for logged-out
    await sb.from("users").update({ theme_preference: theme }).eq("id", user.id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
