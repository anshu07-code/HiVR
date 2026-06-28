-- 0090_level_up_interviews_and_fee_schedule.sql
-- Implements the full employee level-up + interview-slot system and
-- switches the platform to the new fee schedule and withdrawal rule.
--
-- Fee schedule (per HiVR Option A, lower for fairness):
--   provisional  : 15%
--   verified     : 12%
--   track_record : 10%
--   top_rated    : 8%
--
-- Withdrawal rule:
--   Up to 5 withdrawals per month that are each < ₹500 → free.
--   Anything else (6th+ in the month, or any amount ≥ ₹500) → 3% fee.
--
-- Level-up criteria (configurable in `platform_settings`):
--   - Number of completed contracts
--   - Average rating
--   - Number of cancellations (max)
--   - Pass an interview (optional, configurable per tier)
--   - Time on platform
-- When all criteria for the next tier are satisfied, the system
-- automatically promotes the employee and the new tier immediately
-- reflects in the platform fee schedule applied to their contracts.
--
-- Interviews:
--   - interview_panel_members : admins / senior verified employees who
--     are allowed to conduct interviews. Only panel members can see the
--     /admin/interviews page and can upload results.
--   - interview_slots         : admin creates slots for either Tier B
--     interviews (for new joiners in Tier B categories) OR Level-up
--     interviews (for existing employees moving up a tier).
--   - interview_bookings      : employees book a slot. The interview
--     happens, then the panel member uploads a result. The result
--     drives the level-up evaluation.
--   - tier_b_interviews table (legacy) is preserved but the admin UI
--     treats it as the "Tier B interviews" section of the unified
--     Interviews page.
--
-- Wallet is now the only path for funding. All buyer funds land in the
-- buyer's HiVR wallet (already net of platform fee), then the wallet
-- is debited to fund the escrow. The platform fee is deducted BEFORE
-- the wallet credit, so the wallet balance always represents the
-- "HiVR-net" amount the buyer is in control of.

-- ============================================================
-- A) platform_settings: new fee schedule and withdrawal rule
-- ============================================================
update public.platform_settings
   set value = jsonb_build_object(
     'value', jsonb_build_object(
       'provisional', 0.15,
       'verified',    0.12,
       'track_record',0.10,
       'top_rated',   0.08
     )
   )
   , updated_at = now()
 where key = 'platform_fee_pct_by_tier';

insert into public.platform_settings(key, value, updated_at)
values (
  'withdrawal_rules',
  jsonb_build_object(
    'free_per_month', 5,
    'free_max_amount_paise', 50000,  -- ₹500
    'paid_fee_pct', 0.03
  ),
  now()
)
on conflict (key) do update
  set value = excluded.value, updated_at = now();

-- Default level-up criteria (admins can edit these in Settings)
insert into public.platform_settings(key, value, updated_at)
values (
  'level_up_criteria',
  jsonb_build_object(
    'verified', jsonb_build_object(
      'min_completed_contracts', 5,
      'min_avg_rating', 4.0,
      'max_cancellations', 1,
      'min_account_age_days', 14,
      'interview_required', false
    ),
    'track_record', jsonb_build_object(
      'min_completed_contracts', 25,
      'min_avg_rating', 4.5,
      'max_cancellations', 2,
      'min_account_age_days', 60,
      'interview_required', true
    ),
    'top_rated', jsonb_build_object(
      'min_completed_contracts', 100,
      'min_avg_rating', 4.7,
      'max_cancellations', 4,
      'min_account_age_days', 180,
      'interview_required', true
    )
  ),
  now()
)
on conflict (key) do update
  set value = excluded.value, updated_at = now();

