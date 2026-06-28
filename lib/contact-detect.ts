/**
 * lib/contact-detect.ts — anti-circumvention contact-info detector.
 *
 * Three layers, in order:
 *   1. Regex: phone numbers, emails, common obfuscations ("at the rate", "gmail dot com").
 *   2. Word-numbers: "nine eight seven six" forming a phone-number-length sequence.
 *   3. LLM second-pass (caller wires this via lib/ai.ts) for indirect/natural-language
 *      evasion that regex cannot catch. This file does NOT import the LLM directly;
 *      the caller is responsible for invoking it on borderline cases.
 *
 * The goal: keep the buyer+employee inside HiVR's escrow, dispute, and review
 * systems. Off-platform deals bypass all of those protections.
 */

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, oh: 0, o: 0,
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

/* ------------------------------------------------------------------ */
/* Layer 1: regex                                                     */
/* ------------------------------------------------------------------ */

const PHONE_REGEXES = [
  // standard 10-digit Indian mobile
  /(?:\+?91[\s-]?)?[6-9]\d{9}\b/,
  // international with country code, 10-15 digits
  /(?<!\d)\+?\d{1,3}[\s-]?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}\b/,
  // digit groups separated by spaces, dots, or hyphens
  /(?<!\d)(?:\d[\s.\-]?){9,12}\d(?!\d)/,
];

const EMAIL_REGEX =
  /\b[A-Za-z0-9._%+-]+(?:\s*(?:at|@)\s*|\s*\[at\]\s*)[A-Za-z0-9.-]+(?:\s*(?:dot|\.)\s*|\s*\[dot\]\s*)[A-Za-z]{2,}\b/i;

const SOCIAL_HANDLE_REGEX = /\b(?:whats?ap+p?|telegram|insta(?:gram)?|snap(?:chat)?|signal|wechat|twitter|x\.com)\s*[:\-]?\s*@?[A-Za-z0-9_.]{3,}/i;

const URL_REGEX = /\b(?:https?:\/\/|www\.)[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:\/\S*)?/i;

/* ------------------------------------------------------------------ */
/* Layer 2: word-numbers                                              */
/* ------------------------------------------------------------------ */

function detectPhoneInWords(text: string): boolean {
  const lower = text.toLowerCase();
  const tokens = lower
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const digits: number[] = [];
  for (const t of tokens) {
    if (t in NUMBER_WORDS) {
      digits.push(NUMBER_WORDS[t]);
      if (digits.length >= 10) break;
    } else if (/^\d+$/.test(t)) {
      // mixed word+number forms: "nine 8 seven six..."
      for (const c of t) digits.push(parseInt(c, 10));
      if (digits.length >= 10) break;
    } else {
      if (digits.length >= 10) return true;
      digits.length = 0;
    }
  }
  return digits.length >= 10;
}

/* ------------------------------------------------------------------ */
/* Public API                                                         */
/* ------------------------------------------------------------------ */

export type DetectionResult = {
  flagged: boolean;
  reasons: string[];
  layer: "regex" | "word_numbers" | "llm" | "none";
};

export function detectContactInfoRegex(message: string): DetectionResult {
  const reasons: string[] = [];
  for (const re of PHONE_REGEXES) {
    if (re.test(message)) {
      reasons.push("phone-number-pattern");
      break;
    }
  }
  if (EMAIL_REGEX.test(message)) reasons.push("email-pattern");
  if (SOCIAL_HANDLE_REGEX.test(message)) reasons.push("social-handle");
  if (URL_REGEX.test(message)) reasons.push("external-url");
  return { flagged: reasons.length > 0, reasons, layer: "regex" };
}

export function detectContactInfoWordNumbers(message: string): DetectionResult {
  const hit = detectPhoneInWords(message);
  return {
    flagged: hit,
    reasons: hit ? ["phone-number-spelled-in-words"] : [],
    layer: "word_numbers",
  };
}

/**
 * Composite detector. Pass an LLM classifier for the second/third pass; if you
 * don't pass one (e.g. in tests), only the first two layers run.
 */
export async function detectContactInfo(
  message: string,
  llmClassify?: (m: string) => Promise<{ is_contact_attempt: boolean; reason: string }>,
): Promise<DetectionResult> {
  const regex = detectContactInfoRegex(message);
  if (regex.flagged) return regex;

  const words = detectContactInfoWordNumbers(message);
  if (words.flagged) return words;

  if (llmClassify) {
    try {
      const llm = await llmClassify(message);
      if (llm.is_contact_attempt) {
        return {
          flagged: true,
          reasons: [`llm:${llm.reason}`],
          layer: "llm",
        };
      }
    } catch {
      // LLM failure must not break messaging — log silently and allow.
    }
  }
  return { flagged: false, reasons: [], layer: "none" };
}
