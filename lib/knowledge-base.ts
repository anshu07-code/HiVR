/**
 * lib/knowledge-base.ts
 *
 * HiVR's in-repo customer support knowledge base. Used by the
 * "Ask HiVR" assistant to answer common platform questions without
 * hitting the LLM (and without API cost / latency).
 *
 * Each entry has:
 *   - topic:  short label (used in logs and the assistant UI)
 *   - keywords:  array of single-word stems (lowercased)
 *   - patterns:  array of example phrasings the user might type
 *   - answer:  the response text (plain English, short, with links)
 *
 * Score for a query is computed in lib/kb-matcher.ts based on
 * keyword hits, bigram overlap, and pattern trigram overlap.
 *
 * Refusal patterns catch out-of-scope questions (legal, medical,
 * financial advice, system-abuse instructions). The assistant will
 * politely decline and route the user to support.
 */

export type KBEntry = {
  topic: string;
  keywords: string[];
  patterns: string[];
  answer: string;
};

export const ALL_KB: KBEntry[] = [
  {
    topic: "fees",
    keywords: ["fee", "fees", "commission", "cut", "charge", "charges", "pricing", "cost", "expensive"],
    patterns: [
      "what does hivr charge",
      "how much does the platform take",
      "platform fee",
      "are there any fees",
      "why do you take a cut",
    ],
    answer:
      "HiVR charges a small platform fee on each completed contract, deducted from the freelancer's payout. " +
      "The exact percentage depends on the freelancer's trust tier (new freelancers pay more, top-rated pay less). " +
      "There are no fees to sign up, post a task, or apply to a contract — you only pay when money is actually moved. " +
      "See the live fee schedule at /dashboard/settings.",
  },
  {
    topic: "escrow",
    keywords: ["escrow", "fund", "funded", "funding", "hold", "release", "refund", "payment", "transfer"],
    patterns: [
      "how does escrow work",
      "when does the freelancer get paid",
      "is my money safe",
      "what happens if i cancel",
      "can i get a refund",
      "how is the payment held",
    ],
    answer:
      "When a buyer funds a contract, the money moves into HiVR-managed escrow (Razorpay Route). " +
      "The freelancer can see the funded amount in their workspace and start work. " +
      "Funds are released to the freelancer's wallet only after the buyer marks the work as complete, " +
      "or after the auto-release window passes without a dispute. " +
      "If the buyer opens a dispute, the funds stay locked until the dispute is resolved. " +
      "Either party can request a refund through the dispute flow.",
  },
  {
    topic: "disputes",
    keywords: ["dispute", "disputes", "complaint", "refund", "issue", "problem", "scam", "fraud", "stuck"],
    patterns: [
      "how do i file a dispute",
      "i was scammed",
      "freelancer is not responding",
      "the work is bad",
      "how do refunds work",
      "i want my money back",
    ],
    answer:
      "Either party can open a dispute from the workspace. An admin reviews the evidence (chat, files, milestones) and decides. " +
      "If the freelancer is at fault, the escrow is refunded to the buyer. " +
      "If the buyer is at fault, the escrow is released to the freelancer. " +
      "In split cases the admin allocates a percentage to each side. " +
      "Both parties are notified of the outcome in-app and via email. " +
      "You can see your open disputes at /dashboard/disputes.",
  },
  {
    topic: "verification",
    keywords: ["verify", "verified", "verification", "kyc", "aadhaar", "pan", "id", "identity", "trust", "tier"],
    patterns: [
      "how do i get verified",
      "what is kyc",
      "why do i need aadhaar",
      "how long does verification take",
      "can i work without verification",
    ],
    answer:
      "HiVR uses a tiered trust system. New freelancers start as 'Provisional' and can apply to lower-stakes contracts. " +
      "To unlock Tier A contracts, complete the Aadhaar + PAN + bank verification in /onboarding/verify. " +
      "Tier B (role-engagement) contracts require a live interview with our panel. " +
      "Most KYC checks complete in under 5 minutes; Aadhaar QR is instant, PAN verification may take a few hours.",
  },
  {
    topic: "tier_b_interview",
    keywords: ["tier", "tierb", "interview", "interviews", "level", "levelup", "promotion", "top_rated", "track_record"],
    patterns: [
      "how do i get to tier b",
      "what is the interview for",
      "how do i level up",
      "what are the requirements for top rated",
      "how does the promotion work",
    ],
    answer:
      "Tier B (role-engagement) contracts are higher-value, longer-duration work. " +
      "To unlock them, pass a 30–45 minute live interview with our panel. " +
      "Book a slot at /dashboard/interviews. After the interview, our panel records pass/fail; " +
      "passing flips your trust tier and unlocks the higher-stakes contracts. " +
      "Track-record and Top-Rated are subsequent promotions earned by completing contracts with high ratings.",
  },
  {
    topic: "withdraw",
    keywords: ["withdraw", "withdrawal", "payout", "upi", "bank", "transfer", "money", "wallet", "balance"],
    patterns: [
      "how do i withdraw",
      "when can i withdraw",
      "how do i get paid to my bank",
      "what is my wallet",
      "is there a withdrawal fee",
    ],
    answer:
      "Once a contract is released, the payout (minus the platform fee) lands in your HiVR wallet. " +
      "From there, you can withdraw to your linked UPI or bank account at /dashboard/earnings. " +
      "Withdrawals typically settle within minutes for UPI and 1–2 business days for IMPS/NEFT. " +
      "HiVR does not charge a withdrawal fee.",
  },
  {
    topic: "instant_hire",
    keywords: ["instant", "instanthire", "instant_hire", "smart", "match", "matching", "hire", "now", "urgent"],
    patterns: [
      "what is instant hire",
      "how does smart match work",
      "can i hire someone right now",
      "what is auto accept",
    ],
    answer:
      "Instant Hire lets a buyer hand-pick a freelancer from the Smart Match list and start a contract in under 60 seconds. " +
      "Smart Match ranks freelancers by rating, completion rate, response time, and category tier. " +
      "The freelancer gets a 60-second handshake to accept; if they don't respond, the offer cascades to the next candidate. " +
      "Freelancers with 'auto-accept' enabled skip the handshake entirely when the offer is a good fit.",
  },
  {
    topic: "profile",
    keywords: ["profile", "headline", "bio", "skill", "skills", "category", "categories", "portfolio", "wage"],
    patterns: [
      "how do i improve my profile",
      "what should i put in my bio",
      "how are skills verified",
      "can i change my categories",
      "what is the standing rate",
    ],
    answer:
      "A complete profile has: a clear headline, a 1–2 sentence bio, a list of skills with years of experience, " +
      "your standing rate per category, and at least one project or certification. " +
      "Profiles with 80%+ completeness get 3× more buyer views. " +
      "You can edit your profile at /dashboard/profile.",
  },
  {
    topic: "task_post",
    keywords: ["task", "post", "posting", "brief", "budget", "openings", "category"],
    patterns: [
      "how do i post a task",
      "what should i include in the brief",
      "can i edit a posted task",
      "how many openings can i post",
    ],
    answer:
      "To post a task, go to /dashboard/post and fill in: title, category, pricing model (hourly / daily / fixed), " +
      "budget, openings, and a clear brief. A good brief has 3–6 specific deliverable items so applicants know exactly what to bid on. " +
      "You can edit an open task any time before the first applicant is hired.",
  },
  {
    topic: "contact_info",
    keywords: ["contact", "phone", "email", "share", "outside", "offplatform", "telegram", "whatsapp", "scam", "block"],
    patterns: [
      "can i share my phone number",
      "the freelancer asked for my whatsapp",
      "is off-platform contact allowed",
      "why was my message blocked",
    ],
    answer:
      "HiVR's policy: never share contact info (phone, email, telegram, whatsapp, etc) until the contract is funded and active. " +
      "We detect and block such messages automatically. " +
      "Once the contract is active, the workspace chat shows both parties' email so you can move to direct communication if needed. " +
      "If someone asks you to share contact info before the contract is funded, that is a scam signal — please report it.",
  },
  {
    topic: "data_privacy",
    keywords: ["data", "privacy", "delete", "gdpr", "personal", "information", "leak"],
    patterns: [
      "how is my data protected",
      "can i delete my account",
      "who can see my profile",
      "do you sell my data",
    ],
    answer:
      "HiVR does not sell user data. " +
      "Your profile (name, headline, skills, ratings, completed contracts) is publicly visible to anyone browsing the platform. " +
      "Your email and phone are NEVER shown publicly — only parties to an active contract can see them in the workspace. " +
      "You can request account deletion at /dashboard/settings/delete-account; we erase your data within 30 days as required by Indian IT law.",
  },
];

