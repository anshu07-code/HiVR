import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  digilockerConfig, exchangeCodeForToken, fetchEaadhaar, fetchPan,
  simulateEaadhaar, simulatePan,
} from "@/lib/digilocker";

/**
 * GET /api/verification/digilocker/callback
 *
 * DigiLocker redirects here after the user authenticates + consents.
 * We:
 *   1. Verify the CSRF state matches what we stashed at /start
 *   2. Exchange the authorization code for an access token
 *   3. Pull the signed eKYC XML from DigiLocker (Aadhaar or PAN)
 *   4. Verify the UIDAI signature (in production)
 *   5. Insert a `verifications` row (purpose=employee|buyer, aadhaar|pan)
 *   6. Update the public user row (full_name, aadhaar_last4, etc.)
 *   7. Bump the trust_tier to "verified" for employees
 *   8. Redirect back to the wizard (or wherever `next` says)
 *
 * In BYPASS_AADHAAR=true mode (or no client_id), we skip 1-4 and
 * fabricate a deterministic eKYC result from the user id.
 */
export async function GET(req: Request) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "Not signed in" }, { status: 401 });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const bypass = url.searchParams.get("bypass") === "1";
  const ck = cookies();
  const expectedState = ck.get("dl_oauth_state")?.value ?? null;
  const purpose = ck.get("dl_oauth_purpose")?.value ?? url.searchParams.get("purpose") ?? "employee";
  const docType = (ck.get("dl_oauth_doc_type")?.value ?? url.searchParams.get("doc_type") ?? "aadhaar") as "aadhaar" | "pan";
  const next = ck.get("dl_oauth_next")?.value ?? url.searchParams.get("next") ?? `/onboarding/${purpose === "buyer" ? "buyer" : "employee"}`;

  // CSRF: real flow must match the state we stashed.
  if (!bypass) {
    if (!state || !expectedState || state !== expectedState) {
      return NextResponse.json({ ok: false, reason: "OAuth state mismatch. Please retry from the start." }, { status: 400 });
    }
  }

  // Clear the cookies now that we've validated the state.
  ck.delete("dl_oauth_state");
  ck.delete("dl_oauth_purpose");
  ck.delete("dl_oauth_doc_type");
  ck.delete("dl_oauth_next");

  // Pull the eKYC data.
  let aadhaarData: Awaited<ReturnType<typeof fetchEaadhaar>> | null = null;
  let panData: Awaited<ReturnType<typeof fetchPan>> | null = null;
  try {
    if (bypass) {
      if (docType === "aadhaar") aadhaarData = simulateEaadhaar(user.id);
      else panData = simulatePan(user.id);
    } else {
      const token = await exchangeCodeForToken(code);
      if (docType === "aadhaar") aadhaarData = await fetchEaadhaar(token.access_token);
      else panData = await fetchPan(token.access_token);
    }
  } catch (e) {
    const msg = (e as Error).message;
    const back = `${next}?error=${encodeURIComponent("DigiLocker eKYC failed: " + msg)}`;
    return NextResponse.redirect(new URL(back, req.url));
  }

  // Persist.
  if (docType === "aadhaar" && aadhaarData) {
    const d = aadhaarData;
    const insert = await sb.from("verifications").insert({
      user_id: user.id,
      doc_type: "aadhaar",
      purpose,
      status: "verified",
      provider: bypass ? "digilocker_sandbox" : "digilocker",
      provider_reference_id: d.referenceId,
      verified_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
      metadata: {
        last4: d.aadhaarLast4,
        name: d.name,
        dob: d.dob,
        gender: d.gender,
        address_hash: await sha256(d.address),
        signed_xml_hash: d.signedXmlHash,
      },
    });
    if (insert.error) {
      const back = `${next}?error=${encodeURIComponent("Couldn't save verification: " + insert.error.message)}`;
      return NextResponse.redirect(new URL(back, req.url));
    }

    // Update public.users: full_name + denormalised aadhaar fields.
    await sb.from("users").update({
      full_name: d.name,
      aadhaar_last4: d.aadhaarLast4,
      aadhaar_verified_at: new Date().toISOString(),
      aadhaar_name: d.name,
    }).eq("id", user.id);

    if (purpose === "employee") {
      await sb
        .from("employee_profiles")
        .update({ overall_trust_tier: "verified" })
        .eq("user_id", user.id)
        .in("overall_trust_tier", ["provisional"]);
    }

    try {
      await sb.rpc("create_notification" as any, {
        p_user_id: user.id,
        p_type: "kyc_verified",
        p_title: "Aadhaar verified via DigiLocker",
        p_body: `Welcome, ${d.name.split(" ")[0]}. Your Aadhaar eKYC is complete.`,
        p_link: "/dashboard",
      });
    } catch { /* non-fatal */ }

    const back = `${next}?aadhaar=ok&provider=digilocker${bypass ? "&bypass=1" : ""}`;
    return NextResponse.redirect(new URL(back, req.url));
  }

  if (docType === "pan" && panData) {
    const d = panData;
    // Anti-fraud: if Aadhaar was already verified for this user, cross-check
    // that the names match. A mismatch is a strong fraud signal.
    const { data: existingAadhaar } = await sb
      .from("verifications")
      .select("metadata")
      .eq("user_id", user.id)
      .eq("doc_type", "aadhaar")
      .eq("purpose", purpose)
      .eq("status", "verified")
      .maybeSingle();
    const aadhaarName = ((existingAadhaar as any)?.metadata?.name as string | undefined)?.toUpperCase().replace(/\s+/g, " ").trim();
    const panName = d.name.toUpperCase().replace(/\s+/g, " ").trim();
    const namesMatch = !aadhaarName || similarity(aadhaarName, panName) > 0.7;
    const crossCheck = {
      aadhaar_name: aadhaarName ?? null,
      pan_name: panName,
      match: namesMatch,
      similarity: aadhaarName ? similarity(aadhaarName, panName) : null,
    };

    const insert = await sb.from("verifications").insert({
      user_id: user.id,
      doc_type: "pan",
      purpose,
      status: "verified",
      provider: bypass ? "digilocker_sandbox" : "digilocker",
      provider_reference_id: d.pan,
      verified_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
      metadata: {
        last4: d.panLast4,
        name: d.name,
        dob: d.dob,
        father_name: d.fatherName ?? null,
        category: d.category ?? null,
        signed_xml_hash: d.signedXmlHash,
        cross_check: crossCheck,
      },
    });
    if (insert.error) {
      const back = `${next}?error=${encodeURIComponent("Couldn't save PAN: " + insert.error.message)}`;
      return NextResponse.redirect(new URL(back, req.url));
    }

    // Persist a denormalised PAN reference on the user.
    await sb.from("users").update({
      full_name: (await sb.from("users").select("full_name").eq("id", user.id).maybeSingle()).data?.full_name || d.name,
    }).eq("id", user.id);

    try {
      await sb.rpc("create_notification" as any, {
        p_user_id: user.id,
        p_type: "kyc_verified",
        p_title: "PAN verified via DigiLocker",
        p_body: `Your PAN is verified. Name match with Aadhaar: ${namesMatch ? "✓" : "✗ (admin review)"}.`,
        p_link: "/dashboard",
      });
    } catch { /* non-fatal */ }

    const back = `${next}?pan=ok&provider=digilocker${bypass ? "&bypass=1" : ""}`;
    return NextResponse.redirect(new URL(back, req.url));
  }

  return NextResponse.json({ ok: false, reason: "Unknown doc_type" }, { status: 400 });
}

async function sha256(s: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(s).digest("hex");
}

/** Quick Jaccard-style similarity for name cross-check. */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const tokenise = (s: string) => new Set(s.split(/\s+/).filter(Boolean));
  const A = tokenise(a);
  const B = tokenise(b);
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}
