-- 0065 — Points redemption flags on users + employee_profiles
--
-- These columns are set when an employee redeems loyalty points for
-- a specific reward. They're consumed by matching flows:
--   * profile_boost_until     — Find People ranking boost
--   * instant_match_priority_until — Instant Hire Smart Match
--   * fee_discount_5_remaining  /  fee_discount_15_remaining — platform-fee discount
--   * tier_b_skip_available   — Tier B interview skip
--   * tier_boost_top_rated_until — public Top-Rated badge
--   * leaderboard_featured_until — Top Earners leaderboard

alter table public.users
  add column if not exists profile_boost_until             timestamptz,
  add column if not exists instant_match_priority_until    timestamptz,
  add column if not exists fee_discount_5_remaining        int     not null default 0,
  add column if not exists fee_discount_15_remaining       int     not null default 0,
  add column if not exists tier_b_skip_available           boolean not null default false;

alter table public.employee_profiles
  add column if not exists tier_boost_top_rated_until      timestamptz,
  add column if not exists leaderboard_featured_until      timestamptz;

comment on column public.users.profile_boost_until is
  'While in the future, the user gets a ranking boost on Find People.';
comment on column public.users.instant_match_priority_until is
  'While in the future, the user surfaces first in Instant Hire Smart Match.';
comment on column public.users.fee_discount_5_remaining is
  'Number of remaining 5%-off (20%→15%) contracts.';
comment on column public.users.fee_discount_15_remaining is
  'Number of remaining 15%-off (20%→5%) contracts.';
comment on column public.users.tier_b_skip_available is
  'True if the user has an unused Tier B interview skip (redeemed via points).';
comment on column public.employee_profiles.tier_boost_top_rated_until is
  'While in the future, the public profile shows Top-Rated regardless of trust_tier.';
comment on column public.employee_profiles.leaderboard_featured_until is
  'While in the future, the user is featured on the Top Earners leaderboard.';
