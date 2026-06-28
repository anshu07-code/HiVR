-- 0025_buyer_full_kyc.sql
-- Hardens the buyer side: requires Aadhaar + PAN + Phone + Bank before any
-- task can be posted, regardless of size. Adds anti-fraud infrastructure:
--   * `users.phone_verified` (boolean) — set by our phone-OTP endpoint
--   * `users.fraud_signals`  (jsonb)   — runtime signals (failed attempts,
--                                       rapid task posts, etc.)
--   * `platform_settings.buyer_min_kyc_floor_rupees` — default 0 (= any task)
--   * `platform_settings.task_post_rate_limit` — per-hour cap
--   * `platform_settings.task_post_daily_limit` — per-day cap
--
-- We also broaden the `doc_type` enum to allow aadhaar for buyers. The
-- verification route already validates the purpose↔doc_type pairing, so
-- no app-side change needed beyond updating the Zod allow-list.

-- ----------------------------------------------------------------------------
-- 1. Users: phone verification + fraud signals
-- ----------------------------------------------------------------------------

alter table public.users
  add column if not exists phone_verified boolean not null default false,
  add column if not exists fraud_signals  jsonb   not null default '{}'::jsonb,
  add column if not exists suspended_at   timestamptz;

-- ----------------------------------------------------------------------------
-- 2. Platform settings: hard floor + rate limits
-- ----------------------------------------------------------------------------
-- Note: `platform_settings` only has columns (key, value, updated_at,
-- updated_by). Earlier drafts of this migration used a `description`
-- column that doesn't exist — that produces "column 'description' of
-- relation 'platform_settings' does not exist" on apply. The descriptions
-- below are kept as comments for readability.

insert into public.platform_settings (key, value) values
  -- Hard floor: buyers must complete PAN+Aadhaar+Phone+Bank KYC before posting any task above this rupee amount. Default 0 = ALL tasks require full KYC.
  ('buyer_min_kyc_floor_rupees', '{"value":0}'::jsonb),
  -- Maximum tasks a single buyer can post per rolling hour.
  ('task_post_rate_limit_per_hour', '{"value":5}'::jsonb),
  -- Maximum tasks a single buyer can post per rolling 24 hours.
  ('task_post_rate_limit_per_day',  '{"value":20}'::jsonb),
  -- When true, unverified buyers cannot post Tier B (role engagement) tasks.
  ('block_tier_b_for_unverified',   '{"value":true}'::jsonb)
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- 3. Buyer profiles: track last fraud-signal timestamp
-- ----------------------------------------------------------------------------

alter table public.buyer_profiles
  add column if not exists last_post_attempt_at timestamptz,
  add column if not exists post_attempts_24h    int not null default 0,
  add column if not exists post_attempts_1h     int not null default 0;

-- ----------------------------------------------------------------------------
-- 4. Aadhaar is now allowed for buyers (purpose='buyer'). The verification
--    route already allows it — this is documentation only.
-- ----------------------------------------------------------------------------
comment on column public.verifications.purpose is
  'employee: Aadhaar/PAN/Passport/DL. buyer: Aadhaar/PAN/GSTIN/Bank.';
