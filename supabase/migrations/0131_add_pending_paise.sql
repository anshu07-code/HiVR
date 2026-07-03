-- 0131 — Add pending_paise to user_wallets + users.lifetime_earnings_paise
--
-- The user_wallets table has just `balance_paise` (withdrawable
-- immediately). We need a second bucket for "pending" — money that
-- is owed to the employee but not yet withdrawable, because:
--   - It came from a Razorpay-held escrow that hasn't been released to
--     HiVR's pooled account yet (Razorpay's "release escrow" webhook
--     hasn't fired).
--
-- `balance_paise` = money the user can withdraw right now.
-- `pending_paise` = money the user will be able to withdraw once the
--                   outstanding async ops complete.
-- Total lifetime = balance_paise + pending_paise + total_withdrawn.
--
-- Also adds `users.lifetime_earnings_paise` (mirror of the
-- employee_profiles.lifetime_earnings column). Migration 0123
-- referenced this column but never created it. The mark_workspace_done
-- function in 0133 needs it for the admin/payout mirror.
--
-- Backwards compatible: defaults 0, no constraint changes.

alter table public.user_wallets
  add column if not exists pending_paise bigint not null default 0;

comment on column public.user_wallets.pending_paise is
  'Rupees (paise) credited but not yet withdrawable. Used for Razorpay escrow releases that are waiting on the payout webhook to fire.';

alter table public.users
  add column if not exists lifetime_earnings_paise bigint not null default 0;

comment on column public.users.lifetime_earnings_paise is
  'Mirror of employee_profiles.lifetime_earnings for admin queries that scan public.users.';
