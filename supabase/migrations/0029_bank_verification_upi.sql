-- 0029_bank_verification_upi.sql
-- Adds UPI-based bank account verification.
--
-- Flow:
--   1. User enters UPI ID (e.g. 9876543210@paytm)
--   2. HiVR creates a Razorpay payment link for ₹1 with a unique
--      reference code as the note (e.g. "HiVR verify HVR-7K2P9X")
--   3. User scans the QR / clicks the UPI deep-link
--   4. User pays ₹1 from their UPI app, sees the reference code
--      in the "note" field of the transaction
--   5. User types the reference code back into HiVR
--   6. HiVR confirms the payment with Razorpay's API and marks the
--      UPI ID as verified
--   7. The ₹1 is kept by HiVR as the verification fee (no refund)
--
-- We persist the UPI ID + Razorpay payment_id on `users` so future
-- payouts can go directly to the verified UPI handle.

-- ----------------------------------------------------------------------------
-- 1. Users: UPI fields
-- ----------------------------------------------------------------------------

alter table public.users
  add column if not exists upi_id                  text,
  add column if not exists upi_verified_at         timestamptz,
  add column if not exists upi_verified_payment_id text,
  add column if not exists upi_provider_name       text;

create unique index if not exists users_upi_id_unique_idx
  on public.users(upi_id)
  where upi_id is not null;

create index if not exists users_upi_verified_idx
  on public.users(upi_verified_at)
  where upi_verified_at is not null;

-- ----------------------------------------------------------------------------
-- 2. Verifications: bank row with new shape
-- ----------------------------------------------------------------------------
-- We don't change the existing bank/upi doc_type in the doc_type
-- enum. Instead, the verifications row uses doc_type='bank' and
-- metadata carries the UPI-specific fields. This keeps the existing
-- `purpose` semantics intact and makes the verification table
-- consistent with the DigiLocker pattern.

-- ----------------------------------------------------------------------------
-- 3. Buyer profiles: track saved UPI for payouts
-- ----------------------------------------------------------------------------

alter table public.buyer_profiles
  add column if not exists payout_upi_id text,
  add column if not exists payout_upi_verified_at timestamptz;

-- ----------------------------------------------------------------------------
-- 4. Employee profiles: track saved UPI for payouts
-- ----------------------------------------------------------------------------

alter table public.employee_profiles
  add column if not exists payout_upi_id text,
  add column if not exists payout_upi_verified_at timestamptz;

-- ----------------------------------------------------------------------------
-- 5. Platform settings: bank verification revenue tracking
-- ----------------------------------------------------------------------------

insert into public.platform_settings (key, value) values
  ('bank_verification_revenue_total_paise', '{"value":0}'::jsonb)
on conflict (key) do nothing;
