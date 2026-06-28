import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: admin } = await sb.from("admin_users").select("admin_role").eq("user_id", user.id).maybeSingle();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: bp } = await sb.from("business_profiles")
    .select("id, kyc_status, brand_name, legal_name").eq("id", params.id).maybeSingle();
  if (!bp) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  if ((bp as any).kyc_status === "verified") return NextResponse.json({ error: "KYC already verified." }, { status: 400 });

  await sb.from("business_profiles").update({
    kyc_status: "verified",
    kyc_verified_at: new Date().toISOString(),
    kyc_verified_by: user.id,
    kyc_rejection_reason: null,
  } as any).eq("id", params.id);

  try {
    await sb.from("business_audit_log").insert({
      business_id: params.id,
      actor_id: user.id,
      actor_role: "admin",
      action: "kyc_approved",
    } as any);
  } catch {}

  return NextResponse.json({ ok: true, message: `KYC approved for ${(bp as any).brand_name || (bp as any).legal_name}.` });
}