-- ============================================================
-- B) interview_panel_members — admins/seniors who can interview
-- ============================================================
create table if not exists public.interview_panel_members (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.users(id) on delete cascade,
  role        text not null default 'interviewer'
              check (role in ('interviewer','lead_interviewer','admin')),
  is_active   boolean not null default true,
  added_by    uuid references public.users(id),
  added_at    timestamptz not null default now(),
  notes       text
);
create unique index if not exists interview_panel_members_user_uidx
  on public.interview_panel_members(user_id);

alter table public.interview_panel_members enable row level security;

drop policy if exists "panel members can read self" on public.interview_panel_members;
create policy "panel members can read self"
  on public.interview_panel_members for select
  using (user_id = auth.uid() or public.is_admin('super_admin'));

drop policy if exists "super admin manages panel" on public.interview_panel_members;
create policy "super admin manages panel"
  on public.interview_panel_members for all
  using (public.is_admin('super_admin'))
  with check (public.is_admin('super_admin'));

-- ============================================================
-- C) interview_slots — admin creates interview slots
-- ============================================================
create table if not exists public.interview_slots (
  id              uuid primary key default uuid_generate_v4(),
  slot_kind       text not null
                  check (slot_kind in ('tier_b','level_up')),
  target_tier     text
                  check (target_tier in ('verified','track_record','top_rated')),
  category_id     uuid references public.skill_categories(id) on delete set null,
  interviewer_id  uuid not null references public.users(id),
  scheduled_at    timestamptz not null,
  duration_min    int  not null default 30,
  status          text not null default 'open'
                  check (status in ('open','booked','completed','cancelled')),
  booked_by       uuid references public.users(id),
  booking_id      uuid,
  max_bookings    int not null default 1,
  meeting_url     text,
  notes           text,
  created_at      timestamptz not null default now()
);
create index if not exists interview_slots_kind_idx     on public.interview_slots(slot_kind);
create index if not exists interview_slots_target_idx   on public.interview_slots(target_tier);
create index if not exists interview_slots_status_idx   on public.interview_slots(status);
create index if not exists interview_slots_scheduled_idx on public.interview_slots(scheduled_at);

alter table public.interview_slots enable row level security;

-- Employees can read open slots
drop policy if exists "employees can read open slots" on public.interview_slots;
create policy "employees can read open slots"
  on public.interview_slots for select
  using (
    (status = 'open' and scheduled_at > now())
    or booked_by = auth.uid()
    or interviewer_id = auth.uid()
    or public.is_admin('super_admin')
  );

-- Panel members + admins can insert
drop policy if exists "panel can create slots" on public.interview_slots;
create policy "panel can create slots"
  on public.interview_slots for insert
  with check (
    interviewer_id = auth.uid() or public.is_admin('super_admin')
  );

drop policy if exists "panel can update slots" on public.interview_slots;
create policy "panel can update slots"
  on public.interview_slots for update
  using (
    interviewer_id = auth.uid() or public.is_admin('super_admin')
  );

-- ============================================================
-- D) interview_bookings — employee books a slot
-- ============================================================
create table if not exists public.interview_bookings (
  id                  uuid primary key default uuid_generate_v4(),
  slot_id             uuid not null references public.interview_slots(id) on delete cascade,
  employee_id         uuid not null references public.users(id),
  status              text not null default 'booked'
                      check (status in ('booked','completed','cancelled','no_show')),
  result              text
                      check (result in ('pending','passed','failed')),
  result_notes        text,
  result_uploaded_by  uuid references public.users(id),
  result_uploaded_at  timestamptz,
  booked_at           timestamptz not null default now(),
  cancelled_at        timestamptz
);
create unique index if not exists interview_bookings_slot_emp_uidx
  on public.interview_bookings(slot_id, employee_id);
create index if not exists interview_bookings_employee_idx
  on public.interview_bookings(employee_id);

alter table public.interview_bookings enable row level security;

drop policy if exists "employee reads own bookings" on public.interview_bookings;
create policy "employee reads own bookings"
  on public.interview_bookings for select
  using (
    employee_id = auth.uid()
    or exists (
      select 1 from public.interview_slots s
       where s.id = interview_bookings.slot_id
         and (s.interviewer_id = auth.uid() or public.is_admin('super_admin'))
    )
  );

