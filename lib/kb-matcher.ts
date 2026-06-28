/**
 * lib/kb-matcher.ts — Local intent matcher. No LLM.
 *
 * Given a user question, returns the best-matching KB entry from
 * `lib/knowledge-base.ts`, or a refusal message if no good match.
 *
 * Algorithm:
 *   1. Lowercase + normalize the input (strip punctuation, collapse spaces)
 *   2. Tokenize on whitespace; compute bigrams for phrase match scoring
 *   3. For each KB entry, score = sum of:
 *      - +5 for each exact keyword hit
 *      - +8 for each keyword (or substring) appearing as a substring
 *      - +3 for each entry.pattern that shares a trigram with the input
 *      - +2 for each bigram the input shares with any entry.pattern
 *   4. Bonus for short questions hitting the title/topic
 *   5. If top score < THRESHOLD or input matches a REFUSAL_PATTERN, return refusal
 *   6. If input is off-topic (no keyword overlap with ANY entry), return off-topic
 *
 * Deterministic, no model, no API call. Same question → same answer.
 */

import { ALL_KB, KBEntry, REFUSAL_PATTERNS, OFF_TOPIC_RESPONSE } from "./knowledge-base";

const THRESHOLD = 8;        // minimum score to consider a confident match
const WEAK_THRESHOLD = 4;    // score at which we say "we don't have a confident answer"

const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "do", "does", "can", "could", "would", "should",
  "i", "you", "we", "they", "me", "us", "your", "my", "our", "their",
  "to", "of", "in", "on", "for", "at", "by", "with", "from", "as", "into",
  "and", "or", "but", "if", "so", "than", "that", "this", "these", "those",
  "be", "have", "has", "had", "do", "does", "did", "doing", "done",
  "it", "its", "what", "which", "who", "whom", "whose", "when", "where", "why", "how",
  "much", "many", "long", "does", "got", "get", "getting",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOPWORDS.has(t));
}

function bigrams(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) out.push(`${tokens[i]} ${tokens[i + 1]}`);
  return out;
}

function scoreEntry(input: string, inputTokens: string[], inputBigrams: string[], entry: KBEntry): number {
  let s = 0;
  const inputStr = " " + input + " ";

  // Keyword hit
  for (const kw of entry.keywords) {
    const k = kw.toLowerCase();
    if (inputTokens.includes(k)) s += 6;
    else if (inputStr.includes(" " + k + " ") || inputStr.includes(k)) s += 3;
  }

  // Pattern similarity (trigram + bigram overlap)
  for (const p of entry.patterns) {
    const pTokens = tokenize(p);
    let shared = 0;
    for (const t of pTokens) if (inputTokens.includes(t)) shared++;
    s += shared * 1.2;
    // bigram overlap
    const pBigrams = new Set(bigrams(pTokens));
    for (const b of inputBigrams) if (pBigrams.has(b)) s += 2;
  }

  return s;
}

function hasAnyOverlapWithKB(inputTokens: string[], rawInput: string): boolean {
  // quick check: does any token appear in any entry's keywords or patterns?
  for (const entry of ALL_KB) {
    for (const kw of entry.keywords) {
      if (inputTokens.includes(kw.toLowerCase())) return true;
    }
    for (const p of entry.patterns) {
      for (const t of tokenize(p)) {
        if (inputTokens.includes(t)) return true;
      }
    }
  }
  // Also require a HiVR-specific anchor word OR the input mentions hivr/support directly.
  const anchors = ["hivr", "platform", "escrow", "subscription", "plan", "fee", "task", "tier", "category", "employee", "buyer", "razorpay"];
  for (const a of anchors) if (rawInput.toLowerCase().includes(a)) return true;
  return false;
}

export type MatchResult =
  | { kind: "match"; entry: KBEntry; score: number }
  | { kind: "weak"; entry: KBEntry; score: number }
  | { kind: "refusal"; reason: string }
  | { kind: "off_topic" };

export function matchQuery(input: string): MatchResult {
  const cleaned = (input ?? "").trim();
  if (!cleaned) return { kind: "off_topic" };

  // 1. Refusal patterns first
  for (const r of REFUSAL_PATTERNS) {
    if (r.pattern.test(cleaned)) return { kind: "refusal", reason: r.reason };
  }

  // 2. Tokenize + score every entry
  const tokens = tokenize(cleaned);
  const big = bigrams(tokens);
  let best: { entry: KBEntry; score: number } | null = null;
  for (const e of ALL_KB) {
    const s = scoreEntry(cleaned, tokens, big, e);
    if (!best || s > best.score) best = { entry: e, score: s };
  }

  if (!best) return { kind: "off_topic" };

  // 3. Off-topic: no overlap with the KB at all
  if (!hasAnyOverlapWithKB(tokens, cleaned)) return { kind: "off_topic" };

  // 3b. If we already have a strong, confident match, trust it — even if the
  // question doesn't contain a HiVR anchor word. (e.g. "what is the difference
  // between quarterly and yearly" is clearly a pricing question and matches
  // the quarterly-vs-yearly entry strongly.)
  if (best.score >= THRESHOLD) {
    return { kind: "match", entry: best.entry, score: best.score };
  }

  // 3c. Special-case for weak matches: a question about politics / weather /
  // food / etc. may happen to share a word (e.g. "india") with a KB entry.
  // Require a HiVR-anchor word to accept anything below the strong threshold.
  const anchors = ["hivr", "platform", "escrow", "subscription", "plan", "fee", "task", "tier", "category", "employee", "buyer", "razorpay", "kyc", "aadhaar", "gstin", "skill", "test", "contract", "dispute"];
  const hasAnchor = anchors.some(a => cleaned.toLowerCase().includes(a));
  if (!hasAnchor) return { kind: "off_topic" };

  // 4. Tier the weak match
  if (best.score >= WEAK_THRESHOLD) return { kind: "weak", entry: best.entry, score: best.score };
  return { kind: "off_topic" };
}

export function answerFor(input: string): { text: string; links?: KBEntry["links"]; followUp?: string } {
  const m = matchQuery(input);
  switch (m.kind) {
    case "match":
      return { text: m.entry.answer, links: m.entry.links, followUp: m.entry.follow_up };
    case "weak":
      return {
        text:
          `I think you're asking about "${m.entry.topic}". ${m.entry.answer} ` +
          `If that didn't answer your question, please contact support at /support.`,
        links: m.entry.links,
      };
    case "refusal":
      return { text: m.reason };
    case "off_topic":
      return { text: OFF_TOPIC_RESPONSE };
  }
}
