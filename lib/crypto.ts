import crypto from "node:crypto";

const DEFAULT_COST_FACTOR = 16384;
const KEY_LENGTH = 64;
const SALT_BYTES = 32;

export class CryptoError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
    this.name = "CryptoError";
  }
}

function scryptPromise(
  password: crypto.BinaryLike,
  salt: crypto.BinaryLike,
  keylen: number,
  options: crypto.ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

/**
 * Hash a password using scrypt. Returns a URL-safe base64 string
 * that encodes: costFactor (4 bytes) + salt (32 bytes) + hash (64 bytes).
 *
 * The encoded format is self-describing (cost+nacl+salt+hash) so we don't
 * need a separate DB column for the salt.
 */
export async function hashPassword(
  password: string,
  costFactor = DEFAULT_COST_FACTOR,
): Promise<string> {
  const salt = crypto.randomBytes(SALT_BYTES);
  const hash = await scryptPromise(password, salt, KEY_LENGTH, {
    N: costFactor,
    r: 8,
    p: 1,
    maxmem: 128 * 1024 * 1024,
  });

  const header = Buffer.alloc(4);
  header.writeUInt32BE(costFactor, 0);

  return Buffer.concat([header, salt, hash]).toString("base64url");
}

/**
 * Verify a password against a scrypt hash produced by `hashPassword`.
 */
export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  let buf: Buffer;
  try {
    buf = Buffer.from(encoded, "base64url");
  } catch {
    return false;
  }

  if (buf.length < 4 + SALT_BYTES + KEY_LENGTH) {
    return false;
  }

  const costFactor = buf.readUInt32BE(0);
  const salt = buf.subarray(4, 4 + SALT_BYTES);
  const storedHash = buf.subarray(4 + SALT_BYTES, 4 + SALT_BYTES + KEY_LENGTH);

  const computedHash = await scryptPromise(password, salt, KEY_LENGTH, {
    N: costFactor,
    r: 8,
    p: 1,
    maxmem: 128 * 1024 * 1024,
  });

  if (computedHash.length !== storedHash.length) return false;
  return crypto.timingSafeEqual(computedHash, storedHash);
}

/**
 * Generate a random 6-digit numeric code (for email OTP).
 */
export function generateOtpCode(): string {
  const buf = crypto.randomBytes(4);
  const num = buf.readUInt32BE(0) % 1_000_000;
  return num.toString().padStart(6, "0");
}

/**
 * Hash an OTP code for storage (SHA-256 of the code).
 * The OTP is short-lived (10 min TTL) and rate-limited, so SHA-256 is
 * sufficient — we don't need scrypt latency for OTP verification.
 */
export function hashOtpCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

/**
 * Constant-time comparison for strings. Uses Buffer under the hood
 * to leverage crypto.timingSafeEqual.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}

/**
 * Generate an anonymous display ID from the sequence number.
 */
export function anonymousDisplayId(seq: number): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let encoded = "";
  let n = seq;
  while (n > 0) {
    encoded = chars[n % chars.length] + encoded;
    n = Math.floor(n / chars.length);
  }
  if (!encoded) encoded = "A";
  return `Top Pro #${encoded}`;
}
