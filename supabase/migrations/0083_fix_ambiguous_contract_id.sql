-- 0083_fix_ambiguous_contract_id.sql
-- Fixes "column reference contract_id is ambiguous" when clicking
-- "Hire directly". The error comes from the `on conflict (contract_id,
-- brief_item_key)` clause in `hire_applicant` and
-- `finalize_offer_to_contract`. Using `on conflict on constraint
-- <name>` instead of column names avoids any column-reference
-- ambiguity.

-- 1) hire_applicant — recreate with `on conflict on constraint`
create or replace function public.hire_applicant(
  p_application_id uuid,
  p_buyer_message  text default null
) returns table(ok boolean, error_text text, contract_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app           record;
  v_task          record;
  v_contract_id   uuid;
  v_workspace_id  uuid;
  v_pricing_model text;
  v_estimated_hours numeric;
  v_buyer         uuid;
  v_tier          category_tier;
  v_item          jsonb;
  v_idx           int := 0;
begin
  -- 1) Look up the application
  select a.id, a.employee_id, a.task_id, a.bid_paise, a.hiring_stage, a.status
    into v_app
    from public.task_applications a
   where a.id = p_application_id;

  if not found then
    return query select false, 'Application not found'::text, null::uuid;
    return;
  end if;
  if v_app.hiring_stage = 'hired' or v_app.status = 'hired' then
    return query select false, 'Already hired'::text, null::uuid;
    return;
  end if;

  -- 2) Look up the task
  select p.title, p.buyer_id, p.status, p.budget_min, p.budget_max,
         p.pricing_model, p.estimated_hours, p.category_id, p.brief
    into v_task
    from public.task_posts p
   where p.id = v_app.task_id;

  if not found then
    return query select false, 'Task not found'::text, null::uuid;
    return;
  end if;
  if v_task.status = 'in_contract' then
    return query select false, 'Task already in contract'::text, null::uuid;
    return;
  end if;

  v_buyer := v_task.buyer_id;
  if v_buyer <> auth.uid() then
    return query select false, 'Not your task'::text, null::uuid;
    return;
  end if;

  v_pricing_model := coalesce(v_task.pricing_model, 'fixed');
  v_estimated_hours := coalesce(v_task.estimated_hours, 1);

  select c.tier into v_tier
    from public.skill_categories c
   where c.id = v_task.category_id;
  if v_tier is null then v_tier := 'micro_task'::category_tier; end if;

  -- 3) Mark the application as hired + the task as in_contract
  update public.task_applications
     set hiring_stage = 'hired',
         hiring_stage_updated_at = now()
   where id = p_application_id;

  update public.task_posts
     set status = 'in_contract', updated_at = now()
   where id = v_app.task_id
     and status not in ('closed', 'cancelled');

  -- 4) Create the contract (the trg_create_workspace_for_contract
  --    trigger should fire and create the workspace automatically).
  insert into public.contracts (
    task_post_id, buyer_id, employee_id, category_id, tier,
    pricing_model, agreed_price, status, started_at
  ) values (
    v_app.task_id, v_buyer, v_app.employee_id,
    v_task.category_id, v_tier,
    v_pricing_model,
    coalesce(v_app.bid_paise, v_task.budget_min, 0),
    'active', now()
  )
  returning id into v_contract_id;

  -- 5) Backfill workspace if the trigger didn't create one
  select id into v_workspace_id
    from public.workspaces
   where contract_id = v_contract_id;
  if v_workspace_id is null then
    insert into public.workspaces(
      contract_id, buyer_id, employee_id, status, escrow_amount_paise
    ) values (
      v_contract_id, v_buyer, v_app.employee_id,
      'awaiting_funding',
      coalesce(v_app.bid_paise, v_task.budget_min, 0)
    )
    returning id into v_workspace_id;
  end if;

  -- 6) Materialize the delivery_checklist_items from the brief
  --    FIX: use `on conflict on constraint` instead of `on conflict (col1, col2)`
  --    to avoid "column reference contract_id is ambiguous" at parse time.
  if v_task.brief ? 'checklist_items'
     and jsonb_typeof(v_task.brief->'checklist_items') = 'array' then
    for v_item in
      select * from jsonb_array_elements(v_task.brief->'checklist_items')
    loop
      v_idx := v_idx + 1;
      begin
        insert into public.delivery_checklist_items(
          contract_id, brief_item_key, description, sort_order
        ) values (
          v_contract_id,
          coalesce(v_item->>'key', 'item_' || v_idx),
          v_item->>'text',
          v_idx
        )
        on conflict on constraint delivery_checklist_items_contract_id_brief_item_key
        do nothing;
      exception when unique_violation then
        -- ignore duplicate key
      end;
    end loop;
  end if;

  -- 7) Create hourly checkpoints if pricing is hourly
  if v_contract_id is not null and v_pricing_model = 'hourly' then
    begin
      perform public.create_hourly_checkpoints(
        v_contract_id,
        greatest(coalesce(v_estimated_hours, 2), 1) * 60,
        30
      );
    exception when others then null;
    end;
  end if;

  -- 8) Notify the employee
  perform public.create_notification(
    v_app.employee_id, 'hired', 'You were hired!',
    coalesce(p_buyer_message, 'The buyer picked you for this task. Open your dashboard to coordinate next steps.'),
    '/dashboard/contracts'
  );

  return query select true, null::text, v_contract_id;
