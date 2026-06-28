/**
 * lib/web-push.ts
 *
 * Minimal VAPID-signed Web Push sender. We use Node's built-in
 * `crypto` module for the ECDSA P-256 signing, so there's no extra
 * npm dependency.
 *
 * Reference: RFC 8292 (Message Encryption for Web Push), RFC 8291
 * (Authenticating Push Notifications), draft-ietf-webpush-vapid.
 *
 * For the encryption (payload), we use aes128gcm as required by
 * modern browsers (Chrome 116+ dropped aesgcm support).
 *
 * Supported endpoints:
 *   - FCM (https://fcm.googleapis.com/...)  — Google Chrome, Firefox
 *   - Mozilla Autopush (https://updates.push.services.mozilla.com/...)
 *   - Apple Web Push (https://api.push.apple.com/...) — note: Apple's
 *     push needs HTTP/2, which is usually only available through
 *     Vercel/Cloudflare/Netlify, not via Node fetch. We try anyway
 *     and gracefully fall back to in-app only on connection errors.
 *
 * For testing, the easiest is to use Chrome or Firefox and verify
 * via the browser DevTools → Application → Service Workers.
 */

import * as crypto from "crypto";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
function getVapidKeys(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  const privateKey = process.env.VAPID_PRIVATE_KEY ?? "";
  const subject    = process.env.VAPID_SUBJECT ?? "mailto:admin@hivr.in";
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

export function isPushConfigured(): boolean {
  return getVapidKeys() !== null;
}

// ---------------------------------------------------------------------------
// VAPID JWT — ES256 (ECDSA P-256 with SHA-256)
// ---------------------------------------------------------------------------
function base64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf) : buf;
  return b.toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64url(s: string): Buffer {
  // Pad to multiple of 4
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function signVapidJwt(aud: string, subject: string, exp: number): { auth: string } {
  const k = getVapidKeys();
  if (!k) throw new Error("VAPID keys not configured");

  const header  = { typ: "JWT", alg: "ES256" };
  const payload = { aud, exp, sub: subject };

  const headerB64  = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  // Reconstruct the EC private key from the raw 32-byte scalar.
  const d = decodeBase64url(k.privateKey);
  const jwk = {
    kty: "EC",
    crv: "P-256",
    d:   d.toString("base64"),
    x:   (() => {
      const pub = decodeBase64url(k.publicKey);
      return Buffer.from(pub.subarray(1, 33)).toString("base64");
    })(),
    y:   (() => {
      const pub = decodeBase64url(k.publicKey);
      return Buffer.from(pub.subarray(33, 65)).toString("base64");
    })(),
  };
  const ec = crypto.createPrivateKey({ key: jwk as any, format: "jwk" });

  const sig = crypto.sign("sha256", Buffer.from(signingInput), ec);
  // Web Crypto / VAPID wants raw R || S (64 bytes), but Node's
  // sign() returns DER. Convert.
  const sigRaw = derToRaw(sig);
  const jwt = `${signingInput}.${base64url(sigRaw)}`;

  return { auth: `vapid t=${jwt}, k=${k.publicKey}` };
}

function derToRaw(der: Buffer): Buffer {
  // DER ECDSA: 0x30 <len> 0x02 <rlen> <r> 0x02 <slen> <s>
  // We strip the DER header and concatenate r and s, each padded to 32 bytes.
  if (der[0] !== 0x30) throw new Error("Not a DER sequence");
  let offset = 2;
  if (der[1] & 0x80) offset += (der[1] & 0x7f);

  // r
  if (der[offset] !== 0x02) throw new Error("Expected INTEGER for r");
  offset++;
  let rLen = der[offset]; offset++;
  if (rLen & 0x80) {
    offset += (rLen & 0x7f);
    rLen = der[offset - 1];
  }
  let r = der.subarray(offset, offset + rLen);
  offset += rLen;
  // strip leading zero if any
  if (r.length > 32 && r[0] === 0) r = r.subarray(1);
  if (r.length < 32)  r = Buffer.concat([Buffer.alloc(32 - r.length), r]);

  // s
  if (der[offset] !== 0x02) throw new Error("Expected INTEGER for s");
  offset++;
  let sLen = der[offset]; offset++;
  if (sLen & 0x80) {
    offset += (sLen & 0x7f);
    sLen = der[offset - 1];
  }
  let s = der.subarray(offset, offset + sLen);
  if (s.length > 32 && s[0] === 0) s = s.subarray(1);
  if (s.length < 32)  s = Buffer.concat([Buffer.alloc(32 - s.length), s]);

  return Buffer.concat([r, s]);
}

// ---------------------------------------------------------------------------
// AES-128-GCM payload encryption (RFC 8188 / draft-ietf-webpush-encryption-04)
// ---------------------------------------------------------------------------
function encryptPayload(
  payload: string,
  p256dh: string,
  auth: string
): { ciphertext: Buffer; salt: Buffer; localPublicKey: Buffer } {
  // 1. Decode the receiver's public key (65 bytes uncompressed).
  const receiverPubRaw = decodeBase64url(p256dh);
  if (receiverPubRaw.length !== 65 || receiverPubRaw[0] !== 0x04) {
    throw new Error("Invalid p256dh: expected 65 bytes uncompressed point");
  }
  const receiverPubJwk = {
    kty: "EC",
    crv: "P-256",
    x: receiverPubRaw.subarray(1, 33).toString("base64"),
    y: receiverPubRaw.subarray(33, 65).toString("base64"),
  };
  const receiverPub = crypto.createPublicKey({ key: receiverPubJwk as any, format: "jwk" });

  // 2. Generate an ephemeral keypair.
  const eph = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const ephPubJwk = eph.publicKey.export({ format: "jwk" }) as { x: string; y: string };
  const ephPubRaw = Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(ephPubJwk.x, "base64"),
    Buffer.from(ephPubJwk.y, "base64"),
  ]);

  // 3. ECDH shared secret.
  const ecdh = crypto.diffieHellman({ privateKey: eph.privateKey, publicKey: receiverPub });

  // 4. Build the auth info (the receiver's auth secret).
  const authInfo = decodeBase64url(auth);

  // 5. Derive IKM via HKDF.
  //    PRK = HMAC-SHA-256(salt=auth_info, IKM=ecdh)
  //    IKM = HKDF-Expand(PRK, info="WebPush: info\x00\x01", L=32)
  const prk = crypto.createHmac("sha256", authInfo).update(ecdh).digest();
  const ikm  = crypto.hkdfSync("sha256", prk, Buffer.alloc(0), Buffer.from("WebPush: info\x00\x00\x01", "binary"), 32);

  // 6. Random salt (16 bytes).
  const salt = crypto.randomBytes(16);

  // 7. Derive the content-encryption key + nonce.
  //    cek = HKDF(salt, ikm, "Content-Encoding: aes128gcm\x00", 16)
  //    nonce = HKDF(salt, ikm, "Content-Encoding: nonce\x00", 12)
  const cek   = crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\x00"), 16);
  const nonce  = crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\x00"), 12);

  // 8. Build the plaintext: padding (0x02 0x70 ...) + record-size (2 bytes BE) + payload.
  const payloadBuf = Buffer.from(payload, "utf8");
  const padded = Buffer.concat([
    Buffer.from([0x02, 0x70, 0x70, 0x70, 0x70, 0x70, 0x70, 0x70, 0x70, 0x70, 0x70, 0x70, 0x70, 0x70, 0x70, 0x70, 0x70, 0x70, 0x70, 0x70, 0x70, 0x70]),
    Buffer.from([(payloadBuf.length >> 8) & 0xff, payloadBuf.length & 0xff]),
    payloadBuf,
  ]);

  // 9. AES-128-GCM encrypt.
  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(padded), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([ciphertext, tag]),
    salt,
    localPublicKey: ephPubRaw,
  };
}

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------
export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, any>;
  /** Time-to-live in seconds. 0 = no TTL (deliver immediately or drop). */
  ttl?: number;
};

