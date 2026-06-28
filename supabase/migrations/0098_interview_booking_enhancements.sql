-- 0098_interview_booking_enhancements.sql
-- Adds the columns needed for the full real-time interview booking
-- flow: cancellation tracking, no-show detection, reschedule chain,
-- and a "notes for candidate" field on the slot.

-- ============================================================
-- A) interview_slots: notes for the candidate
-- ============================================================
alter table public.interview_slots
  add column if not exists notes_for_candidate text;

-- ============================================================
-- B) interview_bookings: cancellation + reschedule tracking
-- ============================================================
alter table public.interview_bookings
  add column if not exists cancelled_at            timestamptz,
  add column if not exists cancelled_by            uuid references public.users(id),
  add column if not exists cancellation_reason    text,
  add column if not exists rescheduled_from_id    uuid references public.interview_bookings(id) on delete set null,
  add column if not exists is_no_show             boolean not null default false,
  add column if not exists meeting_url            text;

-- ============================================================
-- C) Helper RPC: get_available_slots
--    Returns all open, future slots that an employee can book,
--    with the interviewer's name and the slot's notes.
--    Filterable by slot_kind, target_tier, category_id.
-- ============================================================
create or replace function public.get_available_interview_slots(
  p_slot_kind   text default null,                              -- 'tier_b'|'level_up'|null
  p_target_tier text default null,                              -- 'verified'|'track_record'|'top_rated'|null
  p_category_id uuid default null,
  p_limit       int  default 30
) returns table(
  id               uuid,
  slot_kind        text,
  target_tier      text,
  category_id      uuid,
  category_name    text,
  interviewer_id   uuid,
  interviewer_name text,
  interviewer_email text,
  scheduled_at     timestamptz,
  duration_min     int,
  meeting_url      text,
  notes_for_candidate text,
  max_bookings     int
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
    select
      s.id,
      s.slot_kind,
      s.target_tier,
      s.category_id,
      c.name,
      s.interviewer_id,
      u.full_name,
      u.email,
      s.scheduled_at,
      s.duration_min,
      s.meeting_url,
      s.notes_for_candidate,
      s.max_bookings
    from public.interview_slots s
    left join public.skill_categories c on c.id = s.category_id
    left join public.users u on u.id = s.interviewer_id
    where s.status = 'open'
      and s.scheduled_at > now()
      and (p_slot_kind is null or s.slot_kind = p_slot_kind)
      and (p_target_tier is null or s.target_tier = p_target_tier)
      and (p_category_id is null or s.category_id = p_category_id)
      and not exists (
        select 1 from public.interview_bookings b
         where b.slot_id = s.id and b.status = 'booked'
      )
    order by s.scheduled_at asc
    limit p_limit;
end $$;
grant execute on function public.get_available_interview_slots(text, text, uuid, int) to authenticated, anon;

-- ============================================================
-- D) Helper RPC: list my bookings
--    Returns all bookings the current user has, with related slot
--    + interviewer info, ordered by scheduled_at.
-- ============================================================
create or replace function public.list_my_interview_bookings()
returns table(
  booking_id          uuid,
  slot_id             uuid,
  slot_kind            text,
  target_tier          text,
  category_id          uuid,
  category_name        text,
  interviewer_id       uuid,
  interviewer_name     text,
  interviewer_email    text,
  scheduled_at         timestamptz,
  duration_min         int,
  meeting_url          text,
  notes_for_candidate  text,
  booking_status       text,
  result               text,
  result_notes         text,
  result_uploaded_at   timestamptz,
  cancelled_at         timestamptz,
  cancelled_by         uuid,
  cancellation_reason  text,
  is_no_show           boolean,
  rescheduled_from_id  uuid,
  rescheduled_to_id    uuid,                                     -- if THIS booking was rescheduled, where it went
  created_at           timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
    select
      b.id,
      s.id,
      s.slot_kind,
      s.target_tier,
      s.category_id,
      c.name,
      s.interviewer_id,
      u.full_name,
      u.email,
      s.scheduled_at,
      s.duration_min,
      coalesce(b.meeting_url, s.meeting_url),
      s.notes_for_candidate,
      b.status,
      b.result,
      b.result_notes,
      b.result_uploaded_at,
      b.cancelled_at,
      b.cancelled_by,
      b.cancellation_reason,
      b.is_no_show,
      b.rescheduled_from_id,
      (
        select id from public.interview_bookings b2
         where b2.rescheduled_from_id = b.id
         limit 1
      ) as rescheduled_to_id,
      b.booked_at
    from public.interview_bookings b
    join public.interview_slots s on s.id = b.slot_id
    left join public.skill_categories c on c.id = s.category_id
    left join public.users u on u.id = s.interviewer_id
    where b.employee_id = auth.uid()
    order by s.scheduled_at asc;
end $$;
grant execute on function public.list_my_interview_bookings() to authenticated;

-- ============================================================
-- E) Helper RPC: cancel_my_booking
--    Marks a booking as cancelled. Enforces the 24h policy:
--    cancelling within 24h is allowed but flagged.
-- ============================================================
create or replace function public.cancel_my_booking(
  p_booking_id uuid,
  p_reason     text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_b record;
  v_s record;
  v_late boolean := false;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'error', 'Not signed in'); end if;

  select * into v_b from public.interview_bookings where id = p_booking_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Booking not found'); end if;
  if v_b.employee_id <> v_user then return jsonb_build_object('ok', false, 'error', 'Not your booking'); end if;
  if v_b.status <> 'booked' then
    return jsonb_build_object('ok', false, 'error', 'Booking is ' || v_b.status || ' — cannot cancel');
  end if;

  select * into v_s from public.interview_slots where id = v_b.slot_id;

  -- 24h policy: cancelling within 24h is allowed but flagged
  if v_s.scheduled_at - now() < interval '24 hours' then
    v_late := true;
  end if;

  update public.interview_bookings
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = v_user,
         cancellation_reason = p_reason
   where id = p_booking_id;

  -- Free up the slot if it was the only booking
  update public.interview_slots
     set status = case when max_bookings > 1 then status else 'open' end,
         booked_by = null,
         booking_id = null
   where id = v_b.slot_id
     and max_bookings = 1;

  perform public.create_notification(
    v_s.interviewer_id,
    'interview_booking_cancelled',
    'Interview booking cancelled',
    case when v_late
      then 'The candidate cancelled within 24h of the slot. Reason: ' || coalesce(p_reason, '(none)')
      else 'The candidate cancelled. Reason: ' || coalesce(p_reason, '(none)')
    end,
    '/admin/interviews'
  );

  return jsonb_build_object(
    'ok', true,
    'late', v_late,
    'message', case when v_late
      then 'Cancelled within 24h. Future late cancellations may affect your level-up eligibility.'
      else 'Cancelled cleanly. The slot is open again.'
    end
  );
