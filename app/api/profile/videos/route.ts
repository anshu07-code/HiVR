import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ ok: false, error: "Missing userId" }, { status: 400 });

  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("profile_videos")
    .select("id, storage_bucket, storage_path, thumbnail_path, caption, skill_category_id, duration_seconds, is_public, created_at, skill:skill_categories(name, slug, icon)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const videos = ((rows ?? []) as any[]).map((v) => ({
    ...v,
    skill: Array.isArray(v.skill) ? v.skill[0] ?? null : v.skill,
  }));

  return NextResponse.json({ ok: true, videos });
}
