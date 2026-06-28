-- 0078_backfill_hired_applications.sql
-- Fixes the "I got hired but no contract was created" issue.
-- The hire RPCs (hire_applicant, finalize_offer_to_contract) insert into
-- public.contracts — but if any of them silently errored (e.g. the
-- PERFORM-INTO bug in 0076, or an enum-cast bug, or the trigger
-- previously didn't exist), the user can be in the 'hired' state
-- with no contract row.
--
-- This migration walks every task_application in 'hired' state and:
--   1. Creates the missing contract (with all the right fields)
--   2. Lets the existing trg_create_workspace_for_contract trigger
--      auto-create the workspace
--   3. Materializes the delivery_checklist_items from the brief
--   4. Marks the task as 'in_contract'
--   5. Notifies the employee
--
-- Idempotent: re-running won't duplicate (existence checks first).

do $$
declare
  v_app        record;
  v_task       record;
  v_tier       category_tier;
  v_contract_id uuid;
  v_workspace_id uuid;
  v_made       int := 0;
  v_skipped    int := 0;
begin
  for v_app in
    select a.id, a.task_id, a.employee_id, a.bid_paise, a.hiring_stage
      from public.task_applications a
     where a.hiring_stage = 'hired'
  loop
    -- Look up the task
    select p.title, p.buyer_id, p.status, p.budget_min, p.budget_max,
           p.pricing_model, p.estimated_hours, p.category_id, p.brief
      into v_task
      from public.task_posts p where p.id = v_app.task_id;

    if not found then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    -- Skip if a contract already exists for this (task, employee) pair
    if exists (
      select 1 from public.contracts
       where task_post_id = v_app.task_id
         and employee_id  = v_app.employee_id
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    -- Resolve tier
    select c.tier into v_tier
      from public.skill_categories c where c.id = v_task.category_id;
    if v_tier is null then v_tier := 'micro_task'; end if;

    -- 1) Create the contract
    insert into public.contracts (
      task_post_id, buyer_id, employee_id, category_id, tier,
      pricing_model, agreed_price, status, started_at
    ) values (
      v_app.task_id, v_task.buyer_id, v_app.employee_id,
      v_task.category_id, v_tier,
      coalesce(v_task.pricing_model, 'fixed'),
      coalesce(v_app.bid_paise, v_task.budget_min, 0),
      'active', now()
    )
    returning id into v_contract_id;

    -- 2) The trg_create_workspace_for_contract trigger should have
    --    fired. Verify and backfill manually if it didn't.
    select id into v_workspace_id
      from public.workspaces where contract_id = v_contract_id;

    if v_workspace_id is null then
      insert into public.workspaces(
        contract_id, buyer_id, employee_id, status, escrow_amount_paise
      ) values (
        v_contract_id, v_task.buyer_id, v_app.employee_id,
        'awaiting_funding',
        coalesce(v_app.bid_paise, v_task.budget_min, 0)
      )
      returning id into v_workspace_id;
    end if;

    -- 3) Materialize the delivery checklist from the brief
    if v_task.brief ? 'checklist_items'
       and jsonb_typeof(v_task.brief->'checklist_items') = 'array' then
      insert into public.delivery_checklist_items(
        contract_id, brief_item_key, description, sort_order
      )
      select v_contract_id,
             coalesce(item->>'key', 'item_' || ord::text),
             item->>'text',
             ord
        from jsonb_array_elements(v_task.brief->'checklist_items') with ordinality as t(item, ord)
      on conflict (contract_id, brief_item_key) do nothing;
    end if;

    -- 4) Mark the task as in_contract
    update public.task_posts
       set status = 'in_contract', updated_at = now()
     where id = v_app.task_id
       and status not in ('closed','cancelled');

    -- 5) Notify the employee
    perform public.create_notification(
      v_app.employee_id, 'hired', 'You were hired!',
      'A contract for "' || v_task.title || '" has been created. Open the workspace to coordinate.',
      '/dashboard/contracts'
    );

    v_made := v_made + 1;
    raise notice 'backfill: hired app % → contract % → workspace %', v_app.id, v_contract_id, v_workspace_id;
  end loop;

  raise notice 'backfill: % contract(s) created, % skipped (already had contract or task missing)', v_made, v_skipped;
end $$;

-- Final report
select 'hired applications' as what, count(*) as value from public.task_applications where hiring_stage = 'hired'
union all
select 'contracts', count(*) from public.contracts
union all
select 'workspaces', count(*) from public.workspaces
union all
select 'contracts without workspace', count(*)
  from public.contracts c
  left join public.workspaces w on w.contract_id = c.id
 where w.id is null;