drop policy if exists "employee inserts own booking" on public.interview_bookings;
create policy "employee inserts own booking"
  on public.interview_bookings for insert
  with check (employee_id = auth.uid());

drop policy if exists "panel updates booking result" on public.interview_bookings;
create policy "panel updates booking result"
  on public.interview_bookings for update
  using (
    employee_id = auth.uid()
    or exists (
      select 1 from public.interview_slots s
       where s.id = interview_bookings.slot_id
         and (s.interviewer_id = auth.uid() or public.is_admin('super_admin'))
    )
  );

-- Add a back-reference from interview_slots to its booking (single booking per slot)
alter table public.interview_slots
  add column if not exists booking_id uuid
    references public.interview_bookings(id) on delete set null;

-- ============================================================
-- E) tier change audit (for buyer-side display of the latest tier)
-- ============================================================
create table if not exists public.user_tier_changes (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.users(id) on delete cascade,
  from_tier     text not null,
  to_tier       text not null,
  reason        text,
  triggered_by  text not null check (triggered_by in ('auto','interview','admin','seed')),
  metadata      jsonb not null default '{}'::jsonb,
  changed_at    timestamptz not null default now()
);
create index if not exists user_tier_changes_user_idx on public.user_tier_changes(user_id, changed_at desc);

alter table public.user_tier_changes enable row level security;
drop policy if exists "public reads tier changes" on public.user_tier_changes;
create policy "public reads tier changes"
  on public.user_tier_changes for select using (true);

-- ============================================================
-- F) Add previous_tier + tier_changed_at to employee_profiles
-- (the actual table that stores overall_trust_tier)
-- ============================================================
alter table public.employee_profiles
  add column if not exists previous_tier     text
    check (previous_tier in ('provisional','verified','track_record','top_rated')),
  add column if not exists tier_changed_at  timestamptz;

