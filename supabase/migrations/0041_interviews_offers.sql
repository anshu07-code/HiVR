-- =============================================================================
-- 0041_interviews_offers.sql
-- =============================================================================
-- Adds interview scheduling, offer tracking, and a helper that fires
-- notifications on every hiring-stage change.

-- Interviews — used for interview_r1, interview_r2, and skill_test stages.
create table if not exists public.application_interviews (
  id              uuid primary key default uuid_generate_v4(),
  application_id  uuid not null references public.task_applications(id) on delete cascade,
  round_type      text not null check (round_type in ('interview_r1','interview_r2','test','offer_call')),
  scheduled_at    timestamptz not null,
  duration_min    int not null default 30,
  location        text,                -- physical address or 'remote' / 'video'
  meeting_url     text,                -- Google Meet / Zoom link
  agenda          text,                -- what the round will cover
  notes           text,                -- buyer's internal notes (not shown to employee)
  status          text not null default 'scheduled' check (status in ('scheduled','completed','cancelled','no_show','rescheduled')),
  employee_response text check (employee_response in ('accepted','declined','pending')),
  employee_response_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists application_interviews_app_idx on public.application_interviews(application_id, scheduled_at);

-- Offers — sent by buyer, accepted/declined by employee.
create table if not exists public.application_offers (
  id              uuid primary key default uuid_generate_v4(),
  application_id  uuid not null references public.task_applications(id) on delete cascade,
  sent_by         uuid not null references public.users(id),
  amount_paise    bigint,                -- the offered amount
  start_date      date,
  expires_at      timestamptz not null,  -- employee must respond by then
  message         text,                -- buyer's message
  terms           text,                -- additional terms
  status          text not null default 'pending' check (status in ('pending','accepted','declined','expired','withdrawn')),
  responded_at    timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists application_offers_app_idx on public.application_offers(application_id, created_at desc);

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

alter table public.application_interviews enable row level security;
alter table public.application_offers    enable row level security;

-- Interviews: both the buyer and the employee of the contract can read
drop policy if exists "ai_read_participants"  on public.application_interviews;
drop policy if exists "ai_insert_buyer"      on public.application_interviews;
drop policy if exists "ai_update_buyer"      on public.application_interviews;
drop policy if exists "ai_update_employee"   on public.application_interviews;
drop policy if exists "ai_admin"              on public.application_interviews;
create policy "ai_read_participants" on public.application_interviews for select
  using (
    exists (
      select 1 from public.task_applications a
      join public.task_posts p on p.id = a.task_id
      where a.id = application_id
        and (p.buyer_id = auth.uid() or a.employee_id = auth.uid())
    )
  );
create policy "ai_insert_buyer" on public.application_interviews for insert
  with check (
    exists (
      select 1 from public.task_applications a
      join public.task_posts p on p.id = a.task_id
      where a.id = application_id and p.buyer_id = auth.uid()
    )
  );
create policy "ai_update_buyer" on public.application_interviews for update
  using (
    exists (
      select 1 from public.task_applications a
      join public.task_posts p on p.id = a.task_id
      where a.id = application_id and p.buyer_id = auth.uid()
    )
  );
-- Employee can update their own response (accept/decline)
create policy "ai_update_employee" on public.application_interviews for update
  using (
    exists (
      select 1 from public.task_applications a
      where a.id = application_id and a.employee_id = auth.uid()
    )
  );
create policy "ai_admin" on public.application_interviews for all using (public.is_admin());

-- Offers: same RLS pattern
drop policy if exists "ao_read_participants"  on public.application_offers;
drop policy if exists "ao_insert_buyer"      on public.application_offers;
drop policy if exists "ao_update_buyer"      on public.application_offers;
drop policy if exists "ao_update_employee"   on public.application_offers;
drop policy if exists "ao_admin"              on public.application_offers;
create policy "ao_read_participants" on public.application_offers for select
  using (
    exists (
      select 1 from public.task_applications a
      join public.task_posts p on p.id = a.task_id
      where a.id = application_id
        and (p.buyer_id = auth.uid() or a.employee_id = auth.uid())
    )
  );
create policy "ao_insert_buyer" on public.application_offers for insert
  with check (
    exists (
      select 1 from public.task_applications a
      join public.task_posts p on p.id = a.task_id
      where a.id = application_id and p.buyer_id = auth.uid()
    )
  );
create policy "ao_update_buyer" on public.application_offers for update
  using (
    exists (
      select 1 from public.task_applications a
      join public.task_posts p on p.id = a.task_id
      where a.id = application_id and p.buyer_id = auth.uid()
    )
  );
create policy "ao_update_employee" on public.application_offers for update
  using (
    exists (
      select 1 from public.task_applications a
      where a.id = application_id and a.employee_id = auth.uid()
    )
  );
create policy "ao_admin" on public.application_offers for all using (public.is_admin());

grant select, insert, update on public.application_interviews to anon, authenticated;
grant select, insert, update on public.application_offers    to anon, authenticated;

-- ----------------------------------------------------------------------------
-- RPC: respond to an offer (employee only). Sets status to accepted/declined
-- and triggers the rest of the workflow.
--   * accepted → application's hiring_stage becomes 'hired', contract is
--     created via the existing hire_applicant flow
--   * declined → application's hiring_stage becomes 'rejected'
--   * no response in 7 days → status becomes 'expired' (cron job needed)
-- ----------------------------------------------------------------------------
create or replace function public.respond_to_offer(
  p_offer_id uuid,
  p_response text  -- 'accepted' | 'declined'
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee uuid;
  v_app_id uuid;
  v_offer_status text;
begin
  select a.employee_id, a.id, o.status
    into v_employee, v_app_id, v_offer_status
  from public.application_offers o
  join public.task_applications a on a.id = o.application_id
  where o.id = p_offer_id;
  if v_employee is null then return false; end if;
  if v_employee <> auth.uid() then return false; end if;
  if v_offer_status <> 'pending' then return false; end if;
  if p_response not in ('accepted', 'declined') then return false; end if;

  update public.application_offers
  set status = p_response, responded_at = now()
  where id = p_offer_id;

  if p_response = 'accepted' then
    -- Trigger the hire flow: set stage to 'hired' (the existing trigger
    -- syncs `status` and updates the task to in_contract)
    update public.task_applications
    set hiring_stage = 'hired', hiring_stage_updated_at = now()
    where id = v_app_id;
  else
    update public.task_applications
    set hiring_stage = 'rejected', hiring_stage_updated_at = now()
    where id = v_app_id;
  end if;
  return true;
end;
$$;
grant execute on function public.respond_to_offer(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- RPC: employee responds to an interview invitation.
--   * 'accepted'  → no change to status (they show up)
--   * 'declined'  → interview marked declined; hiring_stage stays as-is
-- ----------------------------------------------------------------------------
create or replace function public.respond_to_interview(
  p_interview_id uuid,
  p_response text  -- 'accepted' | 'declined'
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee uuid;
begin
  select a.employee_id into v_employee
  from public.application_interviews i
  join public.task_applications a on a.id = i.application_id
  where i.id = p_interview_id;
  if v_employee is null then return false; end if;
  if v_employee <> auth.uid() then return false; end if;
  if p_response not in ('accepted', 'declined') then return false; end if;

  update public.application_interviews
  set employee_response = p_response,
      employee_response_at = now(),
      updated_at = now()
  where id = p_interview_id;
  return true;
end;
$$;
grant execute on function public.respond_to_interview(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Update advance_application_stage to also fire notifications for the
-- shortlist / interview_r1 / interview_r2 / test / offer transitions.
-- Existing function (0037) only updates the stage; we wrap it.
-- ----------------------------------------------------------------------------
create or replace function public.advance_application_stage(
  p_application_id uuid,
  p_new_stage text,
  p_note text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer uuid;
  v_task uuid;
  v_employee uuid;
  v_old_stage text;
  v_task_title text;
begin
  select p.buyer_id, a.task_id, a.employee_id, a.hiring_stage, p.title
    into v_buyer, v_task, v_employee, v_old_stage, v_task_title
  from public.task_applications a
  join public.task_posts p on p.id = a.task_id
  where a.id = p_application_id;
  if v_buyer is null then return false; end if;

  -- Auth: only the task's buyer can advance.
  if v_buyer <> auth.uid() then return false; end if;

  update public.task_applications
  set hiring_stage = p_new_stage,
      hiring_stage_history = hiring_stage_history || jsonb_build_object(
        'from', v_old_stage,
        'to', p_new_stage,
        'at', now()::text,
        'note', coalesce(p_note, '')
      ),
      hiring_notes = case
        when p_note is not null and p_note <> '' then hiring_notes || jsonb_build_object(p_new_stage, p_note)
        else hiring_notes
      end
  where id = p_application_id;

  -- Fire a notification for the employee
  perform public.create_notification(
    v_employee,
    'hiring_stage',
    case p_new_stage
      when 'shortlist'     then 'You were shortlisted!'
      when 'interview_r1'  then 'Interview R1 scheduled'
      when 'interview_r2'  then 'Interview R2 scheduled'
      when 'test'          then 'Skill test assigned'
      when 'offer'         then 'You received an offer'
      when 'hired'         then 'You were hired!'
      when 'rejected'      then 'Application update'
      else                    'Application status changed'
    end,
    case p_new_stage
      when 'shortlist'     then 'The buyer wants to move you to the next round for "' || v_task_title || '".'
      when 'interview_r1'  then 'Check your dashboard for the interview details.'
      when 'interview_r2'  then 'You advanced to the second interview round.'
      when 'test'          then 'A skill test has been assigned. See dashboard for details.'
      when 'offer'         then 'Open the offer to review terms and accept.'
      when 'hired'         then 'Welcome aboard! Open your dashboard to coordinate next steps.'
      when 'rejected'      then 'Unfortunately this one didn''t work out. More matches are on the way.'
      else                    'Open dashboard for details.'
    end,
    '/dashboard/applications'
  );

  return true;
end;
$$;
grant execute on function public.advance_application_stage(uuid, text, text) to authenticated;

-- Also: when an application is first created, notify the buyer.
create or replace function public.notify_buyer_on_apply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer uuid;
  v_task_title text;
  v_emp_name text;
begin
  select p.buyer_id, p.title into v_buyer, v_task_title
  from public.task_posts p where p.id = NEW.task_id;
  select full_name into v_emp_name from public.users where id = NEW.employee_id;
  perform public.create_notification(
    v_buyer,
    'new_application',
    'New applicant',
    coalesce(v_emp_name, 'Someone') || ' applied to "' || v_task_title || '".',
    '/dashboard/tasks/' || NEW.task_id || '/applicants'
  );
  return NEW;
end;
$$;
drop trigger if exists trg_task_applications_notify_buyer on public.task_applications;
create trigger trg_task_applications_notify_buyer
  after insert on public.task_applications
  for each row execute function public.notify_buyer_on_apply();
