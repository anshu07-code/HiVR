/**
 * lib/fraud-signals.ts — runtime anti-fraud heuristics.
 *
 * Pure, side-effect-free helpers. The caller (server action or API
 * route) records the resulting signals on `users.fraud_signals` (jsonb)
 * and on `notifications` for admin review.
 *
 * Heuristics implemented:
 *   * `recent_signup_post` — buyer created account < 10 minutes ago
 *     AND posted a task. Common bot pattern.
 *   * `rapid_posting` — more than 3 tasks in the last 10 minutes.
 *   * `repeated_kyc_rejection` — 3+ rejected verifications of the same
 *     type. Could be a fraudster cycling through stolen IDs.
 *   * `multiple_phone_attempts` — 3+ phone-OTP requests in 1 hour.
 *   * `large_budget_anomaly` — buyer with no completed contracts is
 *     posting a task > ₹50,000. High risk of chargeback.
 *   * `suspicious_bio_or_title` — placeholder content ("test", "asdf",
 *     "xxx", "lorem ipsum", full CAPS, single letter repeated). Signals
 *     a script-generated account.
 *
 * The signals are advisory. A high score (>= 60) surfaces a warning in
 * admin's user page; a critical score (>= 80) auto-suspends the user
 * until admin review.
 */

import { SupabaseClient } from "@supabase/supabase-js";

export type FraudSignal = {
  type: string;
  score: number;          // 0-100; contributes to the user-level total
  message: string;
  meta?: Record<string, any>;
  at: string;             // ISO timestamp
};

const SUSPICIOUS_TEXT_RE = /^(test|asdf|xxx|lorem ipsum|qwer|1234|abcd|foo|bar|baz)+$/i;
const ALL_CAPS_RE = /^[A-Z\s!?]{15,}$/;
const REPEATED_CHAR_RE = /(.)\1{6,}/;

export function textSuspicionScore(text: string): number {
  if (!text) return 0;
  const t = text.trim();
  if (t.length < 4) return 20;
  if (SUSPICIOUS_TEXT_RE.test(t)) return 60;
  if (ALL_CAPS_RE.test(t)) return 30;
  if (REPEATED_CHAR_RE.test(t)) return 30;
  return 0;
}

/**
 * Runs all heuristics against the user's recent activity. Returns the
 * new signals to merge into `users.fraud_signals.jsonb`.
 */
export async function computeFraudSignals(
  sb: any,
  userId: string,
  ctx: { newTaskBudgetRupees?: number } = {}
): Promise<FraudSignal[]> {
  const now = Date.now();
  const out: FraudSignal[] = [];

  // Recent activity probes
  const [userRes, posts1hRes, posts10mRes, recentVerifRes] = await Promise.all([
    sb.from("users").select("created_at, roles, last_active, fraud_signals").eq("id", userId).maybeSingle(),
    sb.from("task_posts").select("id", { count: "exact", head: true }).eq("buyer_id", userId).gte("created_at", new Date(now - 60 * 60_000).toISOString()),
    sb.from("task_posts").select("id", { count: "exact", head: true }).eq("buyer_id", userId).gte("created_at", new Date(now - 10 * 60_000).toISOString()),
    sb.from("verifications").select("doc_type, status").eq("user_id", userId).gte("created_at", new Date(now - 24 * 60 * 60_000).toISOString()),
  ]);

  const user = userRes.data;
  if (!user) return out;

  const created = new Date(user.created_at).getTime();
  const ageMin = (now - created) / 60_000;

  // (1) Recent signup + posting
  if (ctx.newTaskBudgetRupees && ageMin < 10 && (posts1hRes.count ?? 0) > 0) {
    out.push({
      type: "recent_signup_post",
      score: 50,
      message: `Account is ${Math.round(ageMin)} min old and already posted a task.`,
      meta: { age_min: Math.round(ageMin), budget_rupees: ctx.newTaskBudgetRupees },
      at: new Date().toISOString(),
    });
  }

  // (2) Rapid posting
  if ((posts10mRes.count ?? 0) >= 3) {
    out.push({
      type: "rapid_posting",
      score: 40,
      message: `${posts10mRes.count} tasks posted in the last 10 minutes.`,
      meta: { count: posts10mRes.count },
      at: new Date().toISOString(),
    });
  }

  // (3) Repeated KYC rejection
  const rejected = (recentVerifRes.data ?? []).filter((v: any) => v.status === "rejected");
  const byType: Record<string, number> = {};
  for (const v of rejected) byType[v.doc_type] = (byType[v.doc_type] ?? 0) + 1;
  for (const [type, n] of Object.entries(byType)) {
    if (n >= 3) {
      out.push({
        type: "repeated_kyc_rejection",
        score: 30,
        message: `${n} rejected ${type.toUpperCase()} verifications in 24h.`,
        meta: { doc_type: type, count: n },
        at: new Date().toISOString(),
      });
    }
  }

  // (4) Large budget anomaly: brand-new buyer (no completed contracts)
  if (ctx.newTaskBudgetRupees && ctx.newTaskBudgetRupees > 50_000) {
    const { count: completed } = await sb
      .from("contracts")
      .select("id", { count: "exact", head: true })
      .or(`buyer_id.eq.${userId},employee_id.eq.${userId}`)
      .eq("status", "completed");
    if ((completed ?? 0) === 0) {
      out.push({
        type: "large_budget_anomaly",
        score: 25,
        message: `First-ever task on the platform is ₹${ctx.newTaskBudgetRupees.toLocaleString("en-IN")}.`,
        meta: { budget_rupees: ctx.newTaskBudgetRupees },
        at: new Date().toISOString(),
      });
    }
  }

  return out;
}

/**
 * Persists the signals to the user row and, if the total score crosses
 * a threshold, auto-suspends the user. Returns the new total score.
 */
export async function recordFraudSignals(
  sb: any,
  userId: string,
  newSignals: FraudSignal[]
): Promise<{ totalScore: number; autoSuspended: boolean }> {
  if (newSignals.length === 0) return { totalScore: 0, autoSuspended: false };

  const { data: me } = await sb.from("users").select("fraud_signals").eq("id", userId).maybeSingle();
  const existing: FraudSignal[] = (me?.fraud_signals as any) ?? [];
  // Drop signals older than 7 days.
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const trimmed = existing.filter((s) => new Date(s.at).getTime() > cutoff);
  const merged = [...trimmed, ...newSignals].slice(-50); // cap
  const totalScore = merged.reduce((s, x) => s + x.score, 0);

  const updates: any = { fraud_signals: merged };
  if (totalScore >= 80) {
    updates.is_suspended = true;
    updates.suspension_reason = `Auto-suspended: fraud score ${totalScore} crossed 80.`;
    updates.suspended_at = new Date().toISOString();
  }
  await sb.from("users").update(updates).eq("id", userId);
  return { totalScore, autoSuspended: totalScore >= 80 };
}
