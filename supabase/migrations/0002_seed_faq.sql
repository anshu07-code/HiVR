-- ============================================================================
-- 0002 — FAQ + AI cache seed (small, no embeddings yet — run scripts/embed-faq
--        after this to populate pgvector rows).
-- ============================================================================

insert into public.faq_documents (title, content, category) values
('How escrow works',
 'When a buyer hires an employee, the agreed amount is paid into Razorpay''s Route escrow at contract creation. The money is held by the regulated payment processor, not by HiVR''s bank account. Funds release to the employee only when the buyer approves the delivered work. If the buyer takes no action and does not raise a dispute within the auto-release window (default 5 days, configurable in platform settings), escrow releases automatically. Disputes pause auto-release and route to admin review.',
 'payments'),

('Platform fee structure',
 'HiVR charges a percentage of each contract''s value, taken from the employee''s payout. The standard fee is 20% and is reduced for higher trust tiers (Track-Record 18%, Top-Rated 15%). Repeat hires between the same buyer and employee pay only 9%. Tips carry a small flat 5% platform cut. All percentages are admin-editable in Platform Settings.',
 'payments'),

('Identity verification',
 'Aadhaar verification is required for all employees. Once lifetime earnings cross the PAN threshold (default ₹20,000), PAN verification becomes mandatory before further payouts. Optional secondary ID (Passport / DL) raises your trust badge. Liveness selfie match is required at signup and again before the first payout, with periodic random rechecks.',
 'verification'),

('Skill verification (Tier A — Micro-Tasks)',
 'For each Active category you claim, you must pass a timed, proctored practical test. Pass threshold defaults to 70% and is admin-tunable. Failing does not reject you — you are placed in the Provisional / New Talent tier with a lower starting wage ceiling and a "New Talent" badge, and may retake after a 7-day cooldown. Pass and you are Skill-Verified for that category. Skills are re-tested every 6 months or after 3 consecutive bad reviews.',
 'verification'),

('Skill verification (Tier B — Role Engagements)',
 'For Tier B categories (Full Stack, AI/ML, NLP, etc.) you must pass an automated baseline practical test, then book and pass a live technical interview with an admin or senior verified employee. The interview uses a category-specific rubric (system design, real debugging, communication, etc.). Tier B is never auto-passed by the automated test alone. On fail, you may reapply after a 30-day cooldown with written feedback.',
 'verification'),

('How wage tiers work',
 'Provisional / New Talent — starting tier for freshers and failed test takers; lowest wage band. Skill-Verified — passed the test; standard wage band. Track-Record — 10+ contracts, 4.5+ rating, 90%+ completion; wage band +15%, auto-promoted with an in-app notification. Top-Rated / Pro — 50+ contracts, 4.8+ rating; highest wage band, priority in search, lower platform fee (15%). Experienced hires start at a higher tier from day one. Demotion triggers automatically if average rating drops below 3.5 across the last 10 contracts.',
 'tiers'),

('Loyalty points',
 'Points are earned per completed contract (default 1 point per ₹100 earned), plus a signup bonus and a small bonus per review left. Points are NON-CASH-CONVERTIBLE — they cannot be withdrawn as cash. They are redeemable for (a) discounts on platform fees, (b) priority listing boosts, and (c) entry into the Top Earner leaderboard. The full ledger is visible under Settings → Points History.',
 'points'),

('Loyalty points — non-cash by design',
 'Why no points-to-cash withdrawal? A points-to-cash wallet edges into India''s Prepaid Payment Instrument regulation (RBI), which requires a fintech-licensed entity. To stay a marketplace, not a payment institution, we keep points redeemable only inside the platform.',
 'points'),

('Anti-circumvention — staying on-platform',
 'Sharing contact information (phone, email, social handles) or any coded equivalent of those inside HiVR chat is detected and blocked at three layers (regex, word-number patterns, LLM classification). On first attempt: warning. On third attempt: account suspension. Reason: off-platform work bypasses escrow, dispute resolution, and review authenticity — you lose all buyer/employee protection. Staying on HiVR gives you tax-ready invoices, dispute support, and portable verified reviews.',
 'safety'),

('Dispute process',
 'Either party may raise a dispute before buyer approval. Disputes pause the auto-release of escrow. A Trust & Safety admin reviews the full contract, message history, and deliverables and decides: full release to employee, full refund to buyer, or split. Decisions are recorded and appealable for 7 days.',
 'disputes'),

('Two-tier task system',
 'HiVR has two structurally different task types. Tier A — Micro-Tasks (spreadsheet work, tech bug fixes, live mentoring) are bounded single-sitting or short-duration work, billed hourly, daily, monthly, or fixed-per-task. Tier B — Role Engagements (full-stack dev, AI/ML eng, NLP) are multi-day to multi-week project work, billed per-day or per-milestone — never hourly. Hourly billing is structurally banned for Tier B at the database level.',
 'how-it-works'),

('Refund policy',
 'If work is not delivered, the buyer receives a full refund. If work is delivered but rejected within the revision window, the buyer may claim a partial refund proportional to the work completed, subject to admin review. No refunds are processed after buyer approval of the deliverable.',
 'payments')
on conflict do nothing;