end;
$$;
grant execute on function public.hire_applicant(uuid, text) to authenticated;

-- 2) finalize_offer_to_contract — same fix for the same on-conflict pattern
create or replace function public.finalize_offer_to_contract(
  p_task_post_id   uuid,
  p_employee_id    uuid,
  p_agreed_price   bigint,
  p_scope_flag     text,
  p_buyer_id       uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task     record;
  v_emp      record;
  v_tier     category_tier;
  v_contract_id uuid;
  v_item     jsonb;
  v_idx      int := 0;
begin
  select * into v_task from public.task_posts where id = p_task_post_id;
  if not found then raise exception 'Task not found'; end if;

  select * into v_emp from public.users where id = p_employee_id;
  if not found then raise exception 'Employee not found'; end if;

  select c.tier into v_tier from public.skill_categories c where c.id = v_task.category_id;
  if v_tier is null then v_tier := 'micro_task'; end if;

  -- Create the contract
  insert into public.contracts(
    task_post_id, buyer_id, employee_id, category_id, tier,
    pricing_model, agreed_price, status, started_at, scope_flag,
    incentive_condition_type, incentive_threshold, incentive_amount_paise
  ) values (
    p_task_post_id, p_buyer_id, p_employee_id, v_task.category_id, v_tier,
    coalesce(v_task.pricing_model, 'fixed'),
    p_agreed_price, 'active', now(), p_scope_flag,
    v_task.incentive_condition_type, v_task.incentive_threshold, v_task.incentive_amount_paise
  ) returning id into v_contract_id;

  -- Update task_posts.status
  update public.task_posts set status = 'in_contract' where id = p_task_post_id;

  -- Update application to 'hired'
  update public.task_applications
    set hiring_stage = 'hired', hiring_stage_updated_at = now()
    where task_id = p_task_post_id and employee_id = p_employee_id;

  -- Materialize the delivery checklist from the brief
  -- FIX: use `on conflict on constraint` instead of `on conflict (col1, col2)`
  if v_task.brief ? 'checklist_items' and jsonb_typeof(v_task.brief->'checklist_items') = 'array' then
    for v_item in select * from jsonb_array_elements(v_task.brief->'checklist_items')
    loop
      v_idx := v_idx + 1;
      begin
        insert into public.delivery_checklist_items(
          contract_id, brief_item_key, description, sort_order
        ) values (
          v_contract_id,
          coalesce(v_item->>'key', 'item_' || v_idx),
          v_item->>'text',
          v_idx
        )
        on conflict on constraint delivery_checklist_items_contract_id_brief_item_key
        do nothing;
      exception when unique_violation then
        -- ignore duplicate key
      end;
    end loop;
  end if;

  -- Fire notifications
  perform public.create_notification(
    p_employee_id, 'hired', 'You were hired!',
    'The buyer accepted your offer for "' || v_task.title || '". Open the workspace to coordinate.',
    '/dashboard/contracts'
  );
  perform public.create_notification(
    p_buyer_id, 'hired', 'Contract started',
    'A contract for "' || v_task.title || '" is now active.',
    '/dashboard/contracts'
  );

  return v_contract_id;
end;
$$;
grant execute on function public.finalize_offer_to_contract(uuid, uuid, bigint, text, uuid) to authenticated;
