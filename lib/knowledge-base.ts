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
    keywords: ["fee", "fees", "commission", "cut", "charge", "charges", "pricing", "cost", "expensive", "price", "rate"],
    patterns: [
      "what does hivr charge",
      "how much does the platform take",
      "platform fee",
      "are there any fees",
      "why do you take a cut",
      "what is the pricing",
      "how much does it cost",
      "pricing plans",
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
  {
    topic: "what_is_hivr",
    keywords: ["what", "hivr", "platform", "about", "how", "works", "microtask", "freelance"],
    patterns: [
      "what is hivr",
      "how does hivr work",
      "tell me about hivr",
      "what kind of platform is this",
      "what does hivr do",
    ],
    answer:
      "HiVR is a platform for small jobs (micro-tasks) and larger projects. " +
      "Buyers post tasks — fix one bug, design a logo, clean a spreadsheet, build an API endpoint — and verified freelancers (employees) apply or get hired instantly. " +
      "Every user is identity-verified (Aadhaar/PAN), payments are escrow-protected via Razorpay, and communication stays on-platform until the contract is funded. " +
      "HiVR has 13 active categories and 6 coming soon. Browse categories at /categories.",
  },
  {
    topic: "signup",
    keywords: ["signup", "sign up", "register", "create", "account", "join", "onboarding"],
    patterns: [
      "how do i sign up",
      "how to create an account",
      "how to join hivr",
      "what do i need to sign up",
      "is signup free",
    ],
    answer:
      "Signing up is free and takes under 2 minutes. Go to /auth/signup, enter your name, phone number, and email/password. " +
      "You can sign up as a buyer (to post tasks and hire) or as an employee (to take skill tests and earn). " +
      "You can also choose both roles. After signup, complete your KYC (Aadhaar/PAN) to unlock contracts.",
  },
  {
    topic: "categories_info",
    keywords: ["category", "categories", "available", "domains", "skills", "list"],
    patterns: [
      "what categories are available",
      "how many categories are there",
      "list all categories",
      "what domains can i hire for",
      "what skills can i offer",
    ],
    answer:
      "HiVR has 13 active categories: Programming & Tech, Graphic Design & Creative, AI Services, Digital Marketing, Writing & Translation, Video & Animation, Data & Analytics, Business Support & Admin, Finance & Accounting, Photography, QA & Testing, SAP & ERP, Sales & Customer Support. " +
      "6 more categories are coming soon: Business Consulting, Music & Audio, Architecture & Engineering, Legal Services, Education & Coaching, Product Design & Manufacturing. " +
      "Explore all categories at /categories.",
  },
  {
    topic: "gigs",
    keywords: ["gig", "gigs", "service", "services", "offer", "listing", "sell", "package"],
    patterns: [
      "what are gigs",
      "how do gigs work",
      "how do i create a gig",
      "can i sell services on hivr",
      "what is a gig listing",
    ],
    answer:
      "Gigs are fixed-price service listings that employees create. Each gig has a title, description, deliverables, pricing (fixed or 3-tier package), and delivery time. " +
      "Buyers browse gigs in each category and can hire instantly or message the employee first. " +
      "To create a gig, go to your dashboard when in employee mode and click 'Create Gig'. " +
      "Gigs are different from task posts — gigs are pre-packaged services, while tasks are custom requests posted by buyers.",
  },
  {
    topic: "browse_tasks",
    keywords: ["browse", "task", "tasks", "open", "find", "work", "apply", "opportunity"],
    patterns: [
      "how do i find tasks",
      "how to browse open tasks",
      "how do i apply to a task",
      "where can i see available work",
      "find work as freelancer",
    ],
    answer:
      "You can browse all open tasks at /browse. Filter by category, budget, or tier. " +
      "Each task shows the title, budget range, category, and how long ago it was posted. " +
      "Click on a task to see details and apply. You must be signed up as an employee with the matching skill category to apply. " +
      "If a category is still 'coming soon', you can join the waitlist to be notified when it launches.",
  },
  {
    topic: "how_to_hire",
    keywords: ["hire", "buyer", "post", "task", "find", "freelancer", "employee", "contract"],
    patterns: [
      "how do i hire someone",
      "how to post a task as buyer",
      "how to find freelancers",
      "how do i start hiring",
      "what is the hiring process",
    ],
    answer:
      "As a buyer, you can hire in two ways: " +
      "1) Post a task at /dashboard/post — describe what you need, set your budget, and receive applications from verified freelancers. " +
      "2) Browse employee profiles at /find-people and send a hire offer or message them directly. " +
      "Once you find the right person, fund the contract in escrow. The freelancer starts work, and you release payment when satisfied.",
  },
  {
    topic: "become_employee",
    keywords: ["employee", "freelancer", "earn", "work", "skill", "test", "side", "income"],
    patterns: [
      "how do i become an employee",
      "how to start earning on hivr",
      "how to become a freelancer",
      "what do i need to work",
      "how to take a skill test",
    ],
    answer:
      "To become an employee on HiVR: " +
      "1) Sign up with the employee role (or add it later from your dashboard). " +
      "2) Complete your profile at /dashboard/profile — add your skills, experience, and portfolio. " +
      "3) Take skill tests in your chosen categories to get verified and set your wage band. " +
      "4) Once verified, you can apply to open tasks at /browse or create gigs that buyers can purchase directly. " +
      "You need Aadhaar/PAN verification to unlock paid contracts.",
  },
  {
    topic: "freelancer_profiles",
    keywords: ["profile", "people", "find", "freelancer", "employee", "search", "browse"],
    patterns: [
      "how do i find freelancers",
      "how to browse employee profiles",
      "can i see who is available",
      "how to search for people",
      "find people page",
    ],
    answer:
      "You can browse all verified freelancers at /find-people. " +
      "Each profile shows the freelancer's headline, skills, ratings, completion rate, and a portfolio of completed work. " +
      "You can filter by category, rating, or search by name. " +
      "Click on a profile to view details, see their gigs, and send a message or hire offer.",
  },
  {
    topic: "skill_test",
    keywords: ["skill", "test", "assessment", "exam", "quiz", "wage", "band", "level"],
    patterns: [
      "what are skill tests",
      "how do skill tests work",
      "how to take a skill assessment",
      "how are wages set",
      "what is wage band",
    ],
    answer:
      "Skill tests are 20-minute multiple-choice assessments in your chosen category. " +
      "Your score determines your wage band (minimum and maximum rates) for that category. " +
      "Higher scores unlock higher pay and better visibility in search results. " +
      "You can retake a skill test once every 30 days. Access skill tests from your dashboard.",
  },
  {
    topic: "modes_switching",
    keywords: ["mode", "switch", "toggle", "buyer", "employee", "both", "role", "change"],
    patterns: [
      "how do i switch between buyer and employee",
      "how to change my mode",
      "what is buyer mode",
      "what is employee mode",
      "can i be both buyer and employee",
    ],
    answer:
      "If you have both buyer and employee roles, you can switch between modes from your dashboard using the mode switcher at the top. " +
      "In buyer mode, you can post tasks, hire freelancers, and manage contracts. " +
      "In employee mode, you can browse tasks, apply for work, create gigs, and manage your earnings. " +
      "You can also select 'Both' to see everything in one view. " +
      "If you only have one role, you can add the other role from your dashboard settings.",
  },
  {
    topic: "contracts_workspace",
    keywords: ["contract", "workspace", "milestone", "deliverable", "approve", "reject", "chat"],
    patterns: [
      "what is a workspace",
      "how do contracts work",
      "how to approve work",
      "what are milestones",
      "how to chat with freelancer",
    ],
    answer:
      "Once a contract is funded, a shared workspace opens for both parties. " +
      "The workspace includes: a chat with file sharing, milestone tracking, a deliverable approval flow, and a dispute button. " +
      "The freelancer submits work, the buyer reviews and approves/rejects. " +
      "On approval, the escrowed funds are released to the freelancer. " +
      "Access your active workspaces from your dashboard.",
  },
  {
    topic: "subscription",
    keywords: ["subscription", "plan", "premium", "pro", "monthly", "yearly", "billing"],
    patterns: [
      "is there a subscription plan",
      "what are the subscription plans",
      "do i need to pay monthly",
      "what is premium on hivr",
      "subscription benefits",
    ],
    answer:
      "HiVR offers optional subscription plans for both buyers and employees. " +
      "Subscriptions provide benefits like reduced platform fees, priority support, featured profile placement, and more. " +
      "You can view and manage your subscription at /dashboard/subscription. " +
      "Free accounts can still post tasks, apply for work, and complete contracts — subscriptions are entirely optional.",
  },
  {
    topic: "support_contact",
    keywords: ["support", "help", "contact", "email", "ticket", "query", "assistance", "question"],
    patterns: [
      "how do i contact support",
      "i need help with something",
      "how to open a support ticket",
      "what is the support email",
      "i have a question",
    ],
    answer:
      "For help, you can: " +
      "1) Open a support ticket at /dashboard/support. " +
      "2) Email us at hivr20206@gmail.com. " +
      "3) Use this Ask HiVR chatbot for general platform questions. " +
      "Our support team typically responds within 24 hours on business days. " +
      "For urgent issues related to active contracts, please open a dispute from the workspace.",
  },
  {
    topic: "home_page",
    keywords: ["home", "landing", "page", "start", "welcome", "hero"],
    patterns: [
      "what is on the home page",
      "how to get started",
      "what should i do first",
      "where do i begin",
      "explain the home page",
    ],
    answer:
      "The HiVR home page at / shows you everything in one place: " +
      "- The hero section explains HiVR's value proposition: small jobs with verified people. " +
      "- You can browse active and coming-soon categories in the 3D rotating gallery. " +
      "- Featured open tasks and featured employees are shown to help you get started. " +
      "- The 'How it works' section explains the process for both buyers and employees. " +
      "- Scroll down to find the CTA to sign up and get started.",
  },
  {
    topic: "coming_soon",
    keywords: ["coming", "soon", "launch", "waitlist", "notify", "upcoming", "new", "categories", "roadmap"],
    patterns: [
      "when will new categories launch",
      "how do i join the waitlist",
      "what categories are coming soon",
      "when is x category launching",
      "can i request a new category",
      "how to get notified",
    ],
    answer:
      "We're actively developing new categories based on waitlist demand. Currently 6 categories are coming soon: Business Consulting, Music & Audio, Architecture & Engineering, Legal Services, Education & Coaching, Product Design & Manufacturing. " +
      "You can join the waitlist for any coming-soon category from the categories page at /categories. " +
      "We'll notify you by email when the category launches. New categories typically launch every 4–6 weeks.",
  },
  {
    topic: "contact_support",
    keywords: ["support", "help", "contact", "email", "ticket", "query", "assistance"],
    patterns: [
      "how do i contact support",
      "i need help with something",
      "how to open a support ticket",
      "what is the support email",
      "i have a problem",
    ],
    answer:
      "For any questions or issues, you can reach us at: " +
      "Email: hivr20206@gmail.com (or hivr2026@gmail.com). " +
      "Support ticket: /dashboard/support. " +
      "Our team typically responds within 24 hours on business days. " +
      "For urgent issues with active contracts, please open a dispute from the workspace chat.",
  },
  {
    topic: "greetings",
    keywords: ["hello", "hi", "hey", "heyyy", "heyya", "heya", "greetings", "good morning", "good evening", "howdy", "sup", "yo", "hay"],
    patterns: [
      "hello",
      "hi there",
      "heyyy",
      "hey hivr",
      "good morning",
      "whats up",
      "howdy",
    ],
    answer:
      "Hey there! Welcome to HiVR. I'm the platform assistant and I can help you with anything about HiVR — fees, verification, escrow, categories, hiring, and more. What would you like to know?",
  },
  {
    topic: "how_are_you",
    keywords: ["how", "are", "you", "doing", "today", "feeling"],
    patterns: [
      "how are you",
      "how are you doing",
      "you doing well",
      "how is it going",
      "how r u",
    ],
    answer:
      "I'm doing well, thanks for asking! Ready to help you with any questions about HiVR. What can I assist you with today?",
  },
  {
    topic: "thanks",
    keywords: ["thank", "thanks", "thank you", "ty", "appreciate", "grateful"],
    patterns: [
      "thank you",
      "thanks a lot",
      "thanks for the help",
      "appreciate it",
      "thank you so much",
    ],
    answer:
      "You're very welcome! Happy to help. If you have any more questions, feel free to ask anytime. Good luck!",
  },
  {
    topic: "who_are_you",
    keywords: ["who", "are", "you", "what", "assistant", "chatbot", "name", "ai"],
    patterns: [
      "who are you",
      "what are you",
      "what is your name",
      "are you an ai",
      "tell me about yourself",
    ],
    answer:
      "I'm the HiVR platform assistant! I help users understand how HiVR works — escrow, fees, verification, categories, hiring, gigs, subscriptions, and more. I'm powered by HiVR's knowledge base and can answer most platform questions instantly. For anything outside my knowledge, you can reach our support team at hivr20206@gmail.com.",
  },
  {
    topic: "bye",
    keywords: ["bye", "goodbye", "see you", "cya", "gtg", "later", "farewell"],
    patterns: [
      "goodbye",
      "bye",
      "see you later",
      "catch you later",
      "gotta go",
    ],
    answer:
      "Goodbye! Thanks for stopping by. If you ever need help, just open this chat again. Have a great day!",
  },
];

