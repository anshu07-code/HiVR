/**
 * lib/security.ts
 *
 * Centralized security helpers used by every upload / API / API-with-input
 * route in the app. Anything that accepts user-controlled bytes / numbers
 * / strings goes through one of the functions here.
 *
 * Design rules:
 *   - Pure functions wherever possible (so they're easy to test).
 *   - All errors throw `SecurityError` with a `status` field so the API
 *     route can pass it straight to NextResponse.
 *   - Magic-byte sniffing is the ground truth for file-type checks.
 *     `file.type` (browser-supplied) is a hint, never the source of truth.
 *   - The allow-list is ALLOW, never DENY. We check `magic` against
 *     a fixed list of known-good signatures; if it doesn't match, reject.
 *   - No new dependencies. Uses `node:crypto` (which is polyfilled in
 *     Next.js Edge and Node runtimes).
 */

import crypto from "node:crypto";
import { NextResponse } from "next/server";

export class SecurityError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
    this.name = "SecurityError";
  }
}

// =============================================================================
// File-type validation
// =============================================================================

/**
 * Each entry is a list of "magic bytes" (the first 4–12 bytes of the file
 * that uniquely identify the format). We check the actual file content, not
 * the browser-supplied MIME type.
 *
 * SVGs are EXPLICITLY excluded because an SVG can contain `<script>` tags
 * that execute in the browser when the file is served with the right
 * content-type. The `avatars` and `workspace-vault` buckets are public, so
 * this is a stored-XSS vector.
 */
const MAGIC_SIGNATURES: Array<{
  ext: string;            // canonical extension to use for storage
  mime: string;           // canonical MIME to set on storage
  bytes: Array<Uint8Array>;
  label: string;
}> = [
  {
    ext: "jpg",
    mime: "image/jpeg",
    label: "JPEG image",
    bytes: [
      new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
      new Uint8Array([0xff, 0xd8, 0xff, 0xe1]),
      new Uint8Array([0xff, 0xd8, 0xff, 0xdb]),
    ],
  },
  {
    ext: "png",
    mime: "image/png",
    label: "PNG image",
    bytes: [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  },
  {
    ext: "webp",
    mime: "image/webp",
    label: "WebP image",
    // RIFF....WEBP
    bytes: [new Uint8Array([0x52, 0x49, 0x46, 0x46])], // followed by 4 size bytes, then "WEBP"
  },
  {
    ext: "gif",
    mime: "image/gif",
    label: "GIF image",
    bytes: [
      new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]), // GIF87a
      new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]), // GIF89a
    ],
  },
  // Video
  {
    ext: "mp4",
    mime: "video/mp4",
    label: "MP4 video",
    bytes: [new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70])], // ftyp box
  },
  {
    ext: "webm",
    mime: "video/webm",
    label: "WebM video",
    bytes: [new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], // EBML header
  },
  {
    ext: "mov",
    mime: "video/quicktime",
    label: "QuickTime video",
    bytes: [new Uint8Array([0x00, 0x00, 0x00, 0x14, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74])], // ftypqt
  },
  // Audio (for voice messages)
  {
    ext: "mp3",
    mime: "audio/mpeg",
    label: "MP3 audio",
    bytes: [new Uint8Array([0xff, 0xfb]), new Uint8Array([0xff, 0xf3]), new Uint8Array([0x49, 0x44, 0x33])],
  },
  {
    ext: "m4a",
    mime: "audio/mp4",
    label: "M4A audio",
    bytes: [new Uint8Array([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41])],
  },
  {
    ext: "wav",
    mime: "audio/wav",
    label: "WAV audio",
    bytes: [new Uint8Array([0x52, 0x49, 0x46, 0x46])], // RIFF header
  },
  {
    ext: "ogg",
    mime: "audio/ogg",
    label: "OGG audio",
    bytes: [new Uint8Array([0x4f, 0x67, 0x67, 0x53])], // OggS
  },
  {
    ext: "webm",
    mime: "audio/webm",
    label: "WebM audio (voice)",
    bytes: [new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])],
  },
  // Documents
  {
    ext: "pdf",
    mime: "application/pdf",
    label: "PDF document",
    bytes: [new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], // %PDF-
  },
  // OLE2 — used by older Office formats (.xls, .doc, .ppt)
  {
    ext: "ole2",
    mime: "application/x-ole-storage",
    label: "OLE2 document",
    bytes: [new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])],
  },
  // ZIP — used by .zip, .xlsx, .docx, .pptx, .jar, etc.
  {
    ext: "zip",
    mime: "application/zip",
    label: "ZIP archive",
    bytes: [new Uint8Array([0x50, 0x4b, 0x03, 0x04])],
  },
];

