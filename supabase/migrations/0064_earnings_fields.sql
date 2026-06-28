-- 0064 — Earnings & withdrawals schema
--
-- Adds columns needed by the new "Earnings" tab on /dashboard/payments:
--   * available_for_withdrawal — wallet balance available to withdraw
--     (different from wallet.balance_paise which is for instant escrow)
--   * pending_in_escrow       — money currently held in active contracts
--   * total_withdrawn         — lifetime sum of completed withdrawals
--   * total_platform_fees     — lifetime fees paid by the employee
--   * current_month_earnings  — sum of releases in the current month
--   * payouts_lifetime_count  — count of completed payouts
--   * payouts_pending_count   — count of in-flight withdrawals
--   * current_month_label     — human-readable current month (e.g. "June 2026")
--   * last_withdrawal_at      — timestamp of last completed withdrawal
--
-- withdrawal_penalty_paise + withdrawals_this_month already exist on
-- public.users (migration 0042). This migration mirrors them onto
-- employee_profiles for query convenience.

alter table public.employee_profiles
  add column if not exists available_for_withdrawal   bigint not null default 0,
  add column if not exists pending_in_escrow         bigint not null default 0,
  add column if not exists total_withdrawn            bigint not null default 0,
  add column if not exists total_platform_fees        bigint not null default 0,
  add column if not exists current_month_earnings     bigint not null default 0,
  add column if not exists current_month_label        text,
  add column if not exists payouts_lifetime_count     int    not null default 0,
  add column if not exists payouts_pending_count      int    not null default 0,
  add column if not exists last_withdrawal_at         timestamptz;

create index if not exists employee_profiles_earnings_idx
  on public.employee_profiles(user_id, current_month_earnings desc);

-- Add the user-side columns the Earnings UI references (so the API
-- route can update them safely). These were also used by the
-- 'last_withdrawal_at' lookup from migration 0042.
alter table public.users
  add column if not exists last_withdrawal_at         timestamptz;

comment on column public.employee_profiles.available_for_withdrawal is
  'Rupees (paise) available to withdraw right now (excludes pending escrow).';
comment on column public.employee_profiles.pending_in_escrow is
  'Rupees (paise) currently locked in active contract escrows.';
comment on column public.employee_profiles.total_withdrawn is
  'Lifetime sum of completed payouts to bank / UPI.';
comment on column public.employee_profiles.total_platform_fees is
  'Lifetime sum of platform fees paid on this employee''s contracts.';
comment on column public.employee_profiles.current_month_earnings is
  'Sum of released contract payments + tips in the current month.';
comment on column public.employee_profiles.current_month_label is
  'Display label for the current month (e.g. ''June 2026'').';
