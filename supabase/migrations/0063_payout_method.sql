-- 0063 — Payout method on users
--
-- Adds a `payout_method` column to record the user's preferred
-- disbursement method (UPI or bank). Combined with the existing
-- upi_id / account_holder / ifsc columns, this lets us know where
-- to send money when a contract is released.

alter table public.users
  add column if not exists payout_method text
    check (payout_method is null or payout_method in ('upi', 'bank'));

create index if not exists users_payout_method_idx on public.users(payout_method)
  where payout_method is not null;

comment on column public.users.payout_method is
  'Preferred disbursement method: upi (UPI handle) or bank (NEFT/IMPS via IFSC+account)';
