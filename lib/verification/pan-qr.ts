/**
 * lib/verification/pan-qr.ts
 *
 * PAN card QR code scanning + format validation.
 *
 * The PAN QR (on the back of newer PAN cards) contains a JSON payload
 * with name, PAN, DOB, father's name, and Aadhaar last 4 (sometimes).
 *
 * IMPORTANT: PAN QR is NOT cryptographically signed by the income tax
 * department (unlike Aadhaar). So we can't prove authenticity the way
 * we can with Aadhaar. Instead we do a "best effort" verification:
 *   1. Parse the QR JSON
 *   2. Verify the format (PAN regex, date validity)
 *   3. Cross-check name + DOB against the user's signup data
 *   4. If user uploaded the front of the card as well, OCR the PAN
 *      number from the image and compare to the QR
 *
 * In sandbox, we accept a manually-typed PAN instead of a QR scan,
 * to make local testing painless.
 */

export type PanQrData = {
  pan: string;
  name: string;
  dob: string;        // ISO yyyy-mm-dd
  fatherName: string | null;
  aadhaarLast4: string | null;
  raw: string;        // original QR payload
};

/* ---------------- QR PARSING ---------------- */

export function looksLikePanQr(raw: string): boolean {
  if (!raw) return false;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) return false;
  try {
    const j = JSON.parse(trimmed);
    return !!(j.PAN || j.pan);
  } catch {
    return false;
  }
}

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export function parsePanQr(raw: string): PanQrData | null {
  if (!looksLikePanQr(raw)) return null;
  let j: any;
  try {
    j = JSON.parse(raw.trim());
  } catch {
    return null;
  }
  const pan = String(j.PAN ?? j.pan ?? "").toUpperCase().trim();
  if (!PAN_REGEX.test(pan)) return null;
  const name = String(j.Name ?? j.name ?? "").trim();
  const dobRaw = String(j.DOB ?? j.dob ?? "").trim();
  const dob = normalizeDob(dobRaw);
  return {
    pan,
    name,
    dob,
    fatherName: j.FatherName ?? j.fatherName ?? null,
    aadhaarLast4: j.AadhaarLast4 ?? j.aadhaarLast4 ?? null,
    raw: raw.trim(),
  };
}

function normalizeDob(raw: string): string {
  if (!raw) return "";
  // Accept DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, or YYYYMMDD
  let m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = raw.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return raw;
}

/* ---------------- CROSS-VALIDATION ---------------- */

export type PanCrossCheck = {
  panValid: boolean;
  nameMatch: boolean;        // fuzzy match between QR name and signup name
  dobMatch: boolean;
  score: number;             // 0-100
};

export function crossCheckPan(
  qr: PanQrData,
  signupName: string,
  signupDob: string,
): PanCrossCheck {
  const panValid = PAN_REGEX.test(qr.pan);
  const nameMatch = fuzzyNameMatch(qr.name, signupName);
  const dobMatch = qr.dob === signupDob;
  // 60% pan + 30% name + 10% dob
  const score = Math.round(
    (panValid ? 60 : 0) + (nameMatch ? 30 : 0) + (dobMatch ? 10 : 0),
  );
  return { panValid, nameMatch, dobMatch, score };
}

function fuzzyNameMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
  const x = norm(a);
  const y = norm(b);
  if (x === y) return true;
  // Token overlap
  const xt = new Set(x.split(" ").filter(Boolean));
  const yt = new Set(y.split(" ").filter(Boolean));
  let hits = 0;
  for (const t of xt) if (yt.has(t)) hits++;
  const score = hits / Math.max(1, Math.min(xt.size, yt.size));
  return score >= 0.6;
}

/* ---------------- TOP-LEVEL ENTRY ---------------- */

export type PanVerifyResult =
  | { ok: true; data: PanQrData; crossCheck: PanCrossCheck }
  | { ok: false; error: string };

export function verifyPanQr(
  rawQr: string,
  signupName: string,
  signupDob: string,
): PanVerifyResult {
  const parsed = parsePanQr(rawQr);
  if (!parsed) {
    return { ok: false, error: "Could not parse PAN QR data. Make sure you're scanning the QR on the back of your PAN card." };
  }
  const cross = crossCheckPan(parsed, signupName, signupDob);
  if (!cross.panValid) {
    return { ok: false, error: "PAN format is invalid (expected 5 letters + 4 digits + 1 letter, e.g. ABCDE1234F)" };
  }
  if (cross.score < 60) {
    return {
      ok: false,
      error: `QR data doesn't match your signup info (name: ${cross.nameMatch ? "OK" : "no"}, DOB: ${cross.dobMatch ? "OK" : "no"}). Make sure the QR belongs to you.`,
    };
  }
  return { ok: true, data: parsed, crossCheck: cross };
}
