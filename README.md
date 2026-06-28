# HiVR

> Small jobs, verified people.

HiVR is a niche remote-work marketplace that breaks traditional job roles into **hireable micro-tasks** (e.g. "fix one bug", "build one API endpoint", "clean one spreadsheet", "solve one calculus doubt") that can be hired by the hour, day, task, or month.

This repository is a **Phase 1 MVP scaffold** — see `MASTER_BUILD_PROMPT.md` for the full spec.

---

## Tech stack

- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Framer Motion, Lucide
- **Backend:** Next.js Server Actions + API routes (single repo)
- **Database:** PostgreSQL via Supabase (with pgvector for AI retrieval)
- **Auth:** Supabase Auth (email + phone OTP + Google OAuth)
- **Payments:** Razorpay Route (escrow / split payments)
- **AI:** OpenRouter (single `AI_MODEL` env var to swap providers)

## Quick start

### 1. Install

```bash
npm install
```

### 2. Set up Supabase

1. Create a project at https://supabase.com
2. Copy `.env.example` to `.env.local` and fill in your Supabase URL + keys
3. Run the migrations:

```bash
# Option A: Supabase CLI
supabase link --project-ref YOUR_REF
supabase db push

# Option B: paste `supabase/migrations/0001_init.sql` into the SQL editor in Supabase Studio
```

4. Enable the `pgvector` extension in Supabase Studio → Database → Extensions.

### 3. Seed categories

```bash
npm run db:seed
```

This inserts the full category tree (Active vs. Coming Soon, Tier A vs. B) defined in `scripts/seed.ts`.

### 4. Run

```bash
npm run dev
```

Visit http://localhost:3000

---

## Project structure

```
hivr/
├── app/                     # Next.js App Router
│   ├── (marketing)/         # Public pages: landing, browse, categories
│   ├── (auth)/              # Signin, signup, role selection
│   ├── (dashboard)/         # Logged-in employee/buyer dashboards
│   ├── admin/               # Admin panel (role-gated)
│   └── api/                 # Webhooks (Razorpay), API routes
├── components/              # UI components (shadcn/ui + custom)
│   ├── ui/                  # shadcn primitives
│   ├── layout/              # Navbar, sidebar, mobile drawer
│   ├── theme/               # Theme provider + switcher
│   └── ...feature components
├── lib/
│   ├── supabase/            # Supabase clients (server, client, middleware)
│   ├── ai.ts                # OpenRouter abstraction — all AI calls go through here
│   ├── escrow.ts            # Razorpay escrow helpers
│   ├── contact-detect.ts    # Anti-circumvention contact-info detector
│   ├── points.ts            # Loyalty-points ledger
│   ├── tier.ts              # Wage/trust tier logic
│   └── utils.ts
├── supabase/
│   └── migrations/          # SQL migrations (versioned)
├── scripts/                 # Seed, admin bootstrap
└── tests/                   # Vitest unit tests (escrow, contact-detect, tier logic)
```

---

## Two-tier task system (read this before touching the codebase)

| Tier | Examples | Pricing models | Verification |
|---|---|---|---|
| **A — Micro-Tasks** | Spreadsheet work, tech bug fixes, live mentoring | hourly / daily / monthly / fixed-per-task | Automated practical test (webcam-on) |
| **B — Role Engagements** | Full-stack dev, AI/ML eng, NLP eng, devops, mobile, design, PM | **daily-rate or fixed-milestone ONLY** (never hourly) | Portfolio review + live technical interview |

This distinction is enforced **server-side** in the database (CHECK constraints on `task_posts.pricing_model` and `contracts.pricing_model`), not just in the UI. See `supabase/migrations/0001_init.sql`.

## Anti-circumvention (Section 7.1)

Contact-info sharing is detected via three layers:

1. **Regex** — phone numbers, emails, common obfuscations
2. **Word-numbers** — "nine eight seven six" forming a phone number
3. **LLM second-pass** — semantic detection of indirect references

All AI calls go through `lib/ai.ts`. See `lib/contact-detect.ts`.

## Loyalty points (Section 8)

Points are **non-cash-convertible by design** (legal constraint — Indian PPI regulation). Redeemable for platform-fee discounts and perks only. Full ledger in `points_ledger`.

## Theming (Section 2)

Four modes: Light, Dark, Eye-shield, Automatic. Persisted to localStorage and synced to `users.theme_preference` for logged-in users. CSS variables defined in `app/globals.css` — never hardcode hex colors.

---

## Phase status

See `MASTER_BUILD_PROMPT.md` Section 13 for the full roadmap.

- [x] **Phase 1 (in progress):** scaffold, schema, theming, auth, role selection, category browser, employee onboarding, buyer post-task, contracts, escrow (sandbox), chat + leak detection, reviews, points, admin shell, AI assistant
- [ ] **Phase 2:** monthly category activation cadence, full wage-tier auto-promotion, resume AI-parsing, voice search, semantic search, Buyer Pro, Employee Boost
- [ ] **Phase 3:** remaining categories, Algolia, mobile app, B2B tools, advanced fraud ML

## License

Proprietary — all rights reserved.
