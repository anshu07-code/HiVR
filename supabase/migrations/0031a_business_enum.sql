-- =============================================================================
-- 0031a_business_enum.sql
-- =============================================================================
-- Pre-step: add 'business' to the user_role enum.
-- MUST be run as its own statement (Postgres can't run ALTER TYPE ... ADD VALUE
-- inside a transaction block). Apply this FIRST, then run 0031b.

do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'user_role' and e.enumlabel = 'business'
  ) then
    alter type public.user_role add value 'business';
  end if;
end $$;

-- Track the user's onboarding step for businesses.
alter table public.users
  add column if not exists business_onboarding_step text
    check (business_onboarding_step is null or business_onboarding_step in
      ('profile', 'legal', 'kyc', 'bank', 'team', 'done'));
