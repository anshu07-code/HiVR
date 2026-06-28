-- 0099_no_show_cron.sql
-- The no-show cron: marks interview_bookings as 'no_show' when the
-- scheduled time has passed and the interviewer hasn't uploaded a
-- result within a grace window.
--
-- The grace window is 1 hour after the scheduled time. This gives
-- the interviewer a buffer to upload the result on a slightly
-- delayed call, while still flagging employees who flat-out
-- missed the slot.
--
-- Repeated no-shows lower the candidate's level-up eligibility —
-- see the "no_show_count" tracking on employee_profiles.

-- ============================================================
-- A) Track no-show count on employee_profiles
-- ============================================================
alter table public.employee_profiles
  add column if not exists no_show_count int not null default 0,
  add column if not exists last_no_show_at timestamptz;

-- ============================================================
-- B) Helper: mark one booking as no-show
-- ============================================================
create or replace function public.mark_booking_no_show(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_b record;
begin
  select * into v_b from public.interview_bookings where id = p_booking_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Booking not found'); end if;
  if v_b.status <> 'booked' then
    return jsonb_build_object('ok', false, 'error', 'Booking is ' || v_b.status);
  end if;

  update public.interview_bookings
     set status = 'no_show', is_no_show = true
   where id = p_booking_id;
  update public.interview_slots
     set status = case when max_bookings > 1 then status else 'open' end,
         booked_by = null,
         booking_id = null
   where id = v_b.slot_id and max_bookings = 1;
  update public.employee_profiles
     set no_show_count = no_show_count + 1,
         last_no_show_at = now()
   where user_id = v_b.employee_id;

  perform public.create_notification(
    v_b.employee_id, 'interview_no_show',
    'Interview marked as no-show',
    'You missed an interview scheduled for ' || (select to_char(s.scheduled_at, 'DD Mon YYYY HH24:MI') from public.interview_slots s where s.id = v_b.slot_id) || '. This has been recorded on your profile and may affect level-up eligibility. Contact support if this is wrong.',
    '/dashboard/interviews'
  );
  return jsonb_build_object('ok', true, 'status', 'no_show', 'employee_id', v_b.employee_id);
end $$;
grant execute on function public.mark_booking_no_show(uuid) to service_role;

-- ============================================================
-- C) The cron-callable RPC. Finds stale bookings and marks them.
--    Returns the count of bookings marked.
-- ============================================================
create or replace function public.auto_mark_no_shows(p_grace_minutes int default 60)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  v_log jsonb := '[]'::jsonb;
  r record;
  v_result jsonb;
begin
  for r in
    select b.id, b.employee_id, s.scheduled_at, s.interviewer_id
      from public.interview_bookings b
      join public.interview_slots s on s.id = b.slot_id
     where b.status = 'booked'
       and b.is_no_show = false
       and s.scheduled_at + (p_grace_minutes || ' minutes')::interval < now()
  loop
    v_result := public.mark_booking_no_show(r.id);
    if (v_result #>> '{ok}')::bool then
      v_count := v_count + 1;
      v_log := v_log || jsonb_build_object(
        'booking_id', r.id,
        'employee_id', r.employee_id,
        'scheduled_at', r.scheduled_at
      );
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'marked_no_show', v_count, 'log', v_log, 'ran_at', now());
end $$;
grant execute on function public.auto_mark_no_shows(int) to service_role;

-- ============================================================
-- D) Add no_show_count to the level-up evaluation: a single
-- no-show is treated like a cancellation (counts against the
-- candidate). Future tuning can make this stricter.
-- ============================================================
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
  -- Cancellations: employee-initiated + no-shows combined
  select count(*) into v_cancellations
    from public.contracts
   where employee_id = p_user_id
     and status = 'cancelled'
     and cancelled_by = 'employee';
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
  if v_cancellations > v_max_cancellations then
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
