-- 0107_fix_missing_cancelled_by.sql
-- Ensures the `cancelled_by` column exists on `contracts`, which is queried
-- by the `evaluate_level_up` RPC (added in 0099). Also recreates
-- evaluate_level_up to gracefully handle environments where the column
-- was never added (e.g. dev/staging that skipped earlier migrations).

-- 1. Add missing columns from 0089 (idempotent — "if not exists" makes this
--    a no-op if they were already applied at that migration step)
alter table public.contracts
  add column if not exists cancelled_by         text
    check (cancelled_by in ('buyer','employee','mutual','admin')),
  add column if not exists cancellation_reason  text,
  add column if not exists cancellation_id      uuid,
  add column if not exists employee_payout_paise bigint,
  add column if not exists release_at           timestamptz;

create index if not exists contracts_release_at_idx
  on public.contracts(release_at)
  where status in ('active','delivered');

alter table public.employee_profiles
  add column if not exists cancellation_count int not null default 0,
  add column if not exists pending_cancellation_penalty_paise bigint not null default 0;

-- 2. Recreate evaluate_level_up with a guard against missing cancelled_by
create or replace function public.evaluate_level_up(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tier text;
  v_settings jsonb;
  v_criteria jsonb;
  v_next_tier text;
  v_completed int;
  v_avg_rating numeric;
  v_cancellations int;
  v_no_shows int;
  v_account_age_days int;
  v_has_passed_interview boolean;
  v_min_contracts int := 0;
  v_min_rating numeric := 0;
  v_max_cancellations int := 999999;
  v_min_age int := 0;
  v_interview_required boolean := false;
  v_missing jsonb := '[]'::jsonb;
  v_col_exists boolean;
begin
  select overall_trust_tier into v_tier
    from public.employee_profiles where user_id = p_user_id;
  v_tier := coalesce(v_tier, 'provisional');

  v_next_tier := case v_tier
    when 'provisional'  then 'verified'
    when 'verified'     then 'track_record'
    when 'track_record' then 'top_rated'
    else 'top_rated'
  end;
  if v_tier = 'top_rated' then
    return jsonb_build_object(
      'eligible', false,
      'current_tier', 'top_rated',
      'next_tier', null,
      'progress', jsonb_build_object('completed_contracts', 0, 'cancellations', 0, 'avg_rating', 0),
      'missing', jsonb_build_array('You are already at the highest tier'),
      'interview_required', false
    );
  end if;

  select value into v_settings from public.platform_settings where key = 'level_up_criteria';
  v_criteria := v_settings #> array['value', v_next_tier];
  if v_criteria is null then v_criteria := '{}'::jsonb; end if;
  v_min_contracts       := coalesce((v_criteria #>> '{min_completed_contracts}')::int, 0);
  v_min_rating          := coalesce((v_criteria #>> '{min_avg_rating}')::numeric, 0);
  v_max_cancellations   := coalesce((v_criteria #>> '{max_cancellations}')::int, 999999);
  v_min_age             := coalesce((v_criteria #>> '{min_account_age_days}')::int, 0);
  v_interview_required  := coalesce((v_criteria #>> '{interview_required}')::bool, false);

  select count(*) into v_completed
    from public.contracts
   where employee_id = p_user_id and status = 'completed';

  -- Check if cancelled_by column exists; if not, skip employee-initiated count
  select count(*) into v_col_exists
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'contracts'
     and column_name = 'cancelled_by';

  if v_col_exists then
    select count(*) into v_cancellations
      from public.contracts
     where employee_id = p_user_id
       and status = 'cancelled'
       and cancelled_by = 'employee';
  else
    v_cancellations := 0;
  end if;

  select count(*) into v_no_shows
    from public.interview_bookings
   where employee_id = p_user_id and status = 'no_show';
  v_cancellations := v_cancellations + v_no_shows;

  select coalesce(avg_rating, 0) into v_avg_rating
    from public.employee_profiles where user_id = p_user_id;

  select extract(day from now() - created_at)::int into v_account_age_days
    from public.users where id = p_user_id;

  select exists (
    select 1
      from public.interview_bookings b
      join public.interview_slots s on s.id = b.slot_id
     where b.employee_id = p_user_id
       and s.slot_kind = 'level_up'
       and s.target_tier = v_next_tier
       and b.result = 'passed'
  ) into v_has_passed_interview;

  if v_completed < v_min_contracts then
    v_missing := v_missing || jsonb_build_object('criterion', 'completed_contracts', 'have', v_completed, 'need', v_min_contracts);
  end if;
  if v_avg_rating < v_min_rating then
    v_missing := v_missing || jsonb_build_object('criterion', 'avg_rating', 'have', v_avg_rating, 'need', v_min_rating);
  end if;
  if v_col_exists and v_cancellations > v_max_cancellations then
    v_missing := v_missing || jsonb_build_object('criterion', 'cancellations', 'have', v_cancellations, 'max_allowed', v_max_cancellations);
  end if;
  if v_account_age_days < v_min_age then
    v_missing := v_missing || jsonb_build_object('criterion', 'account_age_days', 'have', v_account_age_days, 'need', v_min_age);
  end if;
  if v_interview_required and not v_has_passed_interview then
    v_missing := v_missing || jsonb_build_object('criterion', 'interview', 'have', false, 'need', true);
  end if;

  return jsonb_build_object(
    'eligible', jsonb_array_length(v_missing) = 0,
    'current_tier', v_tier,
    'next_tier', v_next_tier,
    'progress', jsonb_build_object(
      'completed_contracts', v_completed,
      'cancellations',        v_cancellations,
      'no_shows',             v_no_shows,
      'avg_rating',           v_avg_rating,
      'account_age_days',     v_account_age_days,
      'interview_passed',     v_has_passed_interview
    ),
    'criteria', v_criteria,
    'missing', v_missing,
    'interview_required', v_interview_required
  );
end $$;

grant execute on function public.evaluate_level_up(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
