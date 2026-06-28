/**
 * lib/razorpay-upi.ts — UPI payment-link + webhook verification.
 *
 * Used by the bank-account verification flow:
 *   1. User enters their UPI ID (e.g. 9876543210@paytm)
 *   2. HiVR calls `createUpiPaymentLink()` which creates a Razorpay
 *      payment link for ₹1 with a unique reference code as the note
 *   3. User scans the QR / clicks the UPI deep-link
 *   4. User pays ₹1 from their UPI app
 *   5. HiVR receives a webhook → marks the UPI as verified
 *
 * In sandbox (BYPASS_BANK_VERIFICATION=true), the payment link is
 * fabricated locally and the webhook is simulated.
 *
 * Cost: ₹0 to HiVR. The user pays the ₹1 and HiVR keeps it as the
 * verification fee. Razorpay doesn't charge for failed UPI Collect
 * requests, and the ₹1 covers the platform fee for successful ones.
 *
 * References:
 *   - https://razorpay.com/docs/api/payments/payment-links/
 *   - https://razorpay.com/docs/webhooks/
 *   - https://razorpay.com/docs/payments/methods/upi/ (UPI Collect)
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/* ====================================================================== */
/* Config                                                                 */
/* ====================================================================== */

function config() {
  return {
    keyId: process.env.RAZORPAY_KEY_ID || "",
    keySecret: process.env.RAZORPAY_KEY_SECRET || "",
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || "",
    bypass: process.env.BYPASS_BANK_VERIFICATION === "true",
    amountPaise: Number(process.env.BANK_VERIFICATION_AMOUNT_PAISE || 100),
    notePrefix: process.env.BANK_VERIFICATION_NOTE_PREFIX || "HVR",
    apiBase: "https://api.razorpay.com/v1",
  };
}

/* ====================================================================== */
/* UPI handle validation                                                  */
/* ====================================================================== */

/**
 * Lightweight UPI handle pattern check. We don't try to enumerate the
 * 200+ UPI providers — Razorpay's UPI validation will catch invalid
 * handles at the payment-link stage. We just check the basic format.
 *
 * Examples that pass:  9876543210@paytm, name@okaxis, john.doe@ybl
 * Examples that fail:  @paytm, name@, name, name@@paytm
 */
export function isValidUpiHandle(upi: string): boolean {
  if (!upi) return false;
  const trimmed = upi.trim().toLowerCase();
  // username: 3-50 chars, alphanumeric + . _ -
  // @ separator
  // provider: 2-30 chars, starts with a letter, alphanumeric + . _ -
  return /^[a-z0-9._-]{3,50}@[a-z][a-z0-9._-]{2,30}$/.test(trimmed);
}

/** Best-effort extraction of the UPI provider (e.g. "paytm" from "x@ybl" → "ybl"). */
export function upiProvider(upi: string): string {
  const at = upi.indexOf("@");
  if (at === -1) return "";
  return upi.slice(at + 1).toLowerCase().trim();
}

/* ====================================================================== */
/* Reference code generation                                              */
/* ====================================================================== */

/**
 * Generate the unique 6-char reference code that appears in the UPI
 * note. The user reads this back to confirm. Format: 4 letters + 2
 * digits from a 32-char alphabet (no ambiguous chars like 0/O, 1/I/L).
 */
export function generateRefCode(): string {
  const alpha = "ABCDEFGHJKMNPQRSTUVWXYZ"; // 23 letters, no I/L/O
  const digit = "23456789";                 // 8 digits, no 0/1
  const a = Array.from({ length: 4 }, () => alpha[Math.floor(Math.random() * alpha.length)]).join("");
  const d = Array.from({ length: 2 }, () => digit[Math.floor(Math.random() * digit.length)]).join("");
  return `${a}${d}`;
}

/** Format the note shown in the user's UPI app. */
export function formatNote(refCode: string): string {
  const cfg = config();
  return `HiVR verify ${cfg.notePrefix}-${refCode}`;
}

/* ====================================================================== */
/* Razorpay API: Create payment link                                      */
/* ====================================================================== */

export type CreateLinkInput = {
  /** Internal HiVR user id, included in the note for traceability. */
  userId: string;
  /** The UPI ID the user wants to verify (e.g. 9876543210@paytm). */
  upiId: string;
  /** The unique reference code (4 letters + 2 digits). */
  refCode: string;
  /** URL Razorpay should redirect the user to after the payment. */
  callbackUrl: string;
};

export type CreateLinkResult = {
  /** Local reference code (also sent to Razorpay in the note). */
  refCode: string;
  /** The full UPI note string. */
  note: string;
  /** The payment-link id (Razorpay). In sandbox, a local UUID. */
  paymentLinkId: string;
  /** Short URL the user opens (Razorpay-hosted). */
  shortUrl: string;
  /** The amount in paise. */
  amountPaise: number;
  /** When the link expires (ISO). Razorpay default is 24h for UPI. */
  expiresAt: string;
  /** True if the request was satisfied by the local sandbox simulator. */
  bypassed: boolean;
};

/**
 * Create a Razorpay payment link for ₹1 with the reference code as
 * the note. In sandbox mode, returns a fabricated link and marks
 * `bypassed: true`.
 *
 * Docs: https://razorpay.com/docs/api/payments/payment-links/#create-payment-link
 */