export type PushSendResult =
  | { ok: true;  status: number; }
  | { ok: false; status: number; error: string; expired?: boolean; };

export async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload
): Promise<PushSendResult> {
  const k = getVapidKeys();
  if (!k) return { ok: false, status: 0, error: "VAPID not configured" };

  // 1. Determine audience + origin from endpoint.
  let audience: string;
  let origin: string;
  try {
    const u = new URL(subscription.endpoint);
    audience = u.origin;
    origin   = `${u.protocol}//${u.host}`;
  } catch {
    return { ok: false, status: 0, error: "Invalid endpoint URL" };
  }

  // 2. Sign VAPID JWT (exp 12h).
  const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60;
  let authHeader: string;
  try {
    ({ auth: authHeader } = signVapidJwt(audience, k.subject, exp));
  } catch (e) {
    return { ok: false, status: 0, error: `VAPID sign failed: ${(e as Error).message}` };
  }

  // 3. Encrypt the payload.
  let ciphertext: Buffer, salt: Buffer, localPublicKey: Buffer;
  try {
    ({ ciphertext, salt, localPublicKey } = encryptPayload(JSON.stringify(payload), subscription.p256dh, subscription.auth));
  } catch (e) {
    return { ok: false, status: 0, error: `Encrypt failed: ${(e as Error).message}` };
  }

  // 4. Build the aes128gcm Content-Encoding header.
  //    salt (16) || rs (4) || idlen (1) || keyid (localPublicKey.length)
  const rs = 4096;
  const header = Buffer.concat([
    salt,
    Buffer.from([(rs >> 24) & 0xff, (rs >> 16) & 0xff, (rs >> 8) & 0xff, rs & 0xff]),
    Buffer.from([localPublicKey.length]),
    localPublicKey,
  ]);
  const body = Buffer.concat([header, ciphertext]);

  // 5. POST to the push service. Note: HTTP/1.1 is the lowest common
  //    denominator. Apple's endpoint requires HTTP/2 but will likely
  //    succeed over HTTP/1.1 too for small payloads; FCM and Mozilla
  //    work fine.
  const ttl = payload.ttl ?? 60;
  let res: Response;
  try {
    res = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/octet-stream",
        "Content-Encoding":  "aes128gcm",
        "TTL": String(ttl),
        "Urgency": "high",
        "Topic": payload.tag ?? "hivr-default",
      },
      body,
    });
  } catch (e) {
    return { ok: false, status: 0, error: `Network error: ${(e as Error).message}` };
  }

  if (res.ok) return { ok: true, status: res.status };
  if (res.status === 404 || res.status === 410) {
    return { ok: false, status: res.status, error: "Subscription expired", expired: true };
  }
  return { ok: false, status: res.status, error: `Push service returned ${res.status}` };
}