/**
 * Refusal patterns. The assistant will NOT answer these — it routes
 * the user to human support. Keep this list short and HIGH-precision
 * (we don't want false positives).
 */
export const REFUSAL_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\b(hack|exploit|bypass\s+verification|cheat\s+the\s+system|scam\s+others|fraudulently)\b/i,
    reason: "I can only help with legitimate questions about HiVR. For anything involving system abuse, please contact trust@hivr.example." },
  { pattern: /\b(legal\s+advice|sue|lawsuit|court\s+case|attorney)\b/i,
    reason: "I'm not qualified to give legal advice. Please consult a lawyer or email legal@hivr.example." },
  { pattern: /\b(medical\s+advice|diagnose|symptom|prescription)\b/i,
    reason: "I'm not a doctor. Please consult a medical professional." },
  { pattern: /\b(tax\s+advice|gst\s+filing|itr\s+filing|tax\s+return)\b/i,
    reason: "For tax-related questions please consult a chartered accountant or email tax@hivr.example." },
  { pattern: /\b(password|otp|pin|credit\s*card\s*number|aadhaar\s*number|pan\s*number)\b/i,
    reason: "For your security, please don't share sensitive personal info in chat. The HiVR team will never ask for it." },
];

/** Generic off-topic response. Returned when nothing on the KB matches. */
export const OFF_TOPIC_RESPONSE: string =
  "I'm not sure I can help with that from my knowledge base. For anything outside HiVR's core features, " +
  "please contact support at support@hivr.example or open a ticket at /dashboard/support.";