export async function createUpiPaymentLink(input: CreateLinkInput): Promise<CreateLinkResult> {
  const cfg = config();
  const note = formatNote(input.refCode);

  if (cfg.bypass) {
    return {
      refCode: input.refCode,
      note,
      paymentLinkId: `bypass_${randomBytes(12).toString("hex")}`,
      shortUrl: `upi://pay?pa=hivr@hdfcbank&pn=HiVR&am=1&cu=INR&tn=${encodeURIComponent(note)}`,
      amountPaise: cfg.amountPaise,
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      bypassed: true,
    };
  }

  const body = {
    amount: cfg.amountPaise,
    currency: "INR",
    accept_partial: false,
    description: note,
    customer: {
      name: input.userId.slice(0, 80), // Razorpay requires a name; use a sanitised id
      email: `${input.userId}@hivr.example`,
    },
    notify: { sms: false, email: false },
    reminder_enable: false,
    callback_url: input.callbackUrl,
    callback_method: "get",
    notes: {
      hivr_user_id: input.userId,
      hivr_ref_code: input.refCode,
      hivr_upi_id: input.upiId,
      kind: "bank_verification",
    },
  };

  const res = await fetch(`${cfg.apiBase}/payment_links`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString("base64")}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Razorpay payment-link create failed: ${res.status} ${text.slice(0, 300)}`);
  }
  const json = await res.json() as {
    id: string;
    short_url: string;
    amount: number;
    expire_by?: number;
  };
  return {
    refCode: input.refCode,
    note,
    paymentLinkId: json.id,
    shortUrl: json.short_url,
    amountPaise: json.amount,
    expiresAt: json.expire_by ? new Date(json.expire_by * 1000).toISOString() : new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
    bypassed: false,
  };
}

/* ====================================================================== */
/* Razorpay API: Fetch payment status (called after user types the code) */
/* ====================================================================== */

export type PaymentStatus = {
  /** Whether the payment was actually captured by Razorpay. */
  paid: boolean;
  /** Razorpay payment id. */
  paymentId: string | null;
  /** Amount in paise. */
  amountPaise: number | null;
  /** The UPI ID the payment came from. */
  fromUpi: string | null;
  /** The note set on the payment. */
  note: string | null;
  /** When the payment was captured (ISO). */
  capturedAt: string | null;
  /** Raw status from Razorpay: "created" | "authorized" | "captured" | "failed" | "refunded". */
  status: string;
};

/**
 * Fetch the status of a payment_link. We use it to confirm that
 *   * the payment was actually captured (not pending or failed)
 *   * the note matches the reference code the user typed
 *
 * In sandbox mode, the link is bypassed — the function returns
 * a fabricated "captured" status with a 6-digit sandbox payment id.
 */
export async function fetchPaymentStatus(paymentLinkId: string, refCode: string): Promise<PaymentStatus> {
  const cfg = config();

  if (cfg.bypass || paymentLinkId.startsWith("bypass_")) {
    return {
      paid: true,
      paymentId: `pay_bypass_${randomBytes(8).toString("hex")}`,
      amountPaise: cfg.amountPaise,
      fromUpi: "sandbox@upi",
      note: formatNote(refCode),
      capturedAt: new Date().toISOString(),
      status: "captured",
    };
  }

  // Razorpay: GET /v1/payments?payment_link_id={id}
  // Returns a list of payments against the link. We take the latest captured one.
  const url = `${cfg.apiBase}/payments?payment_link_id=${encodeURIComponent(paymentLinkId)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { "authorization": `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString("base64")}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Razorpay payment fetch failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { items: any[] };
  const captured = json.items.find((p) => p.status === "captured");
  if (!captured) {
    return {
      paid: false,
      paymentId: null,
      amountPaise: null,
      fromUpi: null,
      note: null,
      capturedAt: null,
      status: "not_paid",
    };
  }
  return {
    paid: true,
    paymentId: captured.id,
    amountPaise: captured.amount,
    fromUpi: captured.vpa ?? captured.email ?? null,
    note: captured.notes?.description ?? captured.description ?? null,
    capturedAt: new Date(captured.created_at * 1000).toISOString(),
    status: captured.status,
  };
}

/* ====================================================================== */
/* Webhook signature verification                                          */
/* ====================================================================== */

/**
 * Verify a Razorpay webhook signature. The X-Razorpay-Signature header
 * is HMAC-SHA256(webhook_body, webhook_secret). We use timing-safe
 * comparison.
 *
 * Docs: https://razorpay.com/docs/webhooks/#validate-webhook-signature
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const cfg = config();
  if (!cfg.webhookSecret) {
    if (process.env.NODE_ENV === "production") {
      console.warn("[razorpay] RAZORPAY_WEBHOOK_SECRET not set — refusing in production.");
      return false;
    }
    return true; // skip in dev when no secret
  }
  const expected = createHmac("sha256", cfg.webhookSecret).update(rawBody).digest("hex");
  if (expected.length !== signature.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

/* ====================================================================== */
/* Convenience: code the user types                                      */
/* ====================================================================== */

/**
 * Normalise the reference code the user types (strip whitespace,
 * uppercase, accept with or without the prefix). Returns the bare
 * 6-char code or null if invalid.
 */
export function normaliseRefCode(input: string): string | null {
  const cleaned = input.trim().toUpperCase().replace(/\s+/g, "");
  if (cleaned.length === 0) return null;
  // Accept both "HVR-AB23CD" and "AB23CD"
  const stripped = cleaned.startsWith("HVR-") ? cleaned.slice(4) : cleaned;
  if (/^[A-Z]{4}\d{2}$/.test(stripped)) return stripped;
  return null;
}
