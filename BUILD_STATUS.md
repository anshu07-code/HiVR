# HiVR — Build status & what's next

This repo contains a Phase 1 MVP scaffold of HiVR. Built for a Windows + PowerShell environment, Next.js 14 (App Router), Supabase, Razorpay Route, OpenRouter.

## What works end-to-end

- **Project scaffold** — Next.js 14, TS, Tailwind, shadcn-style components, all 4 themes (Light / Dark / Eye-shield / Auto) with localStorage + server sync.
- **Full database schema** — every table, enum, RLS policy, index, and the two-tier CHECK constraints in `supabase/migrations/0001_init.sql`.
- **Category tree** — `npm run db:seed` populates the full taxonomy (3 Active Tier A, 3 Active Tier B, 11 Coming Soon).
- **Auth** — email + Google OAuth + phone OTP via Supabase; role selection on signup (buyer / employee / both).
- **Theming system** — 4 modes, sliding indicator, persisted, syncs to user profile.
- **Landing page** — hero, two-tier explainer, category showcase, how-it-works, testimonials, CTA.
- **Categories page** — full taxonomy with waitlist capture for Coming Soon.
- **Browse page** — filters by tier + pricing + category.
- **Post-task flow** — with the database-enforced tier↔pricing constraint honored in the UI.
- **Employee onboarding** — multi-step wizard: profile → ID verification (mocked provider) → tier choice → skill test (Tier A) or interview waitlist (Tier B).
- **Skill test runner** — MCQ + practical, proctored flag, proctoring metadata, deterministic question selection per attempt, 7-day retake window. Runs against a seeded question bank (see below).
- **Skill question bank** — admin UI at `/admin/skills/questions` to add/edit/delete MCQ and practical questions per category. Seeded with 34 real questions across the 3 active Tier A categories. RLS hides `correct_answer` from employees; only admins can see it.
- **Interview booking** — Tier B and level-up slots. Admin can add panel members, create slots, employees book from `/dashboard/interviews`, interviewer uploads a scorecard. Pass/fail drives tier upgrade.
- **Dashboard** — KPIs, contracts, skills, verification status, points.
- **Contracts + chat** — contact-info detection at three layers (regex, word-numbers, LLM second-pass). Block → warn → auto-suspend after 3 strikes.
- **Milestones** — for Tier B fixed-milestone contracts; per-milestone escrow-release cycle.
- **Razorpay webhooks** — full lifecycle: `order.paid` / `payment.captured` / `payment.authorized` / `payment.failed` / `transfer.processed` / `transfer.failed` / `refund.processed` / `refund.failed`. Idempotent, audited, retryable from admin.
- **Loyalty points** — non-cash by design; full ledger visible.
- **Admin panel** — Overview, Users, Verifications queue, Categories (with the "go Live" toggle), Disputes (with money-movement resolution), Finance, Webhook log (with retry), Skill Questions, Interviews, Platform settings (all editable).
- **AI assistant** — floating launcher, RAG over `faq_documents` via pgvector, response cache, refusal pattern for legal/medical/financial.
- **AI description-improvement endpoint** — used by the post-task form.
- **Vitest tests** — contact-detect (regex + word-numbers), tier logic, points, escrow (signature + idempotency + envelope shape), dispute split math, skill question selection + grading, schemas.

## What needs real keys / services to fully run

You must fill in `.env.local` (copy from `.env.example`):
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY` — get from a Supabase project
- `OPENROUTER_API_KEY` — for the AI assistant + description improvement + LLM contact-detect second pass
- `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` + `RAZORPAY_WEBHOOK_SECRET` — get from Razorpay (Test Mode is fine for now)
- `BYPASS_RAZORPAY_PAYOUTS=true` — keep set during local dev; enables `/api/webhooks/razorpay/dev-simulate` so you can drive the full payment lifecycle without a Razorpay account

Without these the app falls back to:
- Mocked verification (accepts `9999XXXXXXXX` as Aadhaar, etc.)
- Mocked Razorpay orders
- AI assistant returns "API key not configured" errors

## Setup steps

```bash
# 1. Install
npm install

# 2. Copy and fill env
cp .env.example .env.local
# edit .env.local with your Supabase + OpenRouter + Razorpay keys

# 3. Apply migrations (in Supabase Studio's SQL editor, or via CLI)
#    - supabase/migrations/0001_init.sql
#    - supabase/migrations/0002_seed_faq.sql
#    - supabase/migrations/0003_match_faq_fn.sql
#    - plus all 0xxx_*.sql in supabase/migrations/

# 4. Seed the category tree
npm run db:seed

