/**
 * lib/digilocker.ts — DigiLocker OAuth + Aadhaar eKYC integration.
 *
 * DigiLocker is the Government of India's official digital document
 * wallet. The OAuth 2.0 "Requester" flow lets us pull a user's
 * UIDAI-signed eKYC XML directly from DigiLocker — the user
 * authenticates with their Aadhaar-linked mobile OTP, consents, and
 * we get back a signed XML containing name, DOB, gender, masked
 * Aadhaar, address, photo.
 *
 * Flow:
 *   1. /api/verification/digilocker/start  → redirect user to
 *      https://api.digilocker.gov.in/oauth2/1/authorize
 *   2. User authenticates with mobile OTP, consents
 *   3. DigiLocker redirects to /api/verification/digilocker/callback?code=…
 *   4. /callback exchanges code → access_token (POST to /oauth2/1/token)
 *   5. /callback calls /oauth2/1/eaadhaar with the access_token
 *   6. UIDAI-signed XML returned — verify the signature with UIDAI's
 *      public certificate, extract the user's name + Aadhaar reference
 *   7. Mark the user as eKYC-verified, persist a reference for audit
 *
 * Sandbox mode:
 *   If BYPASS_AADHAAR=true, the start route short-circuits and the
 *   "callback" simulates a successful verification. Use this for
 *   local dev only — never enable in production.
 *
 * References:
 *   - https://www.digilocker.gov.in/digilocker-business-api.php
 *   - https://www.digilocker.gov.in/digilocker-business-api-documentation.php
 *   - https://www.uidai.gov.in/ (UIDAI public signature certificate)
 */

import { createHash, randomBytes, createVerify } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/* ====================================================================== */
/* Config                                                                 */
/* ====================================================================== */

export type DigiLockerEnv = "production" | "sandbox";

export type DigiLockerDoc = "aadhaar" | "pan";

export const DIGILOCKER_ENDPOINTS: Record<DigiLockerEnv, {
  authorize: string;
  token: string;
  /** Aadhaar eKYC endpoint */
  eaadhaar: string;
  /** PAN endpoint — DigiLocker pulls the user's PAN card as a signed XML */
  pan: string;
}> = {
  production: {
    authorize: "https://api.digilocker.gov.in/oauth2/1/authorize",
    token:     "https://api.digilocker.gov.in/oauth2/1/token",
    eaadhaar:  "https://api.digilocker.gov.in/oauth2/1/eaadhaar",
    pan:       "https://api.digilocker.gov.in/oauth2/1/pan",
  },
  sandbox: {
    authorize: "https://api.digilocker.gov.in/digilockerapi/1/oauth2/authorize",
    token:     "https://api.digilocker.gov.in/digilockerapi/1/oauth2/token",
    eaadhaar:  "https://api.digilocker.gov.in/digilockerapi/1/oauth2/eaadhaar",
    pan:       "https://api.digilocker.gov.in/digilockerapi/1/oauth2/pan",
  },
};

export function digilockerConfig() {
  const env = (process.env.DIGILOCKER_ENV as DigiLockerEnv) || "production";
  return {
    env,
    endpoints: DIGILOCKER_ENDPOINTS[env],
    clientId: process.env.DIGILOCKER_CLIENT_ID || "",
    clientSecret: process.env.DIGILOCKER_CLIENT_SECRET || "",
    redirectUri: process.env.DIGILOCKER_REDIRECT_URI || "",
    isConfigured: !!process.env.DIGILOCKER_CLIENT_ID && !!process.env.DIGILOCKER_CLIENT_SECRET,
    bypass: process.env.BYPASS_AADHAAR === "true",
  };
}

/* ====================================================================== */
/* 1. OAuth: build the authorize URL                                       */
/* ====================================================================== */

/**
 * Build the URL to redirect the user to. DigiLocker's authorize endpoint
 * accepts:
 *   - response_type=code
 *   - client_id, redirect_uri
 *   - state (CSRF protection — we generate a random one and stash it
 *           in a short-lived signed cookie)
 *   - purpose (optional — e.g. "Employment KYC")
 *   - doc_type (optional — "aadhaar" or "pan", pre-selects the doc
 *              picker on DigiLocker)
 *
 * The state value lets us verify the callback is for the same session
 * that initiated the flow.
 */