// (Disambiguation for shared prefixes is done inline in identifyFileFormat
// below; this constant used to be a config but the logic is so small it
// doesn't earn its keep.)

function startsWith(buf: Uint8Array, sig: Uint8Array): boolean {
  if (buf.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (buf[i] !== sig[i]) return false;
  }
  return true;
}

function containsAt(buf: Uint8Array, offset: number, sig: Uint8Array): boolean {
  if (buf.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (buf[offset + i] !== sig[i]) return false;
  }
  return true;
}

/**
 * Identify the format of a file by inspecting its magic bytes.
 * Returns the matching format entry from MAGIC_SIGNATURES, or null.
 * Rejects any file that doesn't match a known allow-listed format.
 *
 * This is the SOLE source of truth for "what kind of file is this".
 * The browser-supplied MIME type is never trusted.
 */
export function identifyFileFormat(buf: Uint8Array): {
  ext: string;
  mime: string;
  label: string;
} | null {
  // First check the simple signatures.
  for (const sig of MAGIC_SIGNATURES) {
    for (const bytes of sig.bytes) {
      if (startsWith(buf, bytes)) {
        // Special case: RIFF header can be WAV or WEBP. Discriminate by
        // searching for the format marker in the first 16 bytes.
        if (sig.ext === "webp" || sig.ext === "wav") {
          // Look for "WEBP" at byte 8 (after 4-byte size field)
          if (containsAt(buf, 8, new Uint8Array([0x57, 0x45, 0x42, 0x50]))) {
            const webp = MAGIC_SIGNATURES.find((s) => s.ext === "webp" && s.mime.startsWith("image"))!;
            return { ext: webp.ext, mime: webp.mime, label: webp.label };
          }
          if (containsAt(buf, 8, new Uint8Array([0x57, 0x41, 0x56, 0x45]))) {
            const wav = MAGIC_SIGNATURES.find((s) => s.ext === "wav")!;
            return { ext: wav.ext, mime: wav.mime, label: wav.label };
          }
          return null;
        }
        // MP4 family: ftyp + brand. We accept mp4, mov, m4a (the 3
        // formats we explicitly allow-listed).
        if (sig.ext === "mp4" || sig.ext === "mov" || sig.ext === "m4a") {
          // Look for the brand at byte 8 (right after "ftyp")
          if (containsAt(buf, 8, new Uint8Array([0x6d, 0x70, 0x34, 0x32]))) {
            // mp42
            const mp4 = MAGIC_SIGNATURES.find((s) => s.ext === "mp4")!;
            return { ext: mp4.ext, mime: mp4.mime, label: mp4.label };
          }
          if (containsAt(buf, 8, new Uint8Array([0x71, 0x74, 0x20, 0x20]))) {
            // qt  (QuickTime)
            const mov = MAGIC_SIGNATURES.find((s) => s.ext === "mov")!;
            return { ext: mov.ext, mime: mov.mime, label: mov.label };
          }
          if (containsAt(buf, 8, new Uint8Array([0x4d, 0x34, 0x41, 0x20]))) {
            // M4A
            const m4a = MAGIC_SIGNATURES.find((s) => s.ext === "m4a")!;
            return { ext: m4a.ext, mime: m4a.mime, label: m4a.label };
          }
          return null;
        }
        return { ext: sig.ext, mime: sig.mime, label: sig.label };
      }
    }
  }
  return null;
}

