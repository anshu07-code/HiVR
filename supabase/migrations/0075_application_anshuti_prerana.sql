-- 0075_application_anshuti_prerana.sql
-- Creates a single task_application so preranabothra9@gmail.com
-- (employee) appears in the applicants panel of one of
-- anshutiwarirnc@gmail.com's (buyer) tasks. From there the buyer
-- can press "Hire directly" in the UI to create the contract + workspace.
--
-- After running, sign in as anshutiwarirnc, open the task's
-- applicants panel, and Prerana will be listed. Click "Hire directly"
-- to trigger the normal contract-creation flow.

do $$
declare
  v_buyer  uuid;
  v_emp    uuid;
  v_task   uuid;
begin
  -- 1) Resolve the two users
  select id into v_buyer from public.users where email = 'anshutiwarirnc@gmail.com';
  select id into v_emp   from public.users where email = 'preranabothra9@gmail.com';

  if v_buyer is null or v_emp is null then
    raise notice 'application: missing user — run 0074 first';
    return;
  end if;

  -- 2) Pick the buyer's first open task
  select id into v_task
    from public.task_posts
   where buyer_id = v_buyer
     and status in ('open', 'in_contract')
   order by (status = 'open') desc, created_at desc
   limit 1;

  if v_task is null then
    raise notice 'application: no open task for buyer — post a task first';
    return;
  end if;

  raise notice 'application: task=% employee=%', v_task, v_emp;

  -- 3) Idempotent: if Prerana already applied to this task, skip.
  --    (task_applications has a unique index on (task_post_id, employee_id)
  --    from migration 0023.)
  if exists (
    select 1 from public.task_applications
     where task_post_id = v_task and employee_id = v_emp
  ) then
    raise notice 'application: Prerana already applied to this task — nothing to do';
  else
    insert into public.task_applications (
      task_post_id, employee_id,
      cover_letter, expected_paise, hours_per_week, available_from,
      hiring_stage, created_at, updated_at
    ) values (
      v_task, v_emp,
      'Available to start immediately — happy to walk through the data sources and confirm the cleanup approach before locking in the schedule.',
      600000, 30, current_date,
      'pending', now(), now()
    );
    raise notice 'application: created — open the task in the UI to hire directly';
  end if;
end $$;

-- Confirm
select a.id, a.hiring_stage, a.created_at, tp.title as task_title
  from public.task_applications a
  join public.task_posts tp on tp.id = a.task_post_id
 where a.employee_id = (select id from public.users where email = 'preranabothra9@gmail.com')
   and a.task_post_id in (
     select id from public.task_posts where buyer_id = (select id from public.users where email = 'anshutiwarirnc@gmail.com')
   )
 order by a.created_at desc;