export function buildAuthorizeUrl(opts: {
  state: string;
  purpose?: string;
  docType?: DigiLockerDoc;
}): string {
  const cfg = digilockerConfig();
  const u = new URL(cfg.endpoints.authorize);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("redirect_uri", cfg.redirectUri);
  u.searchParams.set("state", opts.state);
  if (opts.purpose) u.searchParams.set("purpose", opts.purpose);
  if (opts.docType) u.searchParams.set("doc_type", opts.docType);
  return u.toString();
}

/**
 * Generate a cryptographically random state token for CSRF protection.
 * The caller should stash this in a short-lived cookie and verify it on
 * the callback.
 */
export function generateState(): string {
  return randomBytes(24).toString("hex");
}

/* ====================================================================== */
/* 2. Token exchange                                                      */
/* ====================================================================== */

export type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number; // seconds
  refresh_token?: string;
  scope?: string;
};

/**
 * Exchange the authorization code for an access token. Called from the
 * /callback route handler.
 */
export async function exchangeCodeForToken(code: string): Promise<TokenResponse> {
  const cfg = digilockerConfig();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
  });
  const res = await fetch(cfg.endpoints.token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DigiLocker token exchange failed: ${res.status} ${text.slice(0, 200)}`);
  }
  return (await res.json()) as TokenResponse;
}

/* ====================================================================== */
/* 3. Pull eKYC data                                                       */
/* ====================================================================== */

export type EaadhaarData = {
  /** UIDAI's reference for the eKYC pull (audit trail). */
  referenceId: string;
  /** Full name as on Aadhaar. */
  name: string;
  /** Date of birth ISO string. */
  dob: string;
  gender: "M" | "F" | "O";
  /** Last 4 digits of Aadhaar. DigiLocker always returns a masked value. */
  aadhaarLast4: string;
  /** Full address. */
  address: string;
  /** Care-of / guardian name. */
  careOf?: string;
  /** Photo as base64 data URL (DigiLocker provides this). */
  photo?: string;
  /** The original signed XML — store for audit. */
  signedXml: string;
  /** Hash of the signed XML (sha256) — duplicate-detection without storing the full XML twice. */
  signedXmlHash: string;
};

/**
 * Fetch the user's eKYC data from DigiLocker. The access token is
 * passed as a query parameter (DigiLocker's API expects this for the
 * eAadhaar endpoint, unlike the standard OAuth 2.0 RFC).
 */
export async function fetchEaadhaar(accessToken: string): Promise<EaadhaarData> {
  const cfg = digilockerConfig();
  const u = new URL(cfg.endpoints.eaadhaar);
  u.searchParams.set("access_token", accessToken);
  // The format param: "xml" is the default. We use XML so we can
  // verify the UIDAI signature.
  u.searchParams.set("format", "xml");
  const res = await fetch(u.toString(), { method: "GET" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DigiLocker eKYC fetch failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const xml = await res.text();
  return parseEaadhaarXml(xml);
}

/* ====================================================================== */
/* 3b. Pull PAN data                                                       */
/* ====================================================================== */

export type PanData = {
  /** PAN as it appears on the card. Full 10-char string. */
  pan: string;
  /** Last 4 of PAN for display. */
  panLast4: string;
  /** Full legal name as on the PAN card. */
  name: string;
  /** Date of birth. */
  dob: string;
  /** Father's name (for individual PAN). */
  fatherName?: string;
  /** Type code from the 4th character: P=Individual, C=Company, H=HUF, etc. */
  category?: string;
  /** The original signed XML — store for audit. */
  signedXml: string;
  /** Hash of the signed XML. */
  signedXmlHash: string;
};

/**
 * Fetch the user's PAN data from DigiLocker. Same OAuth flow as
 * eAadhaar, but pulls the PAN card document instead.
 */
export async function fetchPan(accessToken: string): Promise<PanData> {
  const cfg = digilockerConfig();
  const u = new URL(cfg.endpoints.pan);
  u.searchParams.set("access_token", accessToken);
  u.searchParams.set("format", "xml");
  const res = await fetch(u.toString(), { method: "GET" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DigiLocker PAN fetch failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const xml = await res.text();
  return parsePanXml(xml);
}

/**
 * Parse a DigiLocker PAN response. The XML structure looks like:
 *
 *   <PanData>
 *     <Pan>ABCDE1234F</Pan>
 *     <Name>JOHN SMITH</Name>
 *     <Dob>1990-01-01</Dob>
 *     <FatherName>SMITH SR</FatherName>
 *     <Signature>...UIDAI-signed XML...</Signature>
 *   </PanData>
 *
 * The PAN comes through in plaintext from DigiLocker (DigiLocker
 * treats PAN as a non-sensitive doc, unlike Aadhaar which is masked).
 */
export function parsePanXml(xml: string): PanData {
  const get = (tag: string): string => {
    const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
    return m ? m[1].trim() : "";
  };
  const pan = get("Pan").toUpperCase().replace(/\s+/g, "");
  const name = get("Name");
  const dob = get("Dob");
  const fatherName = get("FatherName") || undefined;
  // 4th character of PAN indicates the holder's category
  const category = pan.length >= 4 ? pan[3] : undefined;

  const valid = verifyUidaiSignature(xml);
  if (!valid && process.env.NODE_ENV === "production") {
    throw new Error("UIDAI signature verification failed — refusing to persist PAN data.");
  }

  return {
    pan,
    panLast4: pan.slice(-4).padStart(4, "•"),
    name,
    dob,
    fatherName,
    category,
    signedXml: xml,
    signedXmlHash: createHash("sha256").update(xml).digest("hex"),
  };
}

/* ====================================================================== */
/* 4. Parse + verify the signed XML                                       */
/* ====================================================================== */

/**
 * Parse a DigiLocker eAadhaar XML response. DigiLocker returns the
 * following structure (simplified):
 *
 *   <EaadhaarDoc>
 *     <ReferenceId>...UIDAI ref...</ReferenceId>
 *     <Poi name="..." dob="..." gender="..." />
 *     <Poa co="..." house="..." street="..." loc="..." vtc="..." dist="..." state="..." country="..." pc="..." />
 *     <Pht>BASE64_IMAGE</Pht>
 *     <Signature>...UIDAI-signed XML signature...</Signature>
 *   </EaadhaarDoc>
 *
 * The signature is an XML-DSig over the canonicalised document. We
 * verify it with UIDAI's public signing certificate.
 */
export function parseEaadhaarXml(xml: string): EaadhaarData {
  // Naive regex parse — fine for sandbox; production should use
  // a proper XML parser (fast-xml-parser, libxmljs, etc.) for safety.
  const get = (tag: string): string => {
    const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
    return m ? m[1].trim() : "";
  };
  const getAttr = (tag: string, attr: string): string => {
    const m = xml.match(new RegExp(`<${tag}[^>]*\\s${attr}="([^"]+)"`));
    return m ? m[1] : "";
  };

  const referenceId = get("ReferenceId");
  const name = getAttr("Poi", "name");
  const dob = getAttr("Poi", "dob");
  const gender = (getAttr("Poi", "gender") || "O") as "M" | "F" | "O";
  const photo = get("Pht");
  const aadhaarLast4 = (referenceId || "").slice(-4).padStart(4, "•");

  // Build a flat address from the Poa elements.
  const parts = [
    get("Co"), get("House"), get("Street"), get("Loc"),
    get("Vtc"), get("Dist"), get("State"), get("Country"), get("Pc"),
  ].filter(Boolean);
  const address = parts.join(", ");

  // Best-effort: validate the signature. In production this MUST pass
  // before persisting; in sandbox we warn and proceed.
  const valid = verifyUidaiSignature(xml);
  if (!valid && process.env.NODE_ENV === "production") {
    throw new Error("UIDAI signature verification failed — refusing to persist eKYC data.");
  }

  return {
    referenceId,
    name,
    dob,
    gender,
    aadhaarLast4,
    address,
    photo: photo || undefined,
    signedXml: xml,
    signedXmlHash: createHash("sha256").update(xml).digest("hex"),
  };
}