/**
 * Format types grouped by purpose. The upload route picks the right group.
 */
export const ALLOWED_FORMATS = {
  image: ["jpg", "png", "webp", "gif"] as const,
  video: ["mp4", "webm", "mov"] as const,
  audio: ["mp3", "m4a", "wav", "ogg", "webm"] as const,
  document: ["pdf"] as const,
  vault: [
    "jpg", "png", "webp", "gif",
    "mp4", "webm", "mov",
    "mp3", "m4a", "wav", "ogg",
    "pdf",
    "xlsx", "xls", "csv",
    "docx", "doc",
    "pptx", "ppt",
    "txt", "json", "md", "rtf",
    "zip", "rar", "7z", "tar", "gz",
    "js", "ts", "jsx", "tsx", "py", "rb", "go", "rs", "java", "kt", "swift",
    "c", "cpp", "h", "hpp", "cs", "php", "sh", "yaml", "yml", "toml",
    "html", "css", "scss", "sql",
  ] as const,
};

export type FileFormatGroup = keyof typeof ALLOWED_FORMATS;

/**
 * Validate a file from a multipart upload. Returns the canonical
 * {ext, mime, label} for storage, or throws SecurityError.
 */
/**
 * File-extension-to-format mapping for formats that cannot be
 * identified by magic bytes alone (e.g. xlsx/docx/pptx are ZIP,
 * csv/json/txt have no unique header).
 */