/**
 * Refusal patterns. The assistant will NOT answer these — it routes
 * the user to human support. Keep this list short and HIGH-precision
 * (we don't want false positives).
 */
export const REFUSAL_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\b(hack|exploit|bypass\s+verification|cheat\s+the\s+system|scam\s+others|fraudulently)\b/i,
    reason: "I can only help with legitimate questions about HiVR. For anything involving system abuse, please contact support at hivr20206@gmail.com." },
  { pattern: /\b(legal\s+advice|sue|lawsuit|court\s+case|attorney)\b/i,
    reason: "I'm not qualified to give legal advice. Please consult a lawyer or email support at hivr20206@gmail.com." },
  { pattern: /\b(medical\s+advice|diagnose|symptom|prescription)\b/i,
    reason: "I'm not a doctor. Please consult a medical professional." },
  { pattern: /\b(tax\s+advice|gst\s+filing|itr\s+filing|tax\s+return)\b/i,
    reason: "For tax-related questions please consult a chartered accountant or email support at hivr20206@gmail.com." },
  { pattern: /\b(password|otp|pin|credit\s*card\s*number|aadhaar\s*number|pan\s*number)\b/i,
    reason: "For your security, please don't share sensitive personal info in chat. The HiVR team will never ask for it." },
  { pattern: /\b(admin\s*panel|admin\s*dashboard|admin\s*login|revenue|earning|dashboard\s*stat|platform\s*revenue|total\s*user|gmv|monthly\s*recurring)\b/i,
    reason: "I can't provide internal platform metrics or admin information. For any queries, please contact our support team at hivr20206@gmail.com or open a ticket in the support section." },
];

/** Generic off-topic response. Returned when nothing on the KB matches. */
export const OFF_TOPIC_RESPONSE: string =
  "I'm not sure I can help with that from my knowledge base. For anything outside HiVR's core features, " +
  "please contact our support team at hivr20206@gmail.com or open a ticket at /dashboard/support.";