# 5. Seed the skill question bank (NEW — needed for the test runner to work)
npm run db:seed:questions

# 6. (Optional) embed the FAQ docs for RAG
npm run embed-faq

# 7. Promote yourself to super admin
#    a. sign up via the app
#    b. set ADMIN_BOOTSTRAP_EMAIL=you@example.com in .env.local
#    c. npx tsx scripts/bootstrap-admin.ts

# 8. Run
npm run dev
```

## Testing payments locally (no Razorpay account needed)

With `BYPASS_RAZORPAY_PAYOUTS=true`:

1. Create a contract via the UI (or `POST /api/contracts/create`). This creates a `payments` row in `created` status.
2. Drive the lifecycle from the dev simulator:
   ```bash
   # Buyer paid — money in escrow
   curl -X POST http://localhost:3000/api/webhooks/razorpay/dev-simulate \
     -H "content-type: application/json" \
     -d '{"contractId":"<contract-uuid>","event":"order.paid"}'

   # Payout to employee — escrow released
   curl -X POST http://localhost:3000/api/webhooks/razorpay/dev-simulate \
     -H "content-type: application/json" \
     -d '{"contractId":"<contract-uuid>","event":"transfer.processed"}'
   ```
3. Check `/admin/webhooks` for the audit log; use the Retry button to re-run any failed event.

## What to build next (Phase 1 polish → Phase 2)

These are intentionally NOT done yet — they're either (a) large enough to deserve their own session, or (b) require a real third-party integration.

### Phase 1 polish (small, do these next)
- [ ] Add the `How It Works` static page (template ready at `app/how-it-works/page.tsx` — fleshed out)
- [ ] Add the `Pricing` page (template ready)
- [ ] Add the `Trust & Safety` page
- [ ] Add Terms, Privacy, Grievance Officer pages
- [ ] Wire the AI assistant's realtime channel (currently uses polling-style refresh)
- [ ] Add image/file uploads for resumes and ID docs (Supabase Storage)
- [ ] Phone OTP UI flow for sign-up (the backend is ready, the front-end partial)
- [ ] **Tier B interview scheduler** UI — slots, scorecard, admin view (backend complete; UI is good but could use polish)
- [ ] **Voice search** (Section 9.3) — Web Speech API
- [ ] **Resume AI parsing** (Section 9.2) — backend ready in `lib/ai.ts`, needs the upload form

### Phase 2 (after you have real users)
- [ ] Real Surepass / Signzy / HyperVerge / DigiLocker integration (replace mock in `lib/verification.ts`)
- [ ] Real Razorpay Route production keys + KYC for transfers
- [ ] Monthly category activation: pick highest-waitlist category, build its question bank, flip the status to "active" from the admin panel
- [ ] Dispute resolution console with full message/contract/deliverables view (currently the open-list + resolve form; needs a deep-link view)
- [ ] Repeat-client fee logic
- [ ] Buyer Pro subscription + Employee Boost (paid features)
- [ ] PAN / Passport / DL real flows

### Phase 3 (scale)
- [ ] Algolia/Typesense upgrade when FTS lags
- [ ] React Native mobile app reusing API
- [ ] B2B bulk-hiring tools + analytics
- [ ] Advanced fraud ML (after enough labelled data exists from real usage)

## File map (where to look when you want to extend)

| You want to… | Open this file |
|---|---|
| Add a new category tier / status | `supabase/migrations/0001_init.sql` + `scripts/seed.ts` |
| Change a platform fee % or threshold | `app/admin/settings/page.tsx` (live) or `lib/settings.ts` (defaults) |
| Add a new admin role | `lib/supabase/types.ts` (AdminRole enum) + RLS policies in `0001_init.sql` |
| Add a new pricing model | `lib/constants.ts` + `lib/schemas.ts` + DB CHECK in `0001_init.sql` |
| Change the contact-info detector | `lib/contact-detect.ts` (covered by tests in `tests/contact-detect.test.ts`) |
| Change wage-tier rules | `lib/tier.ts` + `lib/settings.ts` |
| Add an AI feature | `lib/ai.ts` (the single chokepoint — never call OpenRouter directly elsewhere) |
| Tweak the landing-page copy | `app/page.tsx` |
| Tweak the navbar | `components/layout/public-navbar.tsx` |
| Tweak the dashboard sidebar | `components/layout/dashboard-sidebar.tsx` |
| Tweak the post-task form | `app/dashboard/post/post-task-form.tsx` |
| Tweak the skill test UI | `app/dashboard/skills/test/test-runner.tsx` |
| Add/edit skill questions | `app/admin/skills/questions/page.tsx` (UI) + `scripts/seed-skill-questions.ts` (bulk seed) |
| Change the question selection / grading | `lib/skill-questions.ts` (covered by `tests/skill-questions.test.ts`) |
| Add a Razorpay webhook event | `app/api/webhooks/razorpay/route.ts` (`processRazorpayEvent` switch) |
| Retry a failed webhook | admin UI at `/admin/webhooks` (calls `POST /api/admin/webhooks/retry`) |
| Change the dispute split math | `supabase/migrations/0101_dispute_escrow_release.sql` (`compute_dispute_split`) + mirror in `tests/dispute-escrow.test.ts` |
| Re-run Razorpay money movement after a partial failure | admin UI at `/admin/disputes` (calls `POST /api/admin/disputes/[id]/reprocess`) |
| Schedule an interview slot | `app/admin/interviews/page.tsx` + `app/admin/interviews/actions.ts` |
| Change the level-up promotion logic | `supabase/migrations/0090_level_up_interviews_and_fee_schedule.sql` (`evaluate_level_up` + `upload_interview_result`) |

## Known limitations & TODOs in the code

Search the code for `TODO` to find them all. The main ones:
- `lib/escrow.ts` - real Razorpay Route calls (currently sandbox-mocked; flip to real once you have a Razorpay account in test mode)
- `lib/verification.ts` - real Surepass/Signzy/DigiLocker integration

### Pre-launch security hardening (DONE)

A full audit was run before launch and every Critical + High finding was patched. The helpers live in `lib/security.ts` and the test coverage is in `tests/security.test.ts` (44 tests).

What was fixed (file by file):

- **C1 — File-upload XSS via SVG.** All four upload routes (`/api/profile/upload-avatar`, `/api/profile/upload-cover`, `/api/messages/upload`, `/api/workspace/vault/upload`) now use `validateUploadedFile()` which:
  - Reads the first 32 bytes and runs magic-byte sniffing (`identifyFileFormat`).
  - Rejects any file whose magic bytes don't match the allow-list (JPEG/PNG/WebP/GIF for images, MP4/WebM/MOV for video, MP3/M4A/WAV/OGG/WebM for audio, PDF for documents).
  - Rejects SVG explicitly (can contain inline `<script>` — stored-XSS vector in a public bucket).
  - Caps file size (5 MB avatars, 8 MB covers, 25 MB messages, 25 MB vault).
  - Replaces the browser-supplied extension with the canonical extension detected from the magic bytes.
  - Replaces the browser-supplied `file.type` with the canonical MIME in the storage upload (so the bytes are served as the right type even if the attacker lies).
  - Sanitises the original filename (no path traversal, no control chars, no leading dots, length cap).

- **C2 — `/api/instant-hire/expire` had no auth + no ownership.** Now requires sign-in, validates the offer_id is a UUID, looks up the offer's contract, and rejects any caller who isn't the buyer or the candidate. Also adds a 30/min per-user rate limit. The companion RPC `expire_instant_hire_offer` is patched (migration `0102`) to cancel the `pending_acceptance` contract when the offer expires (so it doesn't sit in limbo).

- **C3 — Dead admin route.** Deleted `app/api/admin/resolve-dispute/route.ts`. The proper endpoint `/api/admin/disputes/[id]/resolve` is the only one that resolves disputes and it has the full role check + body validation + advisory lock + money movement.

- **H1 — Contract creation had no price cap, no employee-id check, no category-active check.** Now:
  - `agreed_price_inr` must be a positive number, ≤ `MAX_CONTRACT_AMOUNT_PAISE` (₹50,00,000) and ≥ ₹100.
  - Rejects scientific notation, NaN, infinity, fractional.
  - `employee_id` must be a valid UUID, must exist, must not equal the buyer, must not be suspended, must be in `employee` or `both` mode.
  - `category_id` must be a valid UUID, must exist, must be `status = 'active'`, and the category's tier must match the requested `tier`.
  - 10 contracts per user per hour (each call creates a real Razorpay order).

- **H2 — Instant-hire contracts counted as 'active' before the candidate accepted.** New migration `0102_instant_hire_pending_acceptance.sql` adds `'pending_acceptance'` to the `contract_status` enum. The route inserts the contract as `pending_acceptance` (with `started_at = NULL`). The `respond_instant_hire_offer` and `initiate_instant_hire_offer` RPCs are patched to flip the contract to `'active'` on accept (or auto-accept), and to `'cancelled'` on decline/expire. The `initiate_instant_hire_cascade` cron is patched the same way. A new view `v_really_active_contracts` exposes only `status = 'active'` for dashboards / load counts.

- **H3 — No rate limits on expensive endpoints.** Added:
  - `contract_create:<user>` — 10/hour
  - `instant_hire_instant:<user>` — 5/hour
  - `instant_hire_expire:<user>` — 30/min
  - `vault_upload:<user>` — 20/hour
  - `assistant_ask:<user>` — 20/5min

- **H4 — Avatar / cover had no size cap, no magic-byte check.** Fixed in C1 (see above) — both now use `validateUploadedFile()` with the right size cap and the canonical extension.

- **H5 — AI assistant endpoint had no auth, no rate limit, no prompt-injection guard.** Now requires sign-in, applies a 20/5min per-user rate limit, caps question length at 2000 chars, rejects obvious system-prompt injections (`/^\s*(system|assistant|user)\s*:/im`), and prefixes every user-supplied `system` override with a fixed safety block.

- **H6 — Weak random fallback in vault upload.** Removed. The vault route now calls `secureRandomId()` from `lib/security.ts` which always uses `crypto.randomUUID()`. The function never falls back to `Math.random()`.

- **H7 — `/api/messages/upload` accepted any `folder_id` regardless of contract.** Now requires `folder_id` (if provided) to be a valid UUID AND to belong to the same `contract_id` (verified by reading `contract_folders.contract_id`). Mismatched folder → 403.

Helpers in `lib/security.ts` (all unit-tested in `tests/security.test.ts`):
- `SecurityError` — typed error with a `status` field for clean HTTP responses.
- `identifyFileFormat(buf)` — magic-byte sniffer, returns null for anything not on the allow-list.
- `validateUploadedFile(file, group, maxBytes)` — combines size cap + format detection + allow-list enforcement.
- `sanitizeFilename(name, maxLen)` — strips path traversal, control chars, leading dots.
- `requireUuid(value, field)` — strict UUID validator that throws on SQL-injection attempts.
- `requirePositiveInt(value, opts)` — bounded integer validator.
- `requirePaiseAmount(value, field)` — paise (integer) validator.
- `MAX_CONTRACT_AMOUNT_PAISE` / `MAX_MILESTONE_AMOUNT_PAISE` — shared cap constants.
- `secureRandomId()` / `secureToken(bytes)` — cryptographically secure random IDs / tokens.
- `timingSafeEqual(a, b)` — constant-time string comparison for HMAC tags.
- `enforceRateLimit(key, opts)` — in-memory token bucket. Throws `SecurityError(429)` on overflow.
- `_resetRateLimits()` — exported for tests.

### Razorpay webhook handler (DONE)

The full Razorpay webhook lifecycle is implemented at `app/api/webhooks/razorpay/route.ts`:
- `order.paid`, `payment.captured`, `payment.authorized`, `payment.failed`, `transfer.processed`, `transfer.failed`, `refund.processed`, `refund.failed` are all handled.
- Idempotency is keyed on Razorpay's `payload.id` (e.g. `evt_ABC123`); the existing unique index on `webhook_events.event_id` prevents double-processing.
- Every status transition is mirrored to `payment_status_history` for audit.
- The contract is only flipped to `active` if it hasn't already moved on (never overwrites `disputed` / `completed`).
- On `payment.failed` the contract is auto-cancelled and the buyer is notified.
- Admin can retry any failed/pending event from `/admin/webhooks` (calls `POST /api/admin/webhooks/retry`).
- For local development, `POST /api/webhooks/razorpay/dev-simulate` drives the full lifecycle without a Razorpay account (gated by `BYPASS_RAZORPAY_PAYOUTS=true`).
- Tested in `tests/escrow.test.ts` (16 tests, all green).

### Dispute resolution escrow actions (DONE)

Dispute resolution now actually moves money. Before this fix, the `resolve_dispute` RPC would mark the dispute as resolved, update the contract, and strike the loser — but it never refunded the buyer or paid the employee. The `payments` row would stay `in_escrow` indefinitely.

What is wired up now:
- `supabase/migrations/0101_dispute_escrow_release.sql` rewrites `resolve_dispute` to do the money movement in a single transaction (advisory-locked on the dispute id for race-safety). The wallet-funded path is handled inside the SQL (calls `wallet_credit` for buyer and/or employee, writes `payment_status_history`, marks the payment `released` / `refunded`). The Razorpay path records the intent (refund_paise / payout_paise on the dispute row) and a Node helper does the HTTP call after the RPC returns.
- `lib/dispute-escrow.ts` is the Node helper that detects whether a contract was funded by Razorpay or by the buyer's wallet, then calls `refundBuyer` / `releaseToEmployee` from `lib/escrow.ts` accordingly. Idempotent: if a previous attempt crashed, you can re-run it.
- `app/api/admin/disputes/[id]/resolve` is the new admin endpoint. Wraps the RPC and the Node helper in one round-trip. Returns the money movement result (Razorpay ids, errors) so the UI can show what happened.
- `app/api/admin/disputes/[id]/reprocess` re-runs only the Node helper. Use this if the RPC succeeded but Razorpay was down — you do not have to re-resolve the dispute.
- `app/admin/disputes/dispute-resolution-form.tsx` is the new client form. It previews the money split (refund / payout / retained) before submit, supports a configurable employee share % for split resolutions (range slider, 0-100%), and shows the Razorpay ids after a successful run.
- `app/admin/disputes/dispute-reprocess-button.tsx` is the recovery button for the "Recently resolved" list. Visible whenever the escrow call failed (the dispute has `escrow_processing_error` set) or was never attempted.
- `public.compute_dispute_split(amount, fee, resolution, employee_share_pct)` is a pure SQL function exposed to authenticated users. Lets the admin UI preview the split without doing the math in TypeScript.
- Both parties (not just the raiser) get a personalised notification with the exact amount they will receive or be charged.
- 12 vitest cases for the split math (in `tests/dispute-escrow.test.ts`) including conservation: `payout + refund + retained == disputed amount` for every case.

### Skill question bank (DONE)

Before this, the test runner at `/dashboard/skills/test?category=<slug>` showed "No questions in the bank for this category yet" for every category.

What is wired up now:
- `scripts/seed-skill-questions.ts` ships a starter bank of **34 real, industry-relevant questions** across the 3 active Tier A categories (`spreadsheet-data-work` = 12 MCQ + 5 practical, `tech-micro-tasks` = 12 MCQ + 5 practical, `mentoring-live-doubt-solving` = 12 MCQ + 5 practical). Run with `npm run db:seed:questions`.
- `lib/skill-questions.ts` is the pure-TS library for deterministic question selection and grading. The test runner picks 8 MCQ + 2 practical per attempt, seeded by the attempt id so re-loading the page doesn't reshuffle. MCQ are auto-graded, practical questions need a human admin (via the rubric and an `admin_score` field on the answer).
- `app/admin/skills/questions/page.tsx` is the admin page to add/edit/delete questions per category, with the `correct_answer` field always hidden from the employee (enforced by RLS).
- `app/api/admin/skills/questions` (GET/POST) and `app/api/admin/skills/questions/[id]` (PATCH/DELETE) are the API routes. The GET response includes the `correct_answer` because the caller is an admin; the employee-side query does not.
- The test runner now:
  - creates an attempt row on the server before showing questions (so the page is refresh-stable)
  - uses the seeded PRNG to pick 8 MCQ + 2 practical
  - supports both MCQ (radio) and practical (textarea) inputs
  - writes the attempt result and updates `employee_skills` (verified or provisional) in one round-trip
- Practical question grading by an admin (rubric + score) is recorded on the attempt `answers` JSON as `{ text, admin_score }`; the page surfaces "some questions still pending human review" until all practicals are scored.
- 13 vitest cases for the selection + grading logic in `tests/skill-questions.test.ts`, including a determinism check (same attempt id → same selection).
- Tier B categories (full-stack dev, AI/ML, NLP) intentionally use the **interview flow** instead of a question bank — interviews are scheduled by admins and the human interviewer makes the call.

### Interview scheduler (DONE)

- `app/admin/interviews/page.tsx` is the panel-management console: list panel members, create Tier B slots, create level-up slots with a specific `target_tier` (`verified` / `track_record` / `top_rated`), record rubric-scored pass/fail on booked slots.
- `app/admin/interviews/interviews-client.tsx` is the client island: panel add/remove, level-up slot creation, and the **inline scorecard form** (was previously a `window.prompt()` — now it's a proper per-booking form with notes, pass/fail buttons, and a result toast). 
- `app/api/interviews/slots/create` and `app/api/interviews/result` are the create + scorecard endpoints.
- `app/dashboard/interviews/page.tsx` is the employee view: list of own bookings + level-up CTA. `app/dashboard/interviews/book/page.tsx` is the booking flow. `app/dashboard/interviews/[id]/page.tsx` is the booking detail.
- The level-up evaluation RPC (`evaluate_level_up`) checks the `level_up_thresholds` platform setting against the employee's actual stats; the result-upload RPC atomically updates the booking + checks the threshold again, promoting the employee only if all criteria are now met.
