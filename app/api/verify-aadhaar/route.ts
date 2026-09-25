import { NextResponse } from "next/server";
import crypto from "crypto";
import zlib from "zlib";
import { Jimp } from "jimp";
import jsqr from "jsqr";

/* ---------- UIDAI offline public key for Secure QR verification ---------- */

// From uidai_offline_publickey_2026.cer (valid until Feb 2029).
// This is the official UIDAI cert for validating the digital signature of
// Aadhaar Paperless Offline e-KYC and Secure QR Code. See:
//   https://uidai.gov.in/en/916-developer-section/data-and-downloads-section/19388-uidai-certificate-details-2.html
const UIDAI_SPKI_B64 =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAh1+zYnvbcEm0Yz73s5u42odpUJMr9wv5bVw7sOE5nFNbrB+U++5I0f8cL2HoHnJOkwvLZzrD0jG/vxAKi6vii/gjEzUEgrkdIHxMP3D6GJs0MSQHiEXvIGOwPIH3BLtBOc3m28NVNT6Q9iq0gUwuxnlhV38UdNhCllqNYhWmAMPJkImgaKrRZvY2pWNs6gd+PlAF/9SO69x3+1meA8kPk2ZvQanZlx9tfaExeOe9or3NQiKy2+UbtXrpcoAfYbbWi1OUzXi5bJdhbGp239c1fX6UKyUM5IUMY+m3I7wu2WQ7lmeO2n/vwzQz/PKHXPWYu3bydWMLdCi07vOQBqzCKwIDAQAB";

function uidaiPublicKey() {
  const pem = [
    "-----BEGIN PUBLIC KEY-----",
    ...(UIDAI_SPKI_B64.match(/.{1,64}/g) ?? []),
    "-----END PUBLIC KEY-----",
  ].join("\n");
  return crypto.createPublicKey(pem);
}

/* ---------- Helpers ---------- */

interface ParsedAadhaar {
  name: string;
  dob: string;
  gender: string | null;
  address: string | null;
  photoBase64: string | null;
  aadhaarLast4: string;
}

function looksLikeXml(s: string) {
  const t = s.trim();
  return t.startsWith("<?xml") || t.includes("<PrintLetterBarcodeData");
}

function looksLikeAadhaarNumeric(s: string) {
  return /^\d{100,}$/.test(s.trim());
}

/* ---------- V3 — XML format ---------- */

function parseXmlFields(xmlStr: string): ParsedAadhaar {
  const get = (tag: string) => {
    const m = xmlStr.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
    return m ? m[1].trim() : null;
  };
  const uid = get("uid") || "";
  return {
    name: get("name") || get("Name") || "",
    dob: get("dob") || get("DOB") || "",
    gender: get("gender") || get("Gender") || null,
    address: get("address") || get("Address") || null,
    photoBase64: get("photo") || get("Photo") || null,
    aadhaarLast4: uid.length >= 4 ? uid.slice(-4) : "",
  };
}

function extractSignatureFromXml(xmlStr: string): { dataBlock: Buffer; signatureBlock: Buffer } | null {
  const sigMatch = xmlStr.match(/<Signature>([^<]*)<\/Signature>/);
  if (!sigMatch) return null;
  const dataBlock = Buffer.from(xmlStr.replace(/<Signature>[^<]*<\/Signature>/, "").trim(), "utf8");
  const signatureBlock = Buffer.from(sigMatch[1].trim(), "base64");
  return { dataBlock, signatureBlock };
}

/* ---------- V2 — Numeric BigInt format ---------- */

