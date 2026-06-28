import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser) {
    return NextResponse.json({ ok: false, error: "Not authorised" }, { status: 403 });
  }

  const admin = createAdminClient();
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "pending";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const perPage = 20;

  const query = admin
    .from("anonymous_requests")
    .select("*, employee_profiles!inner(user_id, is_anonymous)", { count: "exact" } as any);

  if (status === "pending") {
    query.eq("status", "pending");
  } else if (status === "approved") {
    query.eq("status", "approved");
  } else if (status === "rejected") {
    query.eq("status", "rejected");
  }

  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  const { data: requests, count, error } = await query
    .order("created_at", { ascending: false } as any)
    .range(from, to) as any;

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    requests: requests ?? [],
    total: count ?? 0,
    page,
    perPage,
  });
}
