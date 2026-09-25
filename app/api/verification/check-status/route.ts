import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const DOC_SESSION_KINDS: Record<string, string[]> = {
  aadhaar: ["adult_aadhaar", "minor_aadhaar", "minor_school_id", "minor_parent_aadhaar"],
  pan:     ["adult_pan"],
  selfie:  ["adult_selfie"],
};

async function latestSessionOk(sb: any, userId: string, docType: string): Promise<boolean | null> {
  const kinds = DOC_SESSION_KINDS[docType];
  if (!kinds) return null;
  const { data } = await sb
    .from("verification_sessions")
    .select("status, created_at")
    .eq("user_id", userId)
    .in("kind", kinds)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null; // no session → fall back to verifications table
  return data.status === "auto_approved" || data.status === "approved";
}

export async function GET() {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

    const { data: verifications } = await sb
      .from("verifications")
      .select("doc_type, status, metadata, provider")
      .eq("user_id", user.id);

    const userId = user.id;
    const rows = (verifications ?? []) as { doc_type: string; status: string; metadata?: any; provider?: string }[];

    async function verified(doc: string): Promise<boolean> {
      const inVerTable = rows.some((r) => r.doc_type === doc && (r.status === "verified" || r.status === "approved"));
      if (!inVerTable) return false;
      const sessionOk = await latestSessionOk(sb, userId, doc);
      // If a session exists, trust it over the stale verifications table.
      // If no session exists, fall back to verifications (handles seed data).
      return sessionOk ?? true;
    }

    async function selfieVerified(): Promise<boolean> {
      const inVerTable = rows.some((r) => (r.doc_type === "liveness" || r.doc_type === "selfie") && (r.status === "verified" || r.status === "approved"));
      if (inVerTable) return true;
      const { data } = await (sb as any)
        .from("verification_sessions")
        .select("status")
        .eq("user_id", userId)
        .eq("kind", "adult_selfie")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data) return false;
      const s = (data as { status: string }).status;
      return s === "auto_approved" || s === "approved" || s === "admin_review" || s === "submitted";
    }

    let bankLast4: string | null = null;
    let bankUpiProvider: string | null = null;
    if (await verified("bank")) {
      const { data: userRow } = await sb
        .from("users")
        .select("account_last4, upi_provider_name")
        .eq("id", user.id)
        .maybeSingle();
      if (userRow) {
        bankLast4 = (userRow as any).account_last4;
        bankUpiProvider = (userRow as any).upi_provider_name;
      }
    }

    return NextResponse.json({
      ok: true,
      aadhaar: await verified("aadhaar"),
      pan: await verified("pan"),
      selfie: await selfieVerified(),
      bank: await verified("bank"),
      bank_last4: bankLast4,
      bank_upi_provider: bankUpiProvider,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
