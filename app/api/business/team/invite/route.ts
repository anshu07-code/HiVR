/**
 * POST /api/business/team/invite
 * Body (FormData): { email, role }
 *
 * Creates a business_members row with status='invited', generates an
 * invite token, and "sends" an email (logged to console in dev).
 * In production, this would call Supabase Auth's magic link or a
 * transactional email provider.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkBusinessLimit } from "@/lib/plan-gate";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: bp } = await sb.from("business_profiles")
    .select("id, is_suspended, brand_name, legal_name").eq("owner_user_id", user.id).maybeSingle();
  if (!bp) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  if ((bp as any).is_suspended) return NextResponse.json({ error: "Business is suspended" }, { status: 403 });

  const formData = await req.formData();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "other");

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }
  if (!["owner", "director", "authorised_signatory", "hr", "manager", "other"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Plan limit
  const gate = await checkBusinessLimit(bp.id, "add_member");
  if (!gate.allowed) {
    return NextResponse.json({ error: gate.reason, upgradeRequired: gate.upgradeRequired }, { status: 403 });
  }

  // Don't allow inviting the same email twice
  const { data: existing } = await sb.from("business_members")
    .select("id, status")
    .eq("business_id", bp.id).eq("invite_email", email).maybeSingle();
  if (existing) {
    return NextResponse.json({
      error: existing.status === "invited" ? "Invite already pending for this email." : "This email is already a team member.",
    }, { status: 400 });
  }

  // Generate an invite token (random 32-byte hex)
  const inviteToken = crypto.randomBytes(24).toString("hex");

  // If the user already has an auth.users row (i.e. they already signed up
  // to HiVR as an individual), we can link them immediately. Otherwise
  // we keep status='invited' and they'll be linked when they sign up.
  const admin = createAdminClient();
  let existingUser: { id: string } | null = null;
  try {
    const listResult = await admin.auth.admin.listUsers();
    existingUser = (listResult.data?.users ?? []).find((u: any) => (u.email ?? "").toLowerCase() === email) ?? null;
  } catch {
    existingUser = null;
  }

  const insert = {
    business_id: bp.id,
    user_id: existingUser?.id ?? null,
    invite_email: email,
    invite_token: inviteToken,
    member_role: role,
    status: existingUser ? "active" : "invited",
    invited_at: new Date().toISOString(),
    invited_by: user.id,
    joined_at: existingUser ? new Date().toISOString() : null,
  };

  const { error: insErr } = await sb.from("business_members").insert(insert as any);
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });

  // In production: send the invite email via Supabase or Resend/Postmark.
  // For dev, we just log to the server console + return the token in the
  // response so the owner can copy it.
  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/business/team/accept?token=${inviteToken}`;
  console.log(`[team] Invite sent to ${email} for business ${(bp as any).brand_name || (bp as any).legal_name}: ${inviteUrl}`);

  return NextResponse.json({
    ok: true,
    email,
    role,
    inviteUrl: process.env.NODE_ENV === "development" ? inviteUrl : undefined,
    alreadyOnPlatform: !!existingUser,
  });
}
