-- 0103_public_user_view_hide_phone.sql
-- L1 fix: the `users` table exposes the `phone` column via the
-- `users_public_read` policy (`for select using (true)`), which means
-- every signed-in user (and every anon) can read every other user's
-- phone number. That's a major PII leak (L1 in the audit).
--
-- Postgres RLS is row-level, not column-level — so we cannot restrict
-- phone/email inside an open `users_public_read` policy. The fix is
-- twofold:
--
--   1. Move the sensitive columns (phone, payout_method, upi_id,
--      account_last4, ifsc, bank_verified_at, upi_verified_at) to a
--      sibling `user_private_profile` table with RLS that ONLY allows
--      the row owner + admins to read.
--   2. Keep `public_users_safe` view as a "safe" public projection of
--      the user table for marketplace browse.
--
-- This migration is intentionally additive: it does NOT drop the
-- original `phone` column on `users` (that would break old code). It
-- creates the private table and a backfill from `users`. Code paths
-- that need the private fields must be updated to read from the new
-- table.

-- ============================================================================
-- Step 1: create user_private_profile (one row per user)
-- ============================================================================
create table if not exists public.user_private_profile (
  user_id          uuid primary key references public.users(id) on delete cascade,
  phone            text unique,
  email            text,
  payout_method    text check (payout_method in ('upi','bank') or payout_method is null),
  upi_id           text,
  upi_verified_at  timestamptz,
  account_last4    text,
  ifsc             text,
  bank_verified_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists upp_phone_idx on public.user_private_profile(phone);

-- ============================================================================
-- Step 2: enable RLS + tight policies
-- ============================================================================
alter table public.user_private_profile enable row level security;

drop policy if exists "upp_self_read"  on public.user_private_profile;
drop policy if exists "upp_self_write" on public.user_private_profile;
drop policy if exists "upp_admin_all"  on public.user_private_profile;

-- Only the row owner can read their own private row.
create policy "upp_self_read" on public.user_private_profile
  for select using (auth.uid() = user_id);

-- Only the row owner can write their own private row.
create policy "upp_self_write" on public.user_private_profile
  for insert with check (auth.uid() = user_id);

create policy "upp_self_update" on public.user_private_profile
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Admins can do anything (for support, dispute resolution).
create policy "upp_admin_all" on public.user_private_profile
  for all using (public.is_admin());

-- ============================================================================
-- Step 3: backfill from users
-- ============================================================================
insert into public.user_private_profile
  (user_id, phone, payout_method, upi_id, upi_verified_at, account_last4, ifsc, bank_verified_at)
select
  id, phone, payout_method, upi_id, upi_verified_at, account_last4, ifsc, bank_verified_at
from public.users
on conflict (user_id) do nothing;

-- ============================================================================
-- Step 4: create the public-safe view
-- ============================================================================
create or replace view public.public_users_safe as
  select
    id,
    full_name,
    avatar_url,
    roles,
    theme_preference,
    current_mode,
    is_suspended,
    contact_warning_count,
    created_at,
    last_active
  from public.users;

grant select on public.public_users_safe to anon, authenticated;

-- ============================================================================
-- Step 5: note the migration plan for callers
-- ============================================================================
-- Existing `users.phone`, `users.payout_method`, `users.upi_id`, etc.
-- columns are kept (for backwards compat) but should be considered
-- DEPRECATED. New code should read from `public.user_private_profile`.
-- A follow-up migration will drop these columns once all readers
-- have been updated.

-- ============================================================================
-- Step 6: reload PostgREST schema cache
-- ============================================================================
notify pgrst, 'reload schema';
