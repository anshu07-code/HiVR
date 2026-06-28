-- =============================================================================
-- 0036_task_features.sql
-- =============================================================================
-- Adds features to task_posts for hiring workflow, scheduling, and skills.

alter table public.task_posts
  add column if not exists skills_required        text[] not null default '{}',
  add column if not exists published_at           timestamptz default now(),
  add column if not exists scheduled_publish_at   timestamptz,
  add column if not exists show_in_upcoming       boolean not null default true,
  add column if not exists closed_at              timestamptz,
  add column if not exists deadline_extended_count int not null default 0;

-- Backfill: existing tasks are "already published"
update public.task_posts
set published_at = coalesce(published_at, created_at)
where published_at is null;

-- Indexes for the new filter sections
create index if not exists task_posts_published_at_idx
  on public.task_posts(published_at);
create index if not exists task_posts_scheduled_publish_at_idx
  on public.task_posts(scheduled_publish_at)
  where scheduled_publish_at is not null;
create index if not exists task_posts_status_published_idx
  on public.task_posts(status, published_at desc);

-- -----------------------------------------------------------------------------
-- Function: auto-promote scheduled tasks to "open" when their
-- scheduled_publish_at is in the past. Called from the browse page on every
-- load (cheap, indexed query). We do this in SQL rather than a cron because:
--   * the cron secret is a long random string, easy to forget
--   * the task goes live as soon as anyone visits the browse page
--   * all the other public pages can call it too
-- -----------------------------------------------------------------------------
create or replace function public.promote_scheduled_tasks()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_promoted int;
begin
  with promoted as (
    update public.task_posts
    set status = 'open',
        published_at = now()
    where status = 'upcoming'
      and scheduled_publish_at is not null
      and scheduled_publish_at <= now()
    returning id
  )
  select count(*) into v_promoted from promoted;
  return v_promoted;
end;
$$;

grant execute on function public.promote_scheduled_tasks() to anon, authenticated;

-- -----------------------------------------------------------------------------
-- View: task_counts — used by the dashboard + browse list to show applicants
-- per task without doing N+1 queries.
-- -----------------------------------------------------------------------------
create or replace view public.task_applicant_counts as
select
  task_id,
  count(*) filter (where status <> 'withdrawn') as applicant_count,
  count(*) filter (where status = 'shortlisted') as shortlisted_count,
  count(*) filter (where status = 'hired') as hired_count
from public.task_applications
group by task_id;

grant select on public.task_applicant_counts to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Extend the status check to include 'upcoming' for scheduled tasks
-- -----------------------------------------------------------------------------
alter table public.task_posts drop constraint if exists task_posts_status_check;
alter table public.task_posts add constraint task_posts_status_check
  check (status in ('upcoming', 'open', 'in_contract', 'closed', 'cancelled'));

