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

  const [workExp, socialLinks, documents] = await Promise.all([
    admin.from("anonymous_work_experience")
      .select("*, employee_profiles!inner(is_anonymous)")
      .eq("verification_status", status)
      .order("created_at", { ascending: false } as any)
      .limit(50) as any,

    admin.from("anonymous_social_links")
      .select("*, employee_profiles!inner(is_anonymous)")
      .eq("verification_status", status)
      .order("created_at", { ascending: false } as any)
      .limit(50) as any,

    admin.from("anonymous_documents")
      .select("*, employee_profiles!inner(is_anonymous)")
      .eq("verification_status", status)
      .order("created_at", { ascending: false } as any)
      .limit(50) as any,
  ]);

  return NextResponse.json({
    ok: true,
    workExperience: workExp ?? [],
    socialLinks: socialLinks ?? [],
    documents: documents ?? [],
  });
}