/**
 * Send a push to every active subscription for a user. Best-effort —
 * dead subscriptions are pruned in the same call. Returns a summary.
 */
export async function sendWebPushToUser(
  admin: ReturnType<typeof import("./supabase/admin").createAdminClient>,
  userId: string,
  payload: PushPayload
): Promise<{ sent: number; failed: number; pruned: number }> {
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, failure_count")
    .eq("user_id", userId);

  let sent = 0, failed = 0, pruned = 0;

  for (const s of (subs ?? []) as any[]) {
    const result = await sendWebPush(
      { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
      payload
    );
    if (result.ok) {
      sent++;
      await admin.from("push_subscriptions")
        .update({ last_used_at: new Date().toISOString(), failure_count: 0 })
        .eq("id", s.id);
    } else {
      failed++;
      if (result.expired) {
        await admin.from("push_subscriptions").delete().eq("id", s.id);
        pruned++;
      } else {
        // Bump failure count; prune at >= 5 failures
        const newCount = (s.failure_count ?? 0) + 1;
        if (newCount >= 5) {
          await admin.from("push_subscriptions").delete().eq("id", s.id);
          pruned++;
        } else {
          await admin.from("push_subscriptions")
            .update({ failure_count: newCount })
            .eq("id", s.id);
        }
      }
    }
  }

  return { sent, failed, pruned };
}
