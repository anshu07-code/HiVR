/**
 * lib/razorpay-subscriptions.ts — Razorpay Subscriptions API for business plans.
 *
 * In dev, when the key is a placeholder, we return a synthetic subscription
 * id and short-circuit the flow.
 */
import crypto from "crypto";

const KEY_ID = process.env.RAZORPAY_KEY_ID ?? "";
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET ?? "";
const BYPASS = process.env.BYPASS_RAZORPAY_PAYOUTS === "true" || !KEY_ID || KEY_ID.includes("your-key");

export function isRazorpaySubBypassed() {
  return BYPASS;
}

export const RAZORPAY_PLANS: Record<string, { plan_id: string; amount_paise: number; interval: "monthly" | "yearly" }> = {
  // Plan ids are placeholders — the real ones come from your Razorpay dashboard.
  // Override via env: RAZORPAY_PLAN_PRO_MONTHLY, etc.
  pro_monthly:      { plan_id: process.env.RAZORPAY_PLAN_PRO_MONTHLY      ?? "plan_pro_monthly_placeholder",      amount_paise: 99900,  interval: "monthly" },
  pro_yearly:       { plan_id: process.env.RAZORPAY_PLAN_PRO_YEARLY       ?? "plan_pro_yearly_placeholder",       amount_paise: 999000, interval: "yearly"  },
  enterprise_monthly: { plan_id: process.env.RAZORPAY_PLAN_ENT_MONTHLY  ?? "plan_ent_monthly_placeholder",      amount_paise: 999900, interval: "monthly" },
  enterprise_yearly:  { plan_id: process.env.RAZORPAY_PLAN_ENT_YEARLY   ?? "plan_ent_yearly_placeholder",       amount_paise: 9999000,interval: "yearly"  },
};

export type PlanInterval = "monthly" | "yearly";

export type CreateSubscriptionInput = {
  planCode: "pro" | "enterprise";
  interval: PlanInterval;
  businessId: string;
  customerEmail: string;
  customerName: string;
  totalCount?: number; // number of cycles (default 12 for monthly, 1 for yearly = always renew)
};

export type RazorpaySubscriptionResult = {
  id: string;
  plan_id: string;
  status: string;
  short_url?: string;
  bypassed: boolean;
};

export async function createRazorpaySubscription(input: CreateSubscriptionInput): Promise<RazorpaySubscriptionResult> {
  const key = `${input.planCode}_${input.interval}`;
  const plan = RAZORPAY_PLANS[key];
  if (!plan) {
    throw new Error(`Unknown plan: ${key}`);
  }

  if (BYPASS) {
    return {
      id: `sub_bypass_${crypto.randomBytes(8).toString("hex")}`,
      plan_id: plan.plan_id,
      status: "created",
      short_url: undefined,
      bypassed: true,
    };
  }

  const body = {
    plan_id: plan.plan_id,
    customer_notify: 1,
    quantity: 1,
    total_count: input.totalCount ?? (input.interval === "yearly" ? 5 : 12), // renew 5 years for yearly, 12 months for monthly
    notes: {
      business_id: input.businessId,
      plan_code: input.planCode,
      interval: input.interval,
    },
  };

  const auth = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/subscriptions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Basic ${auth}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as any)?.error?.description ?? (data as any)?.message ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return {
    id: (data as any).id,
    plan_id: (data as any).plan_id,
    status: (data as any).status,
    short_url: (data as any).short_url,
    bypassed: false,
  };
}

export async function cancelRazorpaySubscription(subscriptionId: string, cancelAtCycleEnd = true): Promise<void> {
  if (BYPASS) return;
  const auth = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64");
  const res = await fetch(`https://api.razorpay.com/v1/subscriptions/${subscriptionId}/cancel`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Basic ${auth}` },
    body: JSON.stringify({ cancel_at_cycle_end: cancelAtCycleEnd }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as any)?.error?.description ?? `HTTP ${res.status}`);
  }
}

/** Verify webhook signature. */
export function verifyRazorpaySubscriptionWebhook(rawBody: string, signature: string, secret = process.env.RAZORPAY_WEBHOOK_SECRET): boolean {
  if (!secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}
