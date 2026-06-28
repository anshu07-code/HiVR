/**
 * lib/verification.ts — abstract ID verification provider.
 *
 * Dispatches to one of:
 *   * DigiLocker (production) — real eKYC via UIDAI-signed XML
 *   * Sandbox (default)       — accepts regex-matched numbers, no liveness
 *
 * Supports both employee documents (aadhaar / pan / passport / dl) and
 * buyer documents (aadhaar / pan / gstin / bank).
 *
 * What this module does NOT do:
 *   * It does NOT persist the doc number anywhere. Persistence happens in
 *     the route handler at /api/verification/start, which hashes the
 *     number before storage.
 *   * It does NOT trust client input. All numbers are re-normalised and
 *     re-validated server-side.
 *
 * Aadhaar eKYC is handled OUT-OF-BAND by the DigiLocker OAuth flow
 * (see lib/digilocker.ts and the /api/verification/digilocker/* routes).
 * The /api/verification/start route only handles the simpler docs
 * (PAN, GSTIN, bank, passport, DL). Aadhaar is verified via the
 * DigiLocker callback.
 */

import type { Database } from "../supabase/types";

type DocType = Database["public"]["Tables"]["verifications"]["Row"]["doc_type"];

export type VerificationPurpose = "employee" | "buyer";

export type VerificationRequest = {
  user_id: string;
  doc_type: DocType;
  /** For PAN: 10-char. For DL: license number. For Passport: 8-char. For GSTIN: 15-char. For Bank: account number. Aadhaar is NOT accepted here. */
  doc_number: string;
  /** Optional base64 selfie for liveness match. Not persisted here. */
  selfie_b64?: string;
  /** Employee- or buyer-side verification. */
  purpose?: VerificationPurpose;
  /** Optional metadata. For bank, { ifsc, account_holder, penny_drop_code }. */
  metadata?: Record<string, any>;
};

export type VerificationResult =
  | { ok: true; provider_reference_id: string; expires_at?: string }
  | { ok: false; reason: string };

export async function verifyIdentity(req: VerificationRequest): Promise<VerificationResult> {
  // Aadhaar is always handled via the DigiLocker OAuth flow when the
  // provider is configured. The /api/verification/start route
  // shouldn't even be called for Aadhaar in that case — but we
  // double-check here for safety.
  if (req.doc_type === "aadhaar" && process.env.VERIFICATION_PROVIDER === "digilocker") {
    return { ok: false, reason: "Aadhaar must be verified via DigiLocker. Use the 'Continue with DigiLocker' button." };
  }
  return mockVerify(req);
}

/** True when the real DigiLocker flow should be used for Aadhaar. */
export function isAadhaarViaDigiLocker(): boolean {
  return process.env.VERIFICATION_PROVIDER === "digilocker";
}

function mockVerify(req: VerificationRequest): VerificationResult {
  // Normalise: strip whitespace, uppercase.
  const raw = (req.doc_number ?? "").replace(/\s+/g, "").toUpperCase();
  if (!raw) return { ok: false, reason: "Document number is empty." };

  // Regex matchers. Aadhaar is intentionally NOT here — see above.
  const accepted: Record<string, { re: RegExp; hint: string; label: string }> = {
    pan:      { re: /^[A-Z]{5}\d{4}[A-Z]$/,  hint: "Format: ABCDE1234F",                       label: "PAN"     },
    passport: { re: /^[A-PR-WY][0-9]{7}$/,    hint: "1 letter (A, P, R, W or Y) + 7 digits",     label: "Passport" },
    dl:       { re: /^[A-Z]{2}\d{13}$/,      hint: "2 letters (state code) + 13 digits",       label: "Driving License" },
    gstin:    { re: /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}\d{1}Z[A-Z\d]{1}$/, hint: "15-char GSTIN (e.g. 22AAAAA0000A1Z5).", label: "GSTIN" },
    bank:     { re: /^\d{9,18}$/,            hint: "9 to 18 digit account number.",            label: "Bank account" },
  };
  const cfg = accepted[req.doc_type];
  if (!cfg) return { ok: false, reason: "Unsupported document type." };

  if (!cfg.re.test(raw)) {
    return { ok: false, reason: `${cfg.label} format looks wrong. ${cfg.hint}` };
  }

  // Bank accounts also need IFSC + holder + penny-drop code in metadata.
  if ((req.doc_type as string) === "bank") {
    const ifsc = String(req.metadata?.ifsc ?? "").toUpperCase().replace(/\s+/g, "");
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
      return { ok: false, reason: "Bank IFSC code looks wrong. Format: HDFC0001234." };
    }
    const holder = String(req.metadata?.account_holder ?? "").trim();
    if (holder.length < 2) {
      return { ok: false, reason: "Enter the account holder's name as on the bank records." };
    }
    const code = String(req.metadata?.penny_drop_code ?? "").trim();
    if (!/^\d{6}$/.test(code)) {
      return { ok: false, reason: "Enter the 6-digit penny-drop code sent to your account." };
    }
    if (code !== "123456" && code !== "000000") {
      return { ok: false, reason: "Penny-drop code is wrong or expired. Try initiating again." };
    }
  }

  return {
    ok: true,
    provider_reference_id: `mock_${req.doc_type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    expires_at: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
  };
}