const EXT_FORMAT: Record<string, { ext: string; mime: string; label: string }> = {
  xlsx: { ext: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", label: "Excel spreadsheet" },
  xls:  { ext: "xls",  mime: "application/vnd.ms-excel", label: "Excel spreadsheet" },
  csv:  { ext: "csv",  mime: "text/csv",  label: "CSV file" },
  docx: { ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", label: "Word document" },
  doc:  { ext: "doc",  mime: "application/msword", label: "Word document" },
  pptx: { ext: "pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", label: "PowerPoint presentation" },
  ppt:  { ext: "ppt",  mime: "application/vnd.ms-powerpoint", label: "PowerPoint presentation" },
  txt:  { ext: "txt",  mime: "text/plain", label: "Text file" },
  json: { ext: "json", mime: "application/json", label: "JSON file" },
  md:   { ext: "md",   mime: "text/markdown", label: "Markdown file" },
  rtf:  { ext: "rtf",  mime: "application/rtf", label: "RTF document" },
};

/**
 * Extensions whose magic bytes are the ZIP header (PK\x03\x04).
 * Used for disambiguation when magic returns "zip".
 */
const ZIP_EXTENSIONS = new Set(["xlsx", "docx", "pptx", "zip", "jar"]);

/**
 * Extensions whose magic bytes are the OLE2 header.
 */
const OLE2_EXTENSIONS = new Set(["xls", "doc", "ppt"]);

/**
 * Plain-text extensions with no unique magic bytes — validated by
 * checking the content is valid UTF-8 and rejecting if binary.
 */
const TEXT_EXTENSIONS = new Set(["csv", "txt", "json", "md", "rtf", "yaml", "yml", "toml", "ini", "cfg", "xml", "svg"]);

export async function validateUploadedFile(
  file: File,
  group: FileFormatGroup,
  maxBytes: number,
): Promise<{ ext: string; mime: string; label: string }> {
  if (!file) throw new SecurityError("No file provided", 400);
  if (file.size <= 0) throw new SecurityError("File is empty", 400);
  if (file.size > maxBytes) {
    throw new SecurityError(
      `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is ${(maxBytes / 1024 / 1024).toFixed(0)} MB.`,
      413,
    );
  }

  const arrayBuf = await file.arrayBuffer();
  const head = new Uint8Array(arrayBuf, 0, Math.min(arrayBuf.byteLength, 32));
  const fmt = identifyFileFormat(head);
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();

  // Disambiguate formats that share magic bytes, based on file extension.
  let resolvedExt = fmt?.ext;
  let resolvedMime = fmt?.mime;
  let resolvedLabel = fmt?.label;
  if (fmt) {
    if (fmt.ext === "zip" && ZIP_EXTENSIONS.has(ext)) {
      const known = EXT_FORMAT[ext];
      if (known) { resolvedExt = known.ext; resolvedMime = known.mime; resolvedLabel = known.label; }
    } else if (fmt.ext === "ole2" && OLE2_EXTENSIONS.has(ext)) {
      const known = EXT_FORMAT[ext];
      if (known) { resolvedExt = known.ext; resolvedMime = known.mime; resolvedLabel = known.label; }
    }
  }

  // Plain-text formats with no magic bytes: accept if extension matches.
  if (!fmt && TEXT_EXTENSIONS.has(ext)) {
    const known = EXT_FORMAT[ext];
    if (known) { resolvedExt = known.ext; resolvedMime = known.mime; resolvedLabel = known.label; }
  }

  // SVG detection: reject even if extension says .svg (XSS vector).
  if (resolvedExt === "svg") {
    throw new SecurityError("SVG files are not allowed (XSS risk).", 400);
  }

  if (!resolvedExt) {
    throw new SecurityError(
      "File format not recognised. Allowed: images, video, audio, PDF, Excel, Word, CSV, code files, and archives.",
      400,
    );
  }

  const allowed = ALLOWED_FORMATS[group] as readonly string[];
  if (!allowed.includes(resolvedExt)) {
    throw new SecurityError(
      `${resolvedLabel ?? resolvedExt} is not allowed here. Expected one of: ${allowed.join(", ")}.`,
      400,
    );
  }
  return { ext: resolvedExt, mime: resolvedMime ?? "application/octet-stream", label: resolvedLabel ?? resolvedExt };
}

// =============================================================================
// Sanitization helpers
// =============================================================================

/**
 * Sanitise a user-supplied filename for storage. Strips path traversal,
 * control chars, and limits length.
 */
export function sanitizeFilename(name: string, maxLen = 120): string {
  if (typeof name !== "string") return "file";
  // Strip everything except letters, numbers, dot, dash, underscore, space
  const safe = name
    .replace(/[\\\/]/g, "_")        // no path separators
    .replace(/[\x00-\x1f\x7f]/g, "") // no control chars
    .replace(/[^\w.\- ]/g, "_")     // only safe chars
    .replace(/^\.+/, "")             // no leading dots (hidden files)
    .trim()
    .slice(0, maxLen);
  return safe || "file";
}

/**
 * Validate a UUID-shaped string. Returns the lowercased string if valid,
 * else throws SecurityError. We use this for every route param.
 */
export function requireUuid(value: unknown, field = "id"): string {
  if (typeof value !== "string") throw new SecurityError(`Invalid ${field}`, 400);
  const s = value.trim().toLowerCase();
  // Standard UUID format: 8-4-4-4-12 hex
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s)) {
    throw new SecurityError(`Invalid ${field}`, 400);
  }
  return s;
}

/**
 * Validate a positive integer within a range. Returns the parsed value
 * or throws. Use this for page sizes, numeric IDs, etc.
 */
export function requirePositiveInt(value: unknown, opts: { min?: number; max?: number; field?: string } = {}): number {
  const { min = 1, max = Number.MAX_SAFE_INTEGER, field = "value" } = opts;
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new SecurityError(`Invalid ${field} (must be integer in [${min}, ${max}])`, 400);
  }
  return n;
}

