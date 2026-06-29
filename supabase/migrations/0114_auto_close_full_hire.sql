-- 0114: Auto-close task when the last opening is filled.
-- hire_applicant and finalize_offer_to_contract already flip the task
-- to 'in_contract' when the last opening is filled. This migration goes
-- one step further: it also sets status='closed' and closed_at=now()
-- when the task has no remaining openings.
--
-- Note: this happens AFTER the contract is created (status='active'),
-- so the workspace is already initialized. Closing the task prevents
-- further applications but does not affect the in-flight contract.

create or replace function public.auto_close_task_if_full(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_openings   int;
  v_status     text;
  v_hired      int;
begin
  select status, coalesce(openings, 1) into v_status, v_openings
    from public.task_posts where id = p_task_id;
  if v_status is null or v_status not in ('open', 'in_contract', 'upcoming') then
    return;
  end if;
  select count(*) into v_hired
    from public.contracts c
   where c.task_post_id = p_task_id
     and c.status <> 'cancelled';
  if v_hired >= v_openings then
    update public.task_posts
       set status = 'closed',
           closed_at = now(),
           updated_at = now()
     where id = p_task_id
       and status <> 'closed';
  end if;
end;
$$;
grant execute on function public.auto_close_task_if_full(uuid) to authenticated;

-- 1) hire_applicant — add auto-close at the end
create or replace function public.hire_applicant(
  p_application_id uuid,
  p_buyer_message  text default null
) returns table(ok boolean, error_text text, contract_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app            record;
  v_task           record;
  v_contract_id    uuid;
  v_workspace_id   uuid;
  v_pricing_model  text;
  v_estimated_hours numeric;
  v_buyer          uuid;
  v_tier           category_tier;
  v_item           jsonb;
  v_idx            int := 0;
  v_brief_key      text;
  v_existing       int;
  v_openings       int;
  v_hired_count    int;
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
         p.pricing_model, p.estimated_hours, p.category_id, p.brief,
         coalesce(p.openings, 1) as openings
    into v_task
    from public.task_posts p
   where p.id = v_app.task_id;
  if not found then
    return query select false, 'Task not found'::text, null::uuid;
    return;
  end if;
  if v_task.status = 'in_contract' or v_task.status = 'closed' or v_task.status = 'cancelled' then
    return query select false, 'Task no longer accepts hires'::text, null::uuid;
    return;
  end if;

  v_buyer := v_task.buyer_id;
  if v_buyer <> auth.uid() then
    return query select false, 'Not your task'::text, null::uuid;
    return;
  end if;

  -- 3) HIRING LIMIT
  v_openings := coalesce(v_task.openings, 1);
  select count(*) into v_hired_count
    from public.contracts c
   where c.task_post_id = v_app.task_id
     and c.status <> 'cancelled';
  if v_hired_count >= v_openings then
    return query select false,
      format('You have already hired %s employee%s for this task. No openings left.',
             v_hired_count, case when v_hired_count = 1 then '' else 's' end)::text,
      null::uuid;
    return;
  end if;

  v_pricing_model := coalesce(v_task.pricing_model, 'fixed');
  v_estimated_hours := coalesce(v_task.estimated_hours, 1);

  select c.tier into v_tier
    from public.skill_categories c
   where c.id = v_task.category_id;
  if v_tier is null then v_tier := 'micro_task'::category_tier; end if;

  -- 4) Mark the application as hired
  update public.task_applications
     set hiring_stage = 'hired',
         hiring_stage_updated_at = now()
   where id = p_application_id;

  -- 5) Create the contract
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

  -- 6) Mark task as in_contract (always — at least one opening is now filled)
  update public.task_posts
     set status = 'in_contract', updated_at = now()
   where id = v_app.task_id
     and status not in ('closed', 'cancelled');

  -- 7) Backfill workspace
  select w.id into v_workspace_id
    from public.workspaces w
   where w.contract_id = v_contract_id;
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

  -- 8) Materialize the delivery_checklist_items
  if v_task.brief ? 'checklist_items'
     and jsonb_typeof(v_task.brief->'checklist_items') = 'array' then
    for v_item in
      select * from jsonb_array_elements(v_task.brief->'checklist_items')
    loop
      v_idx := v_idx + 1;
      v_brief_key := coalesce(v_item->>'key', 'item_' || v_idx);
      select count(*) into v_existing
        from public.delivery_checklist_items dci
       where dci.contract_id    = v_contract_id
         and dci.brief_item_key = v_brief_key;
      if v_existing = 0 then
        begin
          insert into public.delivery_checklist_items(
            contract_id, brief_item_key, description, sort_order
          ) values (
            v_contract_id, v_brief_key, v_item->>'text', v_idx
          );
        exception when unique_violation then
          null;
        end;
      end if;
    end loop;
  end if;

  -- 9) Hourly checkpoints
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

  -- 10) Notify the employee
  perform public.create_notification(
    v_app.employee_id, 'hired', 'You were hired!',
    coalesce(p_buyer_message, 'The buyer picked you for this task. Open your dashboard to coordinate next steps.'),
    '/dashboard/contracts'
  );

  -- 11) AUTO-CLOSE if the last opening is now filled
  if v_hired_count + 1 >= v_openings then
    perform public.auto_close_task_if_full(v_app.task_id);
  end if;

  return query select true, null::text, v_contract_id;