function parseNumericQr(qrData: string): {
  dataBlock: Buffer;
  signatureBlock: Buffer;
} {
  const bigInt = BigInt(qrData.trim());
  let hex = bigInt.toString(16);
  if (hex.length % 2 === 1) hex = "0" + hex;
  for (let pad = 0; pad <= 32; pad++) {
    const padded = "00".repeat(pad) + hex;
    const compressed = Buffer.from(padded, "hex");
    for (const method of ["gunzip", "inflateRaw"] as const) {
      try {
        const decompressed = method === "gunzip"
          ? zlib.gunzipSync(compressed)
          : zlib.inflateRawSync(compressed);
        if (decompressed.length < 257) continue;
        // Strategy A: find the 0xFF delimiter 256 bytes from the end.
        // UIDAI signs everything INCLUDING the trailing 0xFF delimiter
        // before the 256-byte signature. The signature is the last 256 bytes.
        const sigPos = decompressed.length - 257;
        if (decompressed[sigPos] === 0xff) {
          return {
            dataBlock: decompressed.subarray(0, sigPos + 1),
            signatureBlock: decompressed.subarray(sigPos + 1),
          };
        }
        // Strategy B: last 256 bytes as signature (fallback for older formats).
        return {
          dataBlock: decompressed.subarray(0, decompressed.length - 256),
          signatureBlock: decompressed.subarray(decompressed.length - 256),
        };
      } catch {}
    }
  }
  throw new Error("Failed to decompress QR data — could not decompress with gzip or inflate.");
}

function parseDecompressedFields(decompressed: Buffer): ParsedAadhaar {
  // e-Aadhaar numeric QR uses 0xFF as field separator (V5 format).
  // V5 field layout (per UIDAI Secure QR spec & reference implementation):
  //   [0]="V5" [1]=flags [2]=ref_id [3]=name [4]=dob [5]=gender
  //   [6]=care_of [7]=district [8]=landmark [9]=house [10]=location
  //   [11]=pincode [12]=post_office [13]=state [14]=street
  //   [15]=sub_district [16]=vtc [17]=aadhaar_last4 (masked)
  //   [18..19]=mobile/email (optional, per flags) [20+]=photo binary
  const parts = [];
  let start = 0;
  for (let i = 0; i < decompressed.length; i++) {
    if (decompressed[i] === 0xff) {
      parts.push(decompressed.toString("utf8", start, i));
      start = i + 1;
    }
  }
  parts.push(decompressed.toString("utf8", start));
  const uid = parts[2] || "";
  const name = parts[3] || "";
  const dob = parts[4] || "";
  const gender = parts[5] || null;

  // Address = fields 6-16 (care_of through vtc)
  const addressParts = parts.slice(6, 17).filter(Boolean);
  const address = addressParts.length > 0 ? addressParts.join(", ") : null;
  // Aadhaar last 4 is in the reference_id prefix (parts[2]).
  // Format: [last4 digits][YYYYMMDDHHMMSS][random] per UIDAI offline e-KYC spec.
  let aadhaarLast4 = "";
  const refId = parts[2]?.trim() || "";
  if (refId.length >= 4) aadhaarLast4 = refId.slice(0, 4);
  // Photo is the last field before trailing 0xFF (ends with "/9j" for JPEG or "iVBOR" for PNG)
  let photoBase64: string | null = null;
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i].trim();
    if (p.startsWith("/9j") || p.startsWith("iVBOR")) {
      photoBase64 = p;
      break;
    }
  }
  return { name, dob, gender, address, photoBase64, aadhaarLast4 };
}

/* ---------- Verify from raw QR string ---------- */

function verifyFromQrString(qrData: string): { data: ParsedAadhaar; verified: boolean } {
  let dataBlock: Buffer;
  let signatureBlock: Buffer;
  let parsed: ParsedAadhaar;

  if (looksLikeXml(qrData)) {
    const sig = extractSignatureFromXml(qrData);
    if (!sig) throw new Error("XML format but no <Signature> element found.");
    dataBlock = sig.dataBlock;
    signatureBlock = sig.signatureBlock;
    parsed = parseXmlFields(qrData);
  } else if (looksLikeAadhaarNumeric(qrData)) {
    const p = parseNumericQr(qrData);
    dataBlock = p.dataBlock;
    signatureBlock = p.signatureBlock;
    parsed = parseDecompressedFields(dataBlock);
  } else {
    throw new Error("Unrecognised Aadhaar QR format. Expected XML or numeric BigInt.");
  }

  const key = uidaiPublicKey();
  const verified = crypto.verify("sha256", dataBlock, key, signatureBlock);

  return { data: parsed, verified };
}