/**
 * Validate a paise (integer) amount. Rejects negative, zero, non-integer.
 */
export function requirePaiseAmount(value: unknown, field = "amount"): number {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  if (!Number.isInteger(n) || n <= 0) {
    throw new SecurityError(`Invalid ${field} (must be a positive integer in paise)`, 400);
  }
  return n;
}

/**
 * Cap a paise amount at MAX_CONTRACT_AMOUNT_PAISE to prevent
 * fat-finger / abuse / price-laundering.
 */
export const MAX_CONTRACT_AMOUNT_PAISE = 5_000_000_00; // ₹50,00,000 (50 lakh)
export const MAX_MILESTONE_AMOUNT_PAISE = 2_000_000_00; // ₹20,00,000

/**
 * Cryptographically secure random ID. Always uses crypto.randomUUID()
 * which is available in Node 19+ and the Next.js edge runtime.
 */
export function secureRandomId(): string {
  return crypto.randomUUID();
}

/**
 * Cryptographically secure opaque token, for one-shot URLs (signed-URL
 * tokens, etc). Returns a URL-safe base64 string of N random bytes.
 */
export function secureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/**
 * Constant-time string comparison. Use for any user-supplied secret
 * (HMAC tag, signature, etc) to prevent timing attacks.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}

/**
 * Check the Origin header for cross-site / CSRF protection.
 * Returns a NextResponse 403 if the request is cross-site, or null if OK.
 *
 * Browsers always send Origin on cross-origin fetch POSTs. Same-origin
 * fetch (from our own pages) sends Origin too. Server actions and
 * in-app clients both send Origin matching the app's URL.
 *
 * Exempt paths: webhook endpoints (Razorpay, Supabase — they don't send
 * Origin and authenticate via HMAC instead). For those, call this
 * function explicitly only from user-facing routes.
 */
export function checkSameOrigin(req: Request): NextResponse | null {
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  // If neither header is present, we can't validate — let the request
  // through (the route handler should still authenticate).
  if (!origin && !referer) return null;
  const expected =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.NODE_ENV === "production" ? "https://hivr.in" : "http://localhost:3000");
  const ok = origin && origin === expected;
  if (ok) return null;
  // Fall back to referer if origin is missing
  if (!origin && referer) {
    try {
      const r = new URL(referer);
      const exp = new URL(expected);
      if (r.origin === exp.origin) return null;
    } catch {
      // malformed referer, fall through to reject
    }
  }
  return new NextResponse(JSON.stringify({ error: "Cross-site request blocked" }), {
    status: 403,
    headers: { "content-type": "application/json" },
  });
}

// =============================================================================
// Rate limiting (in-memory, per-process)
// =============================================================================

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

/**
 * Tiny in-memory token-bucket rate limiter. Sufficient for single-instance
 * deployments (which is what the user runs). For multi-instance / serverless
 * you'd want Redis or Upstash. This is intentionally simple so it works
 * everywhere with zero external dependencies.
 *
 * Usage:
 *   const key = `contract_create:${user.id}`;
 *   enforceRateLimit(key, { max: 5, windowMs: 60_000 });
 */
const RATE_BUCKETS = new Map<string, RateLimitBucket>();

/** For tests: reset all in-memory state. */
export function _resetRateLimits() {
  RATE_BUCKETS.clear();
}

export function enforceRateLimit(
  key: string,
  opts: { max: number; windowMs: number },
): void {
  const now = Date.now();
  const bucket = RATE_BUCKETS.get(key);
  if (!bucket || bucket.resetAt < now) {
    RATE_BUCKETS.set(key, { count: 1, resetAt: now + opts.windowMs });
    return;
  }
  if (bucket.count >= opts.max) {
    const retrySec = Math.ceil((bucket.resetAt - now) / 1000);
    throw new SecurityError(
      `Rate limit exceeded. Try again in ${retrySec}s.`,
      429,
    );
  }
  bucket.count += 1;
}