end $$;
grant execute on function public.cancel_my_booking(uuid, text) to authenticated;

-- ============================================================
-- F) Helper RPC: reschedule_my_booking
--    Cancel the old booking and book a new slot atomically. If
--    the new slot is the same category / target_tier, the level-up
--    evaluation will see the new pass. Otherwise the candidate
--    needs to specifically book for the new target.
-- ============================================================
create or replace function public.reschedule_my_booking(
  p_booking_id      uuid,
  p_new_slot_id     uuid,
  p_reason          text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_old record;
  v_new_slot record;
  v_new_booking_id uuid;
  v_was_late boolean := false;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'error', 'Not signed in'); end if;
  if p_booking_id is null or p_new_slot_id is null then
    return jsonb_build_object('ok', false, 'error', 'booking_id and new_slot_id required');
  end if;

  -- Load + authorize the old booking
  select * into v_old from public.interview_bookings where id = p_booking_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Original booking not found'); end if;
  if v_old.employee_id <> v_user then return jsonb_build_object('ok', false, 'error', 'Not your booking'); end if;
  if v_old.status <> 'booked' then
    return jsonb_build_object('ok', false, 'error', 'Original booking is ' || v_old.status || ' — cannot reschedule');
  end if;
  if v_old.slot_id = p_new_slot_id then
    return jsonb_build_object('ok', false, 'error', 'That is the same slot you already booked');
  end if;

  -- Cancel the old booking (reuse the cancel logic)
  select * into v_old from public.interview_slots where id = v_old.slot_id;
  if v_old.scheduled_at - now() < interval '24 hours' then
    v_was_late := true;
  end if;
  update public.interview_bookings
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = v_user,
         cancellation_reason = coalesce(p_reason, 'Rescheduled')
   where id = p_booking_id;
  update public.interview_slots
     set status = case when max_bookings > 1 then status else 'open' end,
         booked_by = null,
         booking_id = null
   where id = v_old.id and max_bookings = 1;

  -- Book the new slot
  select * into v_new_slot from public.interview_slots where id = p_new_slot_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'New slot not found'); end if;
  if v_new_slot.status <> 'open' then
    return jsonb_build_object('ok', false, 'error', 'New slot is not open');
  end if;
  if v_new_slot.scheduled_at < now() then
    return jsonb_build_object('ok', false, 'error', 'New slot is in the past');
  end if;

  insert into public.interview_bookings(slot_id, employee_id, status, result, rescheduled_from_id)
  values (p_new_slot_id, v_user, 'booked', 'pending', p_booking_id)
  returning id into v_new_booking_id;

  update public.interview_slots
     set status = 'booked',
         booked_by = v_user,
         booking_id = v_new_booking_id
   where id = p_new_slot_id;

  perform public.create_notification(
    v_user, 'interview_rescheduled',
    'Interview rescheduled',
    'You''ve been moved to a new slot. Old slot cancelled; new slot booked.',
    '/dashboard/interviews'
  );
  perform public.create_notification(
    v_new_slot.interviewer_id,
    'interview_rescheduled',
    'Interview rescheduled',
    'A candidate rescheduled into your new slot.',
    '/admin/interviews'
  );

  return jsonb_build_object(
    'ok', true,
    'old_booking_id', p_booking_id,
    'new_booking_id', v_new_booking_id,
    'late_cancellation', v_was_late,
    'message', case when v_was_late
      then 'Rescheduled. The old cancellation was within 24h — this may affect level-up eligibility.'
      else 'Rescheduled cleanly.'
    end
  );
end $$;
grant execute on function public.reschedule_my_booking(uuid, uuid, text) to authenticated;
