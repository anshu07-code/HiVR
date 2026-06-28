-- =============================================================================
-- 0032_business_total_rpc.sql
-- =============================================================================
-- Adds a SECURITY DEFINER RPC to bump business profile counters in one place.
-- This is the canonical way the app keeps business_profiles.total_spend_paise,
-- total_contracts_signed, and total_employees_hired in sync with reality.
-- Falls back gracefully if the function doesn't exist (the app also does an
-- inline update as a backup).

create or replace function public.bump_business_total(
  _business_id uuid,
  _field text,
  _delta int default 1,
  _delta_paise bigint default 0
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if _field = 'spend' then
    update public.business_profiles
      set total_spend_paise = coalesce(total_spend_paise, 0) + _delta_paise
      where id = _business_id;
  elsif _field = 'contracts' then
    update public.business_profiles
      set total_contracts_signed = coalesce(total_contracts_signed, 0) + _delta
      where id = _business_id;
  elsif _field = 'employees' then
    update public.business_profiles
      set total_employees_hired = coalesce(total_employees_hired, 0) + _delta
      where id = _business_id;
  elsif _field = 'disputes' then
    update public.business_profiles
      set total_disputes = coalesce(total_disputes, 0) + _delta
      where id = _business_id;
  end if;
end;
$$;

revoke all on function public.bump_business_total(uuid, text, int, bigint) from public;
grant execute on function public.bump_business_total(uuid, text, int, bigint) to anon, authenticated;

comment on function public.bump_business_total is
  'Bump a denormalised counter on business_profiles. Field is one of: spend (uses _delta_paise), contracts, employees, disputes.';
