-- 0108: Add txn_pin_hash to user_wallets for transaction PIN support
-- Users set a 4-6 digit PIN in Payout Method tab, stored scrypt-hashed

alter table if exists public.user_wallets
  add column if not exists txn_pin_hash text;

comment on column public.user_wallets.txn_pin_hash is 'scrypt-hashed 4-6 digit transaction PIN. Null means PIN not set.';
