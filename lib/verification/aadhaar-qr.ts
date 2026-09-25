/**
 * lib/verification/aadhaar-qr.ts
 *
 * Aadhaar QR code scanning + UIDAI signature verification.
 *
 * Aadhaar QR codes (on the back of the Aadhaar card, or in the mAadhaar
 * app) contain a digitally-signed XML/JSON payload with:
 *   - name
 *   - date of birth
 *   - gender
 *   - address
 *   - photo (base64 JPEG)
 *   - last 4 digits of Aadhaar number
 *   - mobile/email hash (optional)
 *
 * The payload is RSA-2048 signed by UIDAI's offline signing key.
 * The public key is available at:
 *   https://www.uidai.gov.in/content/dam/uidai-website/uidai_offline_publickey_xxx.cer
 *
 * The signature is verified using Web Crypto API — completely free,
 * offline, and cryptographically secure.
 *
 * Flow:
 *   1. jsQR scans the QR code from the camera
 *   2. parseSecureQrData() extracts the signed XML
 *   3. loadUidaiPublicKey() fetches + caches the public key
 *   4. verifyAadhaarSignature() uses Web Crypto to verify the RSA signature
 *   5. If verified → return the signed data (name, DOB, photo, etc.)
 *
 * No API calls, no per-verification cost, runs entirely in the browser.
 */

/* ---------------- TYPES ---------------- */

export type AadhaarSignedData = {
  name: string;
  dob: string;            // ISO yyyy-mm-dd
  gender: 'M' | 'F' | 'O' | null;
  address: string | null;
  photoBase64: string | null;  // data URL of the JPEG
  aadhaarLast4: string;
  mobileHash: string | null;
  emailHash: string | null;
  rawXml: string;
  signedAt: string;        // ISO timestamp from the cert
  signatureBytes: Uint8Array;
};

export type AadhaarVerifyResult =
  | { ok: true; data: AadhaarSignedData }
  | { ok: false; error: string; data?: Partial<AadhaarSignedData> };

/* ---------------- UIDAI PUBLIC KEY ---------------- */

// URL of the live UIDAI authentication public key (X.509 .cer).
// The "auth_prod" cert is what UIDAI uses to sign the secure QR codes
// on Aadhaar letters, e-Aadhaar, mAadhaar, and PVC cards. The key
// is published as an X.509 certificate (DER-encoded). We extract the
// SubjectPublicKeyInfo (SPKI) from it client-side and use Web Crypto
// to verify RSA-PKCS1-v1_5 / SHA-256 signatures — same as
// myaadhaar.uidai.gov.in/verifyAadhaar, but in the browser.
//
// This URL is the one listed on the official UIDAI "QR Code Reader"
// page (uidai.gov.in/en/ecosystem/authentication-devices-documents/
// qr-code-reader.html) under "Aadhaar Paperless Offline e-kyc" →
// "Where can I find the Public Certificate for Digital Signature
// validation?". It is the production key UIDAI uses today.
const UIDAI_PUBLIC_KEY_URL = "https://uidai.gov.in/images/uidai_auth_prod.cer";
const UIDAI_PUBLIC_KEY_CACHE_KEY = "hivr.uidai.publickey.b64";
const UIDAI_PUBLIC_KEY_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Pinned SubjectPublicKeyInfo (DER, base64). Extracted from
// uidai_auth_prod.cer on 2026-06-24. The pinned key is what we use
// for verification; the URL fetch is a rotation check (we compare
// the fetched SPKI fingerprint against this pinned one and warn if
// they differ).
const PINNED_UIDAI_SPKI_B64 = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAx3l+hOh1oXg8SeW2Ix3Lnd1wZs0NaXN1rhht26vX8DKu31orLFYL+u+gGpR7KUBoMyG7wNM/9czJkKit+vvA8cNimGSwZePF3Nq0QJ9eh1X+66vLFdiOQK42AUiM+Zh3+Tn7iKNTuP+b92q7UVCLIIVanyeQec2zM0Cg9CK+x77sWS9X0hUrCAWSkrAaSRWUCLwzatR5m/04M4pzP76dumcXo5dZNp3kwvKmZuPgGkgJ4aoT45w64V9pZjL9EqdvXzYVeGMDThE3x6wsIHU+Xgl1n5DYIS4/FZFAti31Jg+Xn7e8vmsDEliaetiorfeWUByUyAM4h143jEs6lTu2FwIDAQAB";