end;
$$;
grant execute on function public.hire_applicant(uuid, text) to authenticated;

-- 2) finalize_offer_to_contract — also add auto-close at the end
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
  v_task        record;
  v_emp         record;
  v_tier        category_tier;
  v_contract_id uuid;
  v_item        jsonb;
  v_idx         int := 0;
  v_brief_key   text;
  v_existing    int;
  v_openings    int;
  v_hired_count int;
begin
  select * into v_task from public.task_posts where id = p_task_post_id;
  if not found then raise exception 'Task not found'; end if;

  select * into v_emp from public.users where id = p_employee_id;
  if not found then raise exception 'Employee not found'; end if;

  select c.tier into v_tier from public.skill_categories c where c.id = v_task.category_id;
  if v_tier is null then v_tier := 'micro_task'; end if;

  v_openings := coalesce(v_task.openings, 1);
  select count(*) into v_hired_count
    from public.contracts c
   where c.task_post_id = p_task_post_id
     and c.status <> 'cancelled';
  if v_hired_count >= v_openings then
    raise exception 'No openings left for this task';
  end if;

  insert into public.contracts (
    task_post_id, buyer_id, employee_id, category_id, tier,
    pricing_model, agreed_price, status, started_at
  ) values (
    p_task_post_id, p_buyer_id, p_employee_id, v_task.category_id, v_tier,
    v_task.pricing_model, p_agreed_price, 'active', now()
  )
  returning id into v_contract_id;

  update public.task_posts
     set status = 'in_contract', updated_at = now()
   where id = p_task_post_id
     and status not in ('closed', 'cancelled');

  if v_task.brief ? 'checklist_items'
     and jsonb_typeof(v_task.brief->'checklist_items') = 'array' then
    for v_item in
      select * from jsonb_array_elements(v_task.brief->'checklist_items')
    loop
      v_idx := v_idx + 1;
      v_brief_key := coalesce(v_item->>'key', 'item_' || v_idx);
      select count(*) into v_existing
        from public.delivery_checklist_items dci
       where dci.contract_id    = v_contract_id
         and dci.brief_item_key = v_brief_key;
      if v_existing = 0 then
        begin
          insert into public.delivery_checklist_items(
            contract_id, brief_item_key, description, sort_order
          ) values (
            v_contract_id, v_brief_key, v_item->>'text', v_idx
          );
        exception when unique_violation then
          null;
        end;
      end if;
    end loop;
  end if;

  -- AUTO-CLOSE if the last opening is now filled
  if v_hired_count + 1 >= v_openings then
    perform public.auto_close_task_if_full(p_task_post_id);
  end if;

  return v_contract_id;
end;
$$;
grant execute on function public.finalize_offer_to_contract(uuid, uuid, bigint, text, uuid) to authenticated;