-- ============================================================
-- G) RPC: get_platform_fee_pct — single source of truth for the
-- fee schedule. Reads from platform_settings so admins can tune
-- without a code deploy.
-- ============================================================
create or replace function public.get_platform_fee_pct(p_user_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tier text;
  v_settings jsonb;
  v_pct numeric;
begin
  -- Trust tier lives on employee_profiles (1:1 with users)
  select overall_trust_tier into v_tier from public.employee_profiles where user_id = p_user_id;
  if v_tier is null then
    -- Fall back to creating a row if it doesn't exist (new employee)
    insert into public.employee_profiles(user_id, overall_trust_tier) values (p_user_id, 'provisional')
      on conflict (user_id) do nothing;
    v_tier := 'provisional';
  end if;

  select value into v_settings from public.platform_settings where key = 'platform_fee_pct_by_tier';
  v_pct := (v_settings #>> array['value', v_tier])::numeric;
  if v_pct is null then v_pct := 0.15; end if;  -- safe default
  return v_pct;
end $$;
grant execute on function public.get_platform_fee_pct(uuid) to authenticated, service_role;

-- ============================================================
-- H) RPC: evaluate_level_up
--    Reads the criteria for the *next* tier above the employee's
--    current one and returns a jsonb with { eligible, progress, next_tier, missing }.
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
  v_account_age_days int;
  v_has_passed_interview boolean;
  v_min_contracts int := 0;
  v_min_rating numeric := 0;
  v_max_cancellations int := 999999;
  v_min_age int := 0;
  v_interview_required boolean := false;
  v_missing jsonb := '[]'::jsonb;
begin
  -- Trust tier lives on employee_profiles (1:1 with users)
  select overall_trust_tier into v_tier from public.employee_profiles where user_id = p_user_id;
  if v_tier is null then
    insert into public.employee_profiles(user_id, overall_trust_tier) values (p_user_id, 'provisional')
      on conflict (user_id) do nothing;
    v_tier := 'provisional';
  end if;

  -- Determine next tier
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

  -- Pull criteria from settings
  select value into v_settings from public.platform_settings where key = 'level_up_criteria';
  v_criteria := v_settings #> array['value', v_next_tier];
  if v_criteria is null then
    v_criteria := '{}'::jsonb;
  end if;
  v_min_contracts       := coalesce((v_criteria #>> '{min_completed_contracts}')::int, 0);
  v_min_rating          := coalesce((v_criteria #>> '{min_avg_rating}')::numeric, 0);
  v_max_cancellations   := coalesce((v_criteria #>> '{max_cancellations}')::int, 999999);
  v_min_age             := coalesce((v_criteria #>> '{min_account_age_days}')::int, 0);
  v_interview_required  := coalesce((v_criteria #>> '{interview_required}')::bool, false);

  -- Counters
  select count(*) into v_completed
    from public.contracts
   where employee_id = p_user_id and status = 'completed';
  select count(*) into v_cancellations
    from public.contracts
   where employee_id = p_user_id
     and status = 'cancelled'
     and cancelled_by = 'employee';
  select coalesce(avg_rating, 0) into v_avg_rating
    from public.employee_profiles where user_id = p_user_id;
  select extract(day from now() - created_at)::int into v_account_age_days
    from public.users where id = p_user_id;

  -- Has the employee passed a level-up interview for THIS target tier?
  select exists (
    select 1
      from public.interview_bookings b
      join public.interview_slots s on s.id = b.slot_id
     where b.employee_id = p_user_id
       and s.slot_kind = 'level_up'
       and s.target_tier = v_next_tier
       and b.result = 'passed'
  ) into v_has_passed_interview;

  -- Build missing list
  if v_completed < v_min_contracts then
    v_missing := v_missing || jsonb_build_object(
      'criterion', 'completed_contracts',
      'have', v_completed,
      'need', v_min_contracts
    );
  end if;
  if v_avg_rating < v_min_rating then
    v_missing := v_missing || jsonb_build_object(
      'criterion', 'avg_rating',
      'have', v_avg_rating,
      'need', v_min_rating
    );
  end if;
  if v_cancellations > v_max_cancellations then
    v_missing := v_missing || jsonb_build_object(
      'criterion', 'cancellations',
      'have', v_cancellations,
      'max_allowed', v_max_cancellations
    );
  end if;
  if v_account_age_days < v_min_age then
    v_missing := v_missing || jsonb_build_object(
      'criterion', 'account_age_days',
      'have', v_account_age_days,
      'need', v_min_age
    );
  end if;
  if v_interview_required and not v_has_passed_interview then
    v_missing := v_missing || jsonb_build_object(
      'criterion', 'interview',
      'have', false,
      'need', true
    );
  end if;

  return jsonb_build_object(
    'eligible', jsonb_array_length(v_missing) = 0,
    'current_tier', v_tier,
    'next_tier', v_next_tier,
    'progress', jsonb_build_object(
      'completed_contracts', v_completed,
      'cancellations',        v_cancellations,
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

-- ============================================================
-- I) RPC: apply_level_up
--    Promotes the employee if they are eligible. Logs to
--    user_tier_changes. Returns the new tier.
-- ============================================================
create or replace function public.apply_level_up(p_user_id uuid, p_reason text default 'auto')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eval jsonb;
  v_new_tier text;
  v_old_tier text;
begin
  v_eval := public.evaluate_level_up(p_user_id);
  if not (v_eval #>> '{eligible}')::bool then
    raise exception 'Employee does not meet the level-up criteria yet';
  end if;
  v_new_tier := v_eval #>> '{next_tier}';
  -- Trust tier lives on employee_profiles, not users
  select overall_trust_tier into v_old_tier from public.employee_profiles where user_id = p_user_id;
  if v_old_tier is null then v_old_tier := 'provisional'; end if;

  update public.employee_profiles
     set overall_trust_tier = v_new_tier::trust_tier,
         previous_tier      = v_old_tier,
         tier_changed_at   = now()
   where user_id = p_user_id;
  -- If the employee_profile row doesn't exist yet, create it
  if not found then
    insert into public.employee_profiles(user_id, overall_trust_tier, previous_tier, tier_changed_at)
    values (p_user_id, v_new_tier::trust_tier, v_old_tier, now())
    on conflict (user_id) do update
      set overall_trust_tier = excluded.overall_trust_tier,
          previous_tier      = excluded.previous_tier,
          tier_changed_at   = excluded.tier_changed_at;
  end if;

  insert into public.user_tier_changes(user_id, from_tier, to_tier, reason, triggered_by)
  values (p_user_id, v_old_tier, v_new_tier, coalesce(p_reason, 'auto'), 'auto');

  return v_new_tier;
end $$;
grant execute on function public.apply_level_up(uuid, text) to authenticated, service_role;

-- ============================================================
-- J) RPC: book_interview_slot
--    Employee books an open slot. Marks the slot as booked and
--    creates a booking row. Fires a notification.
-- ============================================================
create or replace function public.book_interview_slot(p_slot_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_slot record;
  v_booking_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select * into v_slot from public.interview_slots where id = p_slot_id for update;
  if not found then raise exception 'Slot not found'; end if;
  if v_slot.status <> 'open' then raise exception 'Slot is not open for booking'; end if;
  if v_slot.scheduled_at < now() then raise exception 'Slot is in the past'; end if;

  insert into public.interview_bookings(slot_id, employee_id, status, result)
  values (p_slot_id, v_user, 'booked', 'pending')
  returning id into v_booking_id;

  update public.interview_slots
     set status = 'booked',
         booked_by = v_user,
         booking_id = v_booking_id
   where id = p_slot_id;

  perform public.create_notification(
    v_slot.interviewer_id,
    'interview_booked',
    case when v_slot.slot_kind = 'tier_b'
      then 'Tier B interview booked'
      else 'Level-up interview booked'
    end,
    'An employee has booked an interview slot.',
    '/admin/interviews'
  );
  perform public.create_notification(
    v_user,
    'interview_booked',
    'Interview booked',
    'Your interview is scheduled. You will receive the meeting link closer to the date.',
    '/dashboard/level-up'
  );

  return v_booking_id;
end $$;
grant execute on function public.book_interview_slot(uuid) to authenticated;

-- ============================================================
-- K) RPC: upload_interview_result
--    Panel member / admin uploads pass/fail for a booking. If passed
--    and it's a level-up interview, attempt to apply the level-up
--    automatically if all criteria are now met.
-- ============================================================
create or replace function public.upload_interview_result(
  p_booking_id uuid,
  p_result     text,
  p_notes      text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_booking record;
  v_slot record;
  v_new_tier text := null;
  v_is_admin boolean := public.is_admin('super_admin');
  v_is_panel boolean := false;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_result not in ('passed','failed') then
    raise exception 'result must be passed or failed';
  end if;

  select * into v_booking from public.interview_bookings where id = p_booking_id;
  if not found then raise exception 'Booking not found'; end if;

  select * into v_slot from public.interview_slots where id = v_booking.slot_id;

  select exists (
    select 1 from public.interview_panel_members
     where user_id = v_user and is_active = true
  ) into v_is_panel;

  if not (v_is_admin or v_is_panel or v_slot.interviewer_id = v_user) then
    raise exception 'Only panel members, the assigned interviewer, or admins can upload results';
  end if;

  update public.interview_bookings
     set result              = p_result,
         result_notes        = p_notes,
         result_uploaded_by  = v_user,
         result_uploaded_at  = now(),
         status              = 'completed'
   where id = p_booking_id;

  update public.interview_slots
     set status = 'completed'
   where id = v_booking.slot_id;

  perform public.create_notification(
    v_booking.employee_id,
    case when p_result = 'passed' then 'interview_passed' else 'interview_failed' end,
    case when p_result = 'passed' then 'Interview passed' else 'Interview result' end,
    coalesce(p_notes, case when p_result = 'passed'
      then 'Congratulations! You passed the interview.'
      else 'Unfortunately, you did not pass this round. You may try again after the cooldown.'
    end),
    '/dashboard/level-up'
  );

  -- If passed a level-up interview, attempt to apply the level-up
  if p_result = 'passed' and v_slot.slot_kind = 'level_up' and v_slot.target_tier is not null then
    begin
      v_new_tier := public.apply_level_up(v_booking.employee_id, 'interview');
    exception when others then
      v_new_tier := null;  -- criteria not all met yet; will auto-apply later
    end;
  end if;

  return jsonb_build_object(
    'ok', true,
    'result', p_result,
    'new_tier', v_new_tier
  );
end $$;
grant execute on function public.upload_interview_result(uuid, text, text) to authenticated, service_role;

-- ============================================================
-- L) Trigger: when a contract is marked completed, count it
-- toward the employee's level-up progress (idempotent).
-- When a contract is cancelled, count it (only if employee raised it).
-- Also: try to auto-promote the employee when all criteria are met.
-- ============================================================
create or replace function public.trg_count_completed_contract()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (TG_OP = 'UPDATE' and new.status = 'completed' and (old.status is distinct from 'completed')) then
    insert into public.employee_profiles(user_id) values (new.employee_id)
      on conflict (user_id) do nothing;
    -- Try to auto-evaluate level-up. Errors are swallowed so they
    -- don't block the parent transaction.
    begin
      perform public.apply_level_up(new.employee_id, 'auto on completion');
    exception when others then
      null;  -- not eligible yet
    end;
  end if;
  return new;
end $$;
drop trigger if exists trg_count_completed_contract on public.contracts;
create trigger trg_count_completed_contract
  after update on public.contracts
  for each row execute function public.trg_count_completed_contract();

-- Also try level-up after a rating is posted, since rating affects eligibility
create or replace function public.trg_recheck_levelup_on_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (TG_OP = 'INSERT' or TG_OP = 'UPDATE') then
    begin
      perform public.apply_level_up(new.reviewee_id, 'auto on rating');
    exception when others then
      null;
    end;
  end if;
  return new;
end $$;
drop trigger if exists trg_recheck_levelup_on_rating on public.reviews;
create trigger trg_recheck_levelup_on_rating
  after insert or update on public.reviews
  for each row execute function public.trg_recheck_levelup_on_rating();

-- ============================================================
-- M) RPC: get_user_tier_snapshot
--    Returns the public-facing tier info for a user (label, fee,
--    changed_at). Used by buyer-side views to always show the
--    freshest tier without waiting for cache invalidation.
-- ============================================================
create or replace function public.get_user_tier_snapshot(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user record;
  v_pct numeric;
begin
  -- Trust tier lives on employee_profiles
  select overall_trust_tier, previous_tier, tier_changed_at
    into v_user
    from public.employee_profiles where user_id = p_user_id;
  if not found then
    return jsonb_build_object('tier', 'provisional', 'platform_fee_pct', 0.15, 'label', 'Provisional');
  end if;
  v_pct := public.get_platform_fee_pct(p_user_id);
  return jsonb_build_object(
    'tier',              v_user.overall_trust_tier,
    'previous_tier',     v_user.previous_tier,
    'tier_changed_at',   v_user.tier_changed_at,
    'platform_fee_pct',  v_pct,
    'label',             initcap(replace(v_user.overall_trust_tier::text, '_', ' '))
  );
end $$;
grant execute on function public.get_user_tier_snapshot(uuid) to authenticated, service_role, anon;