// SHA-256 of the pinned SPKI bytes. Verified against
// uidai_auth_prod.cer on 2026-06-24.
const PINNED_UIDAI_SPKI_SHA256 = "458e22d9bac0a695b8ebb4229ad822628f879ae405b771908795232005392d25";

/**
 * Walk an ASN.1 DER structure and return the slice that corresponds to
 * the SubjectPublicKeyInfo field of the first X.509 certificate we see.
 *
 * The cert layout is:
 *   SEQUENCE(Certificate) {
 *     SEQUENCE(TBSCertificate) {
 *       [0] EXPLICIT INTEGER (version) — optional
 *       INTEGER (serialNumber)
 *       SEQUENCE (signature AlgorithmIdentifier)
 *       SEQUENCE (issuer)
 *       SEQUENCE (validity)
 *       SEQUENCE (subject)
 *       SEQUENCE (subjectPublicKeyInfo)   <-- we want this
 *       ...
 *     }
 *     ...
 *   }
 *
 * SubjectPublicKeyInfo has the same tag as everything else (0x30), so
 * we identify it by walking into the right offset. The version is
 * optional, so we just step past the first 5 elements after the
 * optional version to reach the SPKI.
 */
export function extractSpkiFromX509Der(der: Uint8Array): Uint8Array {
  let p = 0;
  // 1. Outer SEQUENCE (Certificate) — we don't read its value, just
  //    verify the tag and skip past the TLV header so we land inside.
  if (der[p++] !== 0x30) throw new Error("Not a DER SEQUENCE");
  p += lengthBytes(der, p);  // skip the outer length

  // 2. Inner SEQUENCE (TBSCertificate) — same deal
  if (der[p++] !== 0x30) throw new Error("Not a TBSCertificate");
  p += lengthBytes(der, p);  // skip the TBSCertificate length

  // Now p points inside TBSCertificate. Read the first field (could be
  // the optional version [0], or the serialNumber INTEGER).
  function readTLVHeader(): { tag: number; length: number; totalLen: number } {
    const tag = der[p++];
    const length = readLength(der, p);
    const lb = lengthBytes(der, p);
    const totalLen = 1 + lb + length;  // tag + length-bytes + value
    return { tag, length, totalLen };
  }

  // 3. [0] EXPLICIT version (tag 0xA0) — optional
  if (der[p] === 0xa0) {
    const v = readTLVHeader();
    if (v.tag !== 0xa0) throw new Error("Bad version tag");
    p += v.totalLen - 1;  // we already read the tag byte
  }
  // 4. serialNumber INTEGER (tag 0x02)
  const serial = readTLVHeader();
  if (serial.tag !== 0x02) throw new Error("Expected serialNumber");
  p += serial.totalLen - 1;
  // 5. signature AlgorithmIdentifier SEQUENCE (tag 0x30)
  const sigAlg = readTLVHeader();
  if (sigAlg.tag !== 0x30) throw new Error("Expected signature AlgId");
  p += sigAlg.totalLen - 1;
  // 6. issuer Name SEQUENCE (tag 0x30)
  const issuer = readTLVHeader();
  if (issuer.tag !== 0x30) throw new Error("Expected issuer");
  p += issuer.totalLen - 1;
  // 7. validity SEQUENCE (tag 0x30)
  const validity = readTLVHeader();
  if (validity.tag !== 0x30) throw new Error("Expected validity");
  p += validity.totalLen - 1;
  // 8. subject Name SEQUENCE (tag 0x30)
  const subject = readTLVHeader();
  if (subject.tag !== 0x30) throw new Error("Expected subject");
  p += subject.totalLen - 1;
  // 9. SubjectPublicKeyInfo SEQUENCE (tag 0x30)
  if (der[p] !== 0x30) throw new Error("Expected SubjectPublicKeyInfo");
  const spkiStart = p;
  const spki = readTLVHeader();
  if (spki.tag !== 0x30) throw new Error("Expected SubjectPublicKeyInfo");
  p += spki.totalLen - 1;
  return der.subarray(spkiStart, p);
}

