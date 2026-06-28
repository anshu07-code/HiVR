-- 0075_direct_hire_anshuti_prerana.sql
-- Creates a direct hire: anshutiwarirnc@gmail.com (buyer) hires
-- preranabothra9@gmail.com (employee) for one of the buyer's open tasks.
-- Runs the same flow the "Hire directly" button in the applicants
-- panel would: task_application → contract → workspace (auto-created
-- by the existing trg_create_workspace_for_contract trigger).
--
-- After running this, sign in as the buyer or employee and go to
-- /dashboard/contracts/<id> to see the full workspace (chat, vault,
-- checklist, activity timeline).

do $$
declare
  v_buyer  uuid;
  v_emp    uuid;
  v_task   uuid;
  v_cat    uuid;
  v_app    uuid;
  v_c      uuid;
begin
  -- 1) Resolve the two users
  select id into v_buyer from public.users where email = 'anshutiwarirnc@gmail.com';
  select id into v_emp   from public.users where email = 'preranabothra9@gmail.com';

  if v_buyer is null or v_emp is null then
    raise notice 'direct_hire: missing user — run 0074 first';
    return;
  end if;

  -- 2) Pick the first open task posted by the buyer. If none exists,
  --    fall back to her most recent task (any status) so the test
  --    contract can still be created.
  select id, category_id into v_task, v_cat
    from public.task_posts
   where buyer_id = v_buyer
     and status in ('open', 'in_contract', 'closed')
   order by (status = 'open') desc, created_at desc
   limit 1;

  if v_task is null then
    raise notice 'direct_hire: no task found for buyer — post a task first';
    return;
  end if;

  raise notice 'direct_hire: buyer=%, employee=%, task=%', v_buyer, v_emp, v_task;

  -- 3) Idempotent: skip if this exact contract (buyer + employee +
  --    task_post) already exists.
  select id into v_c
    from public.contracts
   where buyer_id = v_buyer
     and employee_id = v_emp
     and task_post_id = v_task
   limit 1;

  if v_c is not null then
    raise notice 'direct_hire: contract already exists (%) — skipping insert', v_c;
  else
    -- 4) Create the task_application (hired state).
    --     Uses on conflict do nothing via a unique index on
    --     (task_post_id, employee_id) — the migration 0023 added
    --     a unique constraint on this pair.
    insert into public.task_applications (
      task_post_id, employee_id, hiring_stage, created_at, updated_at
    ) values (
      v_task, v_emp, 'hired', now(), now()
    )
    on conflict (task_post_id, employee_id) do update set
      hiring_stage = 'hired',
      updated_at   = now()
    returning id into v_app;

    -- 5) Create the contract. The trg_create_workspace_for_contract
    --    trigger (from migration 0050) auto-creates a `workspaces`
    --    row with status='awaiting_funding' on insert.
    insert into public.contracts (
      task_post_id, buyer_id, employee_id, category_id,
      status, agreed_price, pricing_model, tier, started_at
    ) values (
      v_task, v_buyer, v_emp, v_cat,
      'active',
      coalesce((select budget_min from public.task_posts where id = v_task), 600000),
      coalesce((select pricing_model from public.task_posts where id = v_task), 'fixed'),
      'micro_task'::category_tier,
      now()
    )
    returning id into v_c;

    -- 6) Move the task to 'in_contract' so it doesn't show up as
    --    'open' on /browse anymore.
    update public.task_posts
       set status = 'in_contract',
           updated_at = now()
     where id = v_task;

    -- 7) Notify the employee that they've been hired.
    perform public.create_notification(
      v_emp,
      'contract'::text,
      'You''ve been hired'::text,
      'Anshuti Tiwari hired you for "' || (select title from public.task_posts where id = v_task) || '". Workspace is ready.'::text,
      jsonb_build_object('contract_id', v_c, 'task_id', v_task, 'href', '/dashboard/contracts/' || v_c::text)
    );

    raise notice 'direct_hire: created contract % (workspace auto-created)', v_c;
  end if;
end $$;

-- Show the result
select c.id            as contract_id,
       c.status,
       c.agreed_price,
       c.started_at,
       tp.title        as task_title,
       buyer.full_name as buyer,
       emp.full_name   as employee,
       w.id            as workspace_id,
       w.status        as workspace_status,
       w.escrow_funded
  from public.contracts c
  join public.users buyer on buyer.id = c.buyer_id
  join public.users emp   on emp.id   = c.employee_id
  join public.task_posts tp on tp.id  = c.task_post_id
  left join public.workspaces w on w.contract_id = c.id
 where c.buyer_id     = (select id from public.users where email = 'anshutiwarirnc@gmail.com')
   and c.employee_id  = (select id from public.users where email = 'preranabothra9@gmail.com')
 order by c.started_at desc
 limit 5;