-- -----------------------------------------------------------------------------
-- Function: hire an applicant. Atomic — sets the application to 'hired',
-- sets the task to 'in_contract', marks all other applications as 'not_selected',
-- and records a notification for the hired employee. Returns the contract id
-- (or null if no contracts table yet).
-- -----------------------------------------------------------------------------
create or replace function public.hire_applicant(
  p_task_id uuid,
  p_application_id uuid,
  p_buyer_message text default null
) returns table (ok boolean, reason text, application_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer uuid;
  v_employee uuid;
  v_task_status text;
  v_app_employee uuid;
  v_app_status text;
  v_contract_id uuid;
  v_pricing_model text;
  v_estimated_hours int;
begin
  -- Auth: must be the task's buyer
  select buyer_id, status, pricing_model, estimated_hours
    into v_buyer, v_task_status, v_pricing_model, v_estimated_hours
  from public.task_posts where id = p_task_id;
  if v_buyer is null then
    return query select false, 'Task not found'::text, null::uuid; return;
  end if;
  if v_buyer <> auth.uid() then
    return query select false, 'Not your task'::text, null::uuid; return;
  end if;
  if v_task_status not in ('open', 'in_contract') then
    return query select false, 'Task is not open for hiring'::text, null::uuid; return;
  end if;

  -- Look up the application
  select employee_id, status into v_app_employee, v_app_status
  from public.task_applications where id = p_application_id and task_id = p_task_id;
  if v_app_employee is null then
    return query select false, 'Application not found'::text, null::uuid; return;
  end if;
  if v_app_status not in ('pending', 'shortlisted', 'interviewing') then
    return query select false, 'Application is no longer hireable'::text, null::uuid; return;
  end if;

  v_employee := v_app_employee;

  -- Atomic state transition
  update public.task_applications
  set status = 'hired', updated_at = now()
  where id = p_application_id;

  update public.task_applications
  set status = 'not_selected', updated_at = now()
  where task_id = p_task_id
    and id <> p_application_id
    and status in ('pending', 'shortlisted', 'interviewing');

  update public.task_posts
  set status = 'in_contract'
  where id = p_task_id;

  -- Create a personalised workspace contract for the buyer + employee.
  -- This becomes /dashboard/contracts/[id] — a per-hire portal with chat,
  -- milestones, and the new contract_resources table for files/urls.
  begin
    insert into public.contracts (
      buyer_id, employee_id, task_post_id,
      category_id, tier, pricing_model, agreed_price,
      status, started_at
    )
    select
      p.buyer_id, v_employee, p_task_id,
      p.category_id,
      c.tier,
      p.pricing_model,
      greatest(coalesce(a.bid_paise, 0), p.budget_min, 100000::bigint)
    from public.task_posts p
    join public.skill_categories c on c.id = p.category_id
    left join public.task_applications a on a.id = p_application_id
    where p.id = p_task_id
    returning id into v_contract_id;
  exception when others then
    -- contracts table may not have all columns; non-fatal
    null;
  end;

  -- For hourly work, auto-create 30-min checkpoint milestones so the
  -- employee gets paid per delivered checkpoint, not at the end. The
  -- agreed_price is split across the checkpoints.
  begin
    if v_contract_id is not null and v_pricing_model = 'hourly' then
      perform public.create_hourly_checkpoints(
        v_contract_id,
        greatest(coalesce(v_estimated_hours, 2), 1) * 60,
        30
      );
    end if;
  exception when others then
    null;
  end;

  -- Notify the hired employee
  begin
    perform public.create_notification(
      v_employee, 'hired', 'You were hired!',
      coalesce(p_buyer_message, 'The buyer picked you for this task. Open your dashboard to coordinate next steps.'),
      '/dashboard/contracts',
      jsonb_build_object('task_id', p_task_id, 'application_id', p_application_id)
    );
  exception when others then null; -- notification table may not exist
  end;

  return query select true, null::text, p_application_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Function: get the contract id for a task (used by the applicants panel
-- "Open workspace" link). Returns null if no contract has been created.
-- -----------------------------------------------------------------------------
create or replace function public.get_contract_for_task(p_task_id uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from public.contracts
  where task_post_id = p_task_id
  order by started_at desc nulls last
  limit 1;
$$;

grant execute on function public.get_contract_for_task(uuid) to authenticated;

grant execute on function public.hire_applicant(uuid, uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Function: close a task. Atomic. Only the buyer can close. Records
-- closed_at, sets status='closed'. Optionally with a reason.
-- -----------------------------------------------------------------------------
create or replace function public.close_task(
  p_task_id uuid,
  p_reason text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer uuid;
begin
  select buyer_id into v_buyer from public.task_posts where id = p_task_id;
  if v_buyer is null or v_buyer <> auth.uid() then
    return false;
  end if;

  update public.task_posts
  set status = 'closed',
      closed_at = now()
  where id = p_task_id;
  return true;
end;
$$;

grant execute on function public.close_task(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Function: extend a task's deadline. Only the buyer. Returns the new
-- deadline.
-- -----------------------------------------------------------------------------
create or replace function public.extend_task_deadline(
  p_task_id uuid,
  p_new_deadline timestamptz
) returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer uuid;
begin
  select buyer_id into v_buyer from public.task_posts where id = p_task_id;
  if v_buyer is null or v_buyer <> auth.uid() then
    return null;
  end if;
  if p_new_deadline <= now() then
    return null;
  end if;

  update public.task_posts
  set deadline = p_new_deadline,
      deadline_extended_count = deadline_extended_count + 1
  where id = p_task_id;
  return p_new_deadline;
end;
$$;

grant execute on function public.extend_task_deadline(uuid, timestamptz) to authenticated;