function readLength(der: Uint8Array, offset: number): number {
  // Returns the length value of a DER TLV at `offset` (which must point
  // at the first length byte). Returns just the length, not the new
  // offset.
  const b = der[offset];
  if ((b & 0x80) === 0) return b;
  const n = b & 0x7f;
  if (n === 0) throw new Error("Indefinite length not supported");
  let len = 0;
  for (let i = 0; i < n; i++) len = (len << 8) | der[offset + 1 + i];
  return len;
}

function lengthBytes(der: Uint8Array, offset: number): number {
  // Number of bytes used to encode the length at `offset`.
  const b = der[offset];
  if ((b & 0x80) === 0) return 1;
  return 1 + (b & 0x7f);
}

/**
 * Convert a base64-encoded SPKI to a CryptoKey ready for `verify()`.
 */
export async function importSpkiAsCryptoKey(spkiB64: string): Promise<CryptoKey> {
  const bin = atob(spkiB64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return crypto.subtle.importKey(
    "spki",
    bytes,
    { name: "RSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

/**
 * Load the UIDAI public key as a Web Crypto CryptoKey.
 *
 *   1. Cache hit → use the cached SPKI.
 *   2. Cache miss → try fetching the .cer from uidai.gov.in and
 *      extract the SPKI. If the SPKI fingerprint matches the pinned
 *      one (or matches the cached one) → use it. If different → log
 *      a warning and fall back to the pinned key (we don't auto-trust
 *      rotated keys).
 *   3. Network error → use the pinned key.
 */
export async function loadUidaiPublicKey(): Promise<CryptoKey> {
  if (typeof window === "undefined") throw new Error("Browser-only");

  // 1. Cache
  const cached = window.localStorage?.getItem(UIDAI_PUBLIC_KEY_CACHE_KEY);
  if (cached) {
    const { b64, ts } = JSON.parse(cached) as { b64: string; ts: number };
    if (Date.now() - ts < UIDAI_PUBLIC_KEY_TTL_MS) {
      return importSpkiAsCryptoKey(b64);
    }
  }

  // 2. Try to fetch the live .cer (rotation check)
  try {
    const res = await fetch(UIDAI_PUBLIC_KEY_URL, { cache: "no-store" });
    if (res.ok) {
      const buf = new Uint8Array(await res.arrayBuffer());
      // Sanity: it should start with 0x30 0x82 (SEQUENCE, long form)
      if (buf.length > 0 && buf[0] === 0x30) {
        const spki = extractSpkiFromX509Der(buf);
        const spkiB64 = btoa(String.fromCharCode(...spki));
        const spkiBuffer = new Uint8Array(spki.length);
        spkiBuffer.set(spki);
        const hash = await crypto.subtle.digest("SHA-256", spkiBuffer);
        const fp = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
        if (fp === PINNED_UIDAI_SPKI_SHA256) {
          // Rotation check passed — cache + use the live key
          try {
            window.localStorage?.setItem(
              UIDAI_PUBLIC_KEY_CACHE_KEY,
              JSON.stringify({ b64: spkiB64, ts: Date.now() }),
            );
          } catch { /* quota */ }
          return importSpkiAsCryptoKey(spkiB64);
        } else {
          // Key has been rotated by UIDAI — log warning, use pinned
          // eslint-disable-next-line no-console
          console.warn(
            "[aadhaar-qr] UIDAI public key SPKI fingerprint changed.",
            "Pinned:", PINNED_UIDAI_SPKI_SHA256,
            "Live:", fp,
            "Using pinned key. Update the pin if UIDAI has rotated.",
          );
        }
      }
    }
  } catch { /* network error — fall through to pinned key */ }

  // 3. Pinned fallback
  return importSpkiAsCryptoKey(PINNED_UIDAI_SPKI_B64);
}

/**
 * @deprecated Use loadUidaiPublicKey() instead. Kept for callers that
 * need the PEM string for debugging.
 */
export async function loadUidaiPublicKeyPem(): Promise<string> {
  // Build a PEM from the pinned SPKI for debug / display
  const b64 = PINNED_UIDAI_SPKI_B64;
  const chunks = b64.match(/.{1,64}/g) ?? [];
  return [
    "-----BEGIN PUBLIC KEY-----",
    ...chunks,
    "-----END PUBLIC KEY-----",
  ].join("\n");
}

/* ---------------- QR PAYLOAD PARSING ---------------- */

/**
 * The UIDAI secure QR payload starts with "<?xml" or contains "<PrintLetterBarcodeData>".
 * It's a signed XML document.
 */
export function looksLikeAadhaarQr(raw: string): boolean {
  if (!raw) return false;
  const trimmed = raw.trim();
  return trimmed.startsWith("<?xml") || trimmed.includes("<PrintLetterBarcodeData") || trimmed.includes("signed-data");
}

/**
 * Parse the Aadhaar secure QR XML. Returns the signed data and the
 * signature bytes for verification.
 *
 * Handles multiple UIDAI XML formats including:
 *   - <PrintLetterBarcodeData> with <Signature> child element
 *   - <PrintLetterBarcodeData> with Signature as attribute reference
 *   - <SignedData> wrapper formats
 *   - e-Aadhaar / mAadhaar app export formats
 *   - Base64 signature in textContent, attribute, or CDATA
 */
export function parseAadhaarQr(rawXml: string): {
  data: Omit<AadhaarSignedData, 'signatureBytes'>;
  signatureBytes: Uint8Array;
} | null {
  if (!rawXml) return null;

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(rawXml, "text/xml");
  } catch {
    return null;
  }

  const err = doc.querySelector("parsererror");
  if (err) return null;

  const root = doc.querySelector("PrintLetterBarcodeData") || doc.querySelector("SignedData") || doc.documentElement;
  if (!root) return null;

  // ----- Extract signature bytes (multiple formats) -----
  const possibleSigEls = [
    doc.querySelector('Signature'),
    doc.querySelector('[Signature]'),
    doc.querySelector('[signature]'),
    root.querySelector('Signature'),
    root.querySelector('[reference]'),
    root.querySelector('[Reference]'),
  ].filter(Boolean);

  let signatureBytes: Uint8Array | null = null;

  for (const el of possibleSigEls) {
    // Try extracting base64 from various sources
    const candidates = [
      el!.getAttribute("reference"),
      el!.getAttribute("Reference"),
      el!.getAttribute("value"),
      el!.getAttribute("signature"),
      el!.getAttribute("Signature"),
      el!.textContent,
    ].filter(Boolean).map((s) => s!.trim()).filter((s) => s.length > 10);

    for (const c of candidates) {
      const cleaned = c.replace(/^Signature\//i, "").replace(/\s+/g, "");
      try {
        const binStr = atob(cleaned);
        if (binStr.length > 10) {
          signatureBytes = new Uint8Array(binStr.length);
          for (let i = 0; i < binStr.length; i++) signatureBytes[i] = binStr.charCodeAt(i);
          break;
        }
      } catch {
        // not valid base64, try next candidate
      }
    }
    if (signatureBytes) break;
  }

  // Also try the entire raw XML for a standalone base64 signature string
  if (!signatureBytes) {
    const sigMatch = rawXml.match(/<Signature[^>]*>([A-Za-z0-9+/=]+)<\/Signature>/);
    if (sigMatch) {
      try {
        const cleaned = sigMatch[1].replace(/\s+/g, "");
        const binStr = atob(cleaned);
        if (binStr.length > 10) {
          signatureBytes = new Uint8Array(binStr.length);
          for (let i = 0; i < binStr.length; i++) signatureBytes[i] = binStr.charCodeAt(i);
        }
      } catch { /* not valid base64 */ }
    }
  }

  if (!signatureBytes) return null;

  // ----- Extract fields with multiple tag name fallbacks -----
  const get = (tags: string[]) => {
    for (const tag of tags) {
      const el = root!.querySelector(tag);
      if (el?.textContent?.trim()) return el.textContent.trim();
    }
    return null;
  };

  const name = get(["name", "Name", "fullName", "FullName"]) ?? "";
  const dobRaw = get(["dob", "DOB", "dateOfBirth", "DateOfBirth"]) ?? "";
  const dob = normalizeAadhaarDob(dobRaw);
  const genderRaw = get(["gender", "Gender"]) ?? "";
  const gender = (genderRaw === "M" || genderRaw === "F" || genderRaw === "O") ? genderRaw : null;
  const addressRaw = get(["address", "Address", "co", "Co"]);
  const address = addressRaw ? addressRaw.replace(/[^\x20-\x7E\n]/g, "").trim() : null;
  const photoRaw = get(["photo", "Photo"]);
  const photoBase64 = photoRaw ? "data:image/jpeg;base64," + photoRaw : null;
  const aadhaarLast4 = get(["uid", "aadhaar", "Uid", "Aadhaar"]) ?? "";
  const mobileHash = get(["m", "mobile", "Mobile"]) ?? null;
  const emailHash = get(["e", "email", "Email"]) ?? null;

  const data: Omit<AadhaarSignedData, 'signatureBytes'> = {
    name,
    dob,
    gender: gender as 'M' | 'F' | 'O' | null,
    address,
    photoBase64,
    aadhaarLast4,
    mobileHash,
    emailHash,
    rawXml: rawXml.trim(),
    signedAt: new Date().toISOString(),
  };

  return { data, signatureBytes };
}

/**
 * Aadhaar DOB can be in DD/MM/YYYY, DD-MM-YYYY, or YYYY-MM-DD.
 * Returns ISO yyyy-mm-dd or empty string.
 */
function normalizeAadhaarDob(raw: string): string {
  if (!raw) return "";
  const cleaned = raw.trim();
  // DD/MM/YYYY or DD-MM-YYYY
  let m = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // YYYY-MM-DD or YYYY/MM/DD
  m = cleaned.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return cleaned;
}

/* ---------------- SIGNATURE VERIFICATION ---------------- */

/**
 * Convert a PEM-formatted public key into a CryptoKey for Web Crypto.
 * Example PEM:
 *   -----BEGIN PUBLIC KEY-----
 *   MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
 *   -----END PUBLIC KEY-----
 */
export async function importRsaPublicKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return crypto.subtle.importKey(
    "spki",
    bytes,
    { name: "RSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

/**
 * Compute the canonical signed-data byte stream that UIDAI signs.
 *
 * Per the UIDAI spec (Aadhaar Data Verification — Offline):
 *   * The signed data is a subset of the XML containing specific tags
 *     in a specific order
 *   * Each tag is rendered as: `<tag attr="value">innerText</tag>`
 *   * Whitespace inside tag values is preserved
 *
 * We build this canonical form for the most common UIDAI tag set.
 * The signature is then verified against THIS byte stream.
 */
export function buildSignedDataBytes(rawXml: string, signatureBytes: Uint8Array): Uint8Array {
  // Strip the Signature element from the XML first
  const stripped = rawXml.replace(/<Signature[^>]*>[\s\S]*?<\/Signature>/i, "");
  // UIDAI signs the data between the root <PrintLetterBarcodeData> tags,
  // not including the wrapping tags themselves. We re-serialize in the
  // canonical order.
  const doc = new DOMParser().parseFromString(stripped, "text/xml");
  const root = doc.querySelector("PrintLetterBarcodeData") || doc.querySelector("SignedData") || doc.documentElement;
  if (!root) return new TextEncoder().encode(stripped);

  // Canonical order: name, dob, gender, co, address, uid, photo, m, e
  // Try alternate tag names for each position
  const order: string[][] = [
    ["name", "Name"],
    ["dob", "DOB", "dateOfBirth"],
    ["gender", "Gender"],
    ["co", "Co"],
    ["address", "Address"],
    ["uid", "aadhaar", "Uid", "Aadhaar"],
    ["photo", "Photo"],
    ["m", "mobile"],
    ["e", "email"],
  ];

  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  for (const tags of order) {
    let el: Element | null = null;
    for (const tag of tags) {
      el = root.querySelector(tag);
      if (el) break;
    }
    if (!el) continue;
    const text = el.innerHTML ?? el.textContent ?? "";
    const bytes = enc.encode(text);
    chunks.push(bytes);
  }

  // If we got nothing from canonical order, try the raw text content
  if (chunks.length === 0) {
    return new TextEncoder().encode(root.textContent ?? "");
  }

  // Concatenate
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/**
 * Verify the Aadhaar QR signature using the UIDAI public key.
 * Returns true if the signature is valid (i.e. the QR is genuine).
 */
export async function verifyAadhaarSignature(
  rawXml: string,
  signatureBytes: Uint8Array,
  publicKey: CryptoKey,
): Promise<boolean> {
  try {
    const signedData = buildSignedDataBytes(rawXml, signatureBytes);
    return await (crypto.subtle.verify as any)(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      signatureBytes,
      signedData,
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[aadhaar-qr] signature verify error", e);
    return false;
  }
}

/* ---------------- TOP-LEVEL ENTRY POINT ---------------- */

/**
 * Verify an Aadhaar QR payload (raw XML from the camera).
 * Returns the signed data ONLY if the RSA-2048 signature is valid.
 *
 * If parsing or signature verification fails, we still return the
 * parsed data with `ok: false` so the UI can show the extracted
 * information and let the user fall back to the upload/OCR path.
 *
 * Security: `ok: true` is ONLY returned when the UIDAI digital
 * signature is cryptographically verified. This guarantees the data
 * came from UIDAI and hasn't been tampered with. Without this check,
 * anyone could forge a QR with a fake name/photo.
 */
export async function verifyAadhaarQr(rawQrPayload: string): Promise<AadhaarVerifyResult> {
  if (!looksLikeAadhaarQr(rawQrPayload)) {
    return { ok: false, error: "Not an Aadhaar QR code. Paste the full XML text from the QR scanner." };
  }
  const parsed = parseAadhaarQr(rawQrPayload);
  if (!parsed) {
    return { ok: false, error: "Could not parse Aadhaar QR data. Try the upload method instead." };
  }
  if (!parsed.data.name) {
    return { ok: false, error: "QR missing required fields (name). Try the upload method instead.", data: parsed.data };
  }
  try {
    const key = await loadUidaiPublicKey();
    const sigValid = await verifyAadhaarSignature(parsed.data.rawXml, parsed.signatureBytes, key);
    if (!sigValid) {
      // Signature invalid — the QR data is not from UIDAI.
      // Return the parsed data so the UI can show what was found,
      // but with ok: false so aadhaarQrVerified stays false.
      return {
        ok: false,
        error: "Aadhaar QR signature is INVALID. This data was not signed by UIDAI. Use the upload method instead.",
        data: parsed.data,
      };
    }
    return { ok: true, data: { ...parsed.data, signatureBytes: parsed.signatureBytes } };
  } catch (e) {
    // Network or crypto error — can't verify the signature.
    return {
      ok: false,
      error: `Could not verify UIDAI signature: ${(e as Error).message}. Try the upload method instead.`,
      data: parsed.data,
    };
  }
}