/* ---------- Image Otsu binarization (sharpens QR module edges) ---------- */

function otsuBinarize(img: Jimp): Jimp {
  const d = img.bitmap.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = g | 0;
  }
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) hist[d[i]]++;
  const total = d.length / 4;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, maxV = 0, threshold = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const v = wB * wF * (mB - mF) * (mB - mF);
    if (v > maxV) { maxV = v; threshold = i; }
  }
  for (let i = 0; i < d.length; i += 4) {
    const val = d[i] > threshold ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = val;
  }
  return img;
}

/* ---------- Route ---------- */

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";

    // ---------- FormData: file upload (image or PDF rendered to image) ----------
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ success: false, message: "No file uploaded." }, { status: 400 });
      }

      const buf = Buffer.from(await file.arrayBuffer());
      console.log("[verify-aadhaar] Upload: type=%s size=%d", file.type, buf.length);
      const image = await Jimp.read(buf);
      const ow = image.bitmap.width;
      const oh = image.bitmap.height;
      console.log("[verify-aadhaar] Image: %dx%d", ow, oh);



      function scan(img: Jimp, label: string) {
        const result = jsqr(new Uint8ClampedArray(img.bitmap.data), img.bitmap.width, img.bitmap.height);
        if (result) {
          console.log("[verify-aadhaar] QR FOUND in \"%s\" (%dx%d) len=%d preview=%s",
            label, img.bitmap.width, img.bitmap.height,
            result.data.length, result.data.slice(0, 60));
        }
        return result;
      }

      // Grid of overlapping crop positions spanning the entire image.
      const cropDefs = [
        { l: 0.00, t: 0.00, w: 0.50, h: 0.50 }, // top-left
        { l: 0.50, t: 0.00, w: 0.50, h: 0.50 }, // top-right
        { l: 0.00, t: 0.50, w: 0.50, h: 0.50 }, // bottom-left
        { l: 0.33, t: 0.33, w: 0.34, h: 0.34 }, // center
        { l: 0.50, t: 0.50, w: 0.50, h: 0.50 }, // bottom-right
        { l: 0.50, t: 0.55, w: 0.45, h: 0.40 }, // bottom-right tight (e-Aadhaar PDF)
        { l: 0.60, t: 0.60, w: 0.40, h: 0.40 }, // corner tight
        { l: 0.00, t: 0.50, w: 1.00, h: 0.50 }, // lower half
        { l: 0.50, t: 0.00, w: 0.50, h: 1.00 }, // right half
        { l: 0.15, t: 0.25, w: 0.70, h: 0.55 }, // center-wide
        { l: 0.55, t: 0.00, w: 0.40, h: 0.45 }, // top-right
        { l: 0.00, t: 0.65, w: 1.00, h: 0.35 }, // bottom strip
        { l: 0.40, t: 0.40, w: 0.60, h: 0.60 }, // right-bottom expanding
      ];

      let qrCode: { data: string } | null = null;
      for (const binarize of [false, true]) {
        const name = binarize ? "binarized" : "raw";
        const base = binarize ? otsuBinarize(image.clone()) : image;
        qrCode = scan(base, "full " + name);
        if (qrCode) break;
        for (const c of cropDefs) {
          const cx = Math.floor(c.l * ow), cy = Math.floor(c.t * oh);
          const cw = Math.floor(c.w * ow), ch = Math.floor(c.h * oh);
          const cropped = image.clone().crop({ x: cx, y: cy, w: cw, h: ch });
          const candidate = binarize ? otsuBinarize(cropped) : cropped;
          qrCode = scan(candidate, `${name} crop(${(c.l*100).toFixed(0)}%,${(c.t*100).toFixed(0)}% ${(c.w*100).toFixed(0)}%x${(c.h*100).toFixed(0)}%)`);
          if (qrCode) break;
        }
        if (qrCode) break;
      }
      // If QR still not found, crop to probable regions and upscale with
      // bilinear interpolation. Smooth upscaling spreads small QR modules
      // enough for jsQR's finder pattern detection (nearest-neighbor
      // pixel duplication doesn't help small module sizes).
      if (!qrCode) {
        const regions = [
          [0.75, 0.65, 0.25, 0.35], // bottom-right tight (e-Aadhaar QR)
          [0.70, 0.60, 0.30, 0.40], // bottom-right wide
          [0.50, 0.50, 0.50, 0.50], // bottom-right half
        ] as const;
        for (const [l, t, w, h] of regions) {
          const cx = Math.floor(l * ow), cy = Math.floor(t * oh);
          const cw = Math.max(100, Math.floor(w * ow)), ch = Math.max(100, Math.floor(h * oh));
          const cropped = image.clone().crop({ x: cx, y: cy, w: cw, h: ch });
          for (const scale of [2, 3, 4]) {
            const up = cropped.clone().resize({ w: cw * scale, h: ch * scale, mode: 'bilinearInterpolation' });
            qrCode = scan(up, `${scale}x crop(${(l*100).toFixed(0)}%,${(t*100).toFixed(0)}%)`);
            if (qrCode) break;
          }
          if (qrCode) break;
        }
      }

      if (!qrCode) {
        // Check if fallback form fields were included
        const fbName = form.get("name") as string | null;
        const fbDob = form.get("dob") as string | null;
        const fbLast4 = form.get("aadhaarLast4") as string | null;
        if (fbName && fbDob && fbLast4) {
          return NextResponse.json({
            success: true,
            verified: false,
            data: { name: fbName, dob: fbDob, gender: null, address: null, photoBase64: null, aadhaarLast4: fbLast4 },
            qrData: `FALLBACK|${fbName}|${fbDob}|${fbLast4}`,
          });
        }
        return NextResponse.json(
          { success: false, message: "No QR code found in the image. Try a clearer photo or use 'Enter manually'." },
          { status: 400 },
        );
      }

      const { data, verified } = verifyFromQrString(qrCode.data);
      if (!verified) {
        console.warn("[verify-aadhaar] QR decoded but signature could not be verified. data.length=%d preview=%s",
          qrCode.data.length, qrCode.data.slice(0, 80));
      }
      return NextResponse.json({ success: true, verified, data, qrData: qrCode.data });
    }

    // ---------- JSON: { qrData: string } (manual paste or client-decoded QR) ----------
    const body = await req.json();
    const qrData: string = body?.qrData?.trim();

    // Handle fallback data
    const fb = body?.fallback;
    if (fb?.name && fb?.dob && fb?.aadhaarLast4) {
      return NextResponse.json({
        success: true,
        verified: false,
        data: { name: fb.name, dob: fb.dob, gender: null, address: null, photoBase64: null, aadhaarLast4: fb.aadhaarLast4 },
        qrData: `FALLBACK|${fb.name}|${fb.dob}|${fb.aadhaarLast4}`,
      });
    }

    if (!qrData) {
      return NextResponse.json({ success: false, message: "No QR data provided." }, { status: 400 });
    }

    const { data, verified } = verifyFromQrString(qrData);
    if (!verified) {
      console.warn("[verify-aadhaar] QR decoded (JSON) but signature could not be verified.");
    }
    return NextResponse.json({ success: true, verified, data, qrData });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ success: false, message: msg }, { status: 400 });
  }
}