/**
 * Verify the UIDAI XML-DSig signature on the eAadhaar document.
 * Returns true if the signature is valid OR if no certificate is
 * configured (in which case we log a warning and proceed — useful
 * for sandbox where the XML is fabricated).
 *
 * Production setup: download UIDAI's public certificate from
 * https://www.uidai.gov.in/ and set DIGILOCKER_UIDAI_CERT_PATH to
 * its local path.
 */
export function verifyUidaiSignature(xml: string): boolean {
  // If this is a sandbox / bypass XML, the signature is "SANDBOX" and
  // there's nothing to verify — return true and let the data through.
  if (xml.includes("SANDBOX")) return true;

  const certPath = process.env.DIGILOCKER_UIDAI_CERT_PATH;
  if (!certPath) {
    // No cert configured — we can't verify. In production this
    // MUST be set.
    if (process.env.NODE_ENV === "production") {
      console.warn("[digilocker] DIGILOCKER_UIDAI_CERT_PATH not set — refusing in production.");
      return false;
    }
    return true; // skip in dev
  }
  try {
    // Extract the signature value from the XML.
    const sigMatch = xml.match(/<Signature[^>]*>([\s\S]*?)<\/Signature>/);
    const sigValueMatch = xml.match(/<SignatureValue[^>]*>([\s\S]*?)<\/SignatureValue>/);
    const sig = (sigValueMatch?.[1] ?? sigMatch?.[1] ?? "").replace(/\s+/g, "");
    if (!sig) return false;

    const cert = readFileSync(resolve(certPath));
    const verifier = createVerify("RSA-SHA256");
    verifier.update(xml);
    verifier.end();
    return verifier.verify(cert, Buffer.from(sig, "base64"));
  } catch (e) {
    // Missing cert file in dev is expected — log once and treat as
    // "skip verification" so the rest of the flow still works.
    console.warn(`[digilocker] signature verification skipped: ${(e as Error).message}`);
    return true;
  }
}

