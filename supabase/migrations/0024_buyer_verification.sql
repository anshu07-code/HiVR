-- 0024_buyer_verification.sql
-- Adds buyer-side ID verification: PAN / GSTIN / Bank.
-- We extend the existing `verifications` table (employee side) rather than
-- create a separate table, because the audit + rate-limit patterns are
-- identical. A `purpose` column partitions the rows by audience.
--
-- Also seeds a default row in `platform_settings` so the buyer
-- `kyc_required_above` threshold can be tuned without a code change.

-- ----------------------------------------------------------------------------
-- 1. Extend the doc_type enum with buyer-only document kinds
-- ----------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'doc_type' and e.enumlabel = 'gstin'
  ) then
    alter type public.doc_type add value 'gstin';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'doc_type' and e.enumlabel = 'bank'
  ) then
    alter type public.doc_type add value 'bank';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. Add `purpose` column to verifications
-- ----------------------------------------------------------------------------

alter table public.verifications
  add column if not exists purpose text not null default 'employee'
    check (purpose in ('employee', 'buyer'));

create index if not exists verifications_purpose_idx
  on public.verifications(user_id, purpose, status);

-- ----------------------------------------------------------------------------
-- 3. Ensure the buyer KYC threshold is in platform_settings
-- ----------------------------------------------------------------------------
-- Note: `platform_settings` only has columns (key, value, updated_at,
-- updated_by). Earlier drafts of this migration used a `description`
-- column that doesn't exist — that produces "column 'description' of
-- relation 'platform_settings' does not exist" on apply. The descriptions
-- below are kept as comments for readability.

insert into public.platform_settings (key, value) values
  -- Buyer KYC required above this rupee amount. Default ₹50,000.
  ('buyer_kyc_required_above', '{"value":50000}'::jsonb),
  -- When true, business buyers must complete KYC before posting any task.
  ('buyer_kyc_required_for_business', '{"value":true}'::jsonb)
on conflict (key) do nothing;
