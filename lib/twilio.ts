/**
 * lib/twilio.ts — minimal Twilio Programmable Voice wrapper.
 *
 * In dev / when TWILIO_ACCOUNT_SID is a placeholder, all functions short-circuit
 * with synthetic responses so the flow can be tested without a real Twilio
 * account. Set the env vars in .env.local to enable real calls.
 */
import crypto from "crypto";

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID ?? "";
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN ?? "";
const PROXY_NUMBER = process.env.TWILIO_PROXY_NUMBER ?? "";
const BYPASS = process.env.BYPASS_TWILIO === "true" || !ACCOUNT_SID || ACCOUNT_SID.includes("your-account-sid") || ACCOUNT_SID.startsWith("AC") === false;

export function isTwilioBypassed() {
  return BYPASS;
}

export type InitiateCallInput = {
  /** HiVR-internal id for the call (used as Twilio client reference) */
  callId: string;
  /** Phone number to call first (typically the employee) */
  to: string;
  /** HiVR proxy number (your Twilio number) */
  from?: string;
  /** Optional webhook URL for status callbacks */
  statusCallbackUrl?: string;
};

export type InitiateCallResult = {
  callSid: string;
  status: string;
  proxyNumber: string;
  bypassed: boolean;
};

/**
 * Initiate a Twilio call. In bypass mode, returns a synthetic call_sid
 * and the call status is treated as "ringing" until a webhook updates it.
 */
export async function initiateTwilioCall(input: InitiateCallInput): Promise<InitiateCallResult> {
  const from = input.from ?? PROXY_NUMBER;
  if (BYPASS) {
    return {
      callSid: `CA_bypass_${crypto.randomBytes(16).toString("hex")}`,
      status: "initiated",
      proxyNumber: from || "+91-00000-00000",
      bypassed: true,
    };
  }
  // Real Twilio API call
  const body = new URLSearchParams({
    To: input.to,
    From: from,
    Url: input.statusCallbackUrl ?? "",
    StatusCallback: input.statusCallbackUrl ?? "",
    StatusCallbackMethod: "POST",
  });
  const auth = Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString("base64");
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Calls.json`,
    { method: "POST", headers: { authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" }, body }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message ?? `Twilio error ${res.status}`);
  }
  return {
    callSid: data.sid,
    status: data.status,
    proxyNumber: from,
    bypassed: false,
  };
}

/** Verify Twilio webhook signature. Twilio signs the body with HMAC-SHA1. */
export function verifyTwilioWebhookSignature(rawBody: string, signature: string, url: string): boolean {
  if (!AUTH_TOKEN) return false;
  const data = `${url}${rawBody}`;
  const expected = crypto.createHmac("sha1", AUTH_TOKEN).update(data).digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(signature, "utf8"));
  } catch {
    return false;
  }
}