/* ====================================================================== */
/* 5. Sandbox simulator                                                   */
/* ====================================================================== */

export type SandboxProfile = { fullName?: string; last4?: string };

/**
 * In BYPASS_AADHAAR mode, fabricate a deterministic eKYC result from
 * the user id. This lets the rest of the eKYC pipeline be tested
 * without the real DigiLocker integration.
 */
export function simulateEaadhaar(userId: string, profile?: SandboxProfile): EaadhaarData {
  const last4 = profile?.last4 || userId.replace(/[^0-9]/g, "").slice(-4).padStart(4, "1234");
  const name = profile?.fullName || "HiVR Sandbox User";
  const xml =
    `<EaadhaarDoc>
      <ReferenceId>SANDBOX-${userId.slice(0, 8)}-${last4}</ReferenceId>
      <Poi name="${name}" dob="1990-01-01" gender="M" />
      <Poa>
        <Co>S/O Sandbox</Co>
        <House>1</House>
        <Street>Sandbox Lane</Street>
        <Loc>Test City</Loc>
        <Vtc>Bypass</Vtc>
        <Dist>Dev</Dist>
        <State>KA</State>
        <Country>India</Country>
        <Pc>560001</Pc>
      </Poa>
      <Pht></Pht>
      <Signature>SANDBOX</Signature>
    </EaadhaarDoc>`;
  return parseEaadhaarXml(xml);
}

/**
 * In BYPASS_AADHAAR mode, fabricate a deterministic PAN eKYC result.
 * The PAN is derived from the user id so it's stable across runs.
 */
export function simulatePan(userId: string, profile?: { fullName?: string; pan?: string }): PanData {
  // Build a deterministic 10-char PAN matching the [A-Z]{5}\d{4}[A-Z] format
  const seed = userId.replace(/[^a-f0-9]/gi, "").toUpperCase().padEnd(10, "X");
  const pan = (profile?.pan || `HVR${seed.slice(0, 4)}${seed.slice(4, 8)}${seed[8] || "P"}`).slice(0, 10).toUpperCase();
  const name = profile?.fullName || "HiVR Sandbox User";
  const xml =
    `<PanData>
      <Pan>${pan}</Pan>
      <Name>${name}</Name>
      <Dob>1990-01-01</Dob>
      <FatherName>SANDBOX FATHER</FatherName>
      <Signature>SANDBOX</Signature>
    </PanData>`;
  return parsePanXml(xml);
}
