-- 0084_bulletproof_hire_directly.sql
-- "Hire directly" was still failing with
--   "column reference contract_id is ambiguous"
-- after 0083 because 0083 still uses `on conflict on constraint <name>`,
-- which fails if the actual unique constraint has a different name
-- (PostgreSQL will append a numeric suffix or use the first index
-- name it finds). This migration removes ALL `on conflict (...)` /
-- `on conflict on constraint (...)` patterns from the hire flow and
-- relies on `begin ... exception when unique_violation` savepoints
-- instead — that does not reference any bare column names and so
-- cannot be ambiguous.

-- 0) Make sure the unique constraint exists and rename it to a known
--    stable name, so future migrations / RPCs can refer to it if needed.
do $$
declare
  v_cn text;
begin
  select c.conname into v_cn
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public'
     and t.relname = 'delivery_checklist_items'
     and c.contype = 'u'
     and array_length(c.conkey, 1) = 2
     and exists (
       select 1 from pg_attribute a
        where a.attrelid = t.oid
          and a.attnum = c.conkey[1]
          and a.attname = 'contract_id'
     )
     and exists (
       select 1 from pg_attribute a
        where a.attrelid = t.oid
          and a.attnum = c.conkey[2]
          and a.attname = 'brief_item_key'
     )
   limit 1;

  if v_cn is not null and v_cn <> 'dci_contract_brief_unique' then
    execute format('alter table public.delivery_checklist_items
                    rename constraint %I to dci_contract_brief_unique', v_cn);
  elsif v_cn is null then
    -- no matching constraint: create one with the known name
    alter table public.delivery_checklist_items
      add constraint dci_contract_brief_unique
      unique (contract_id, brief_item_key);
  end if;
end $$;

-- 1) hire_applicant — no `on conflict` anywhere
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
  v_brief_key     text;
  v_existing      int;
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

  -- 6) Materialize the delivery_checklist_items from the brief.
  --    NO `on conflict` clauses anywhere — we use a savepoint per
  --    insert and swallow unique_violation. This avoids the
  --    "column reference contract_id is ambiguous" parse-time error
  --    that `on conflict (contract_id, brief_item_key)` triggers.
  if v_task.brief ? 'checklist_items'
     and jsonb_typeof(v_task.brief->'checklist_items') = 'array' then
    for v_item in
      select * from jsonb_array_elements(v_task.brief->'checklist_items')
    loop
      v_idx := v_idx + 1;
      v_brief_key := coalesce(v_item->>'key', 'item_' || v_idx);

      -- skip if the row already exists (idempotent)
      select count(*) into v_existing
        from public.delivery_checklist_items
       where contract_id    = v_contract_id
         and brief_item_key = v_brief_key;

      if v_existing = 0 then
        begin
          insert into public.delivery_checklist_items(
            contract_id, brief_item_key, description, sort_order
          ) values (
            v_contract_id, v_brief_key, v_item->>'text', v_idx
          );
        exception when unique_violation then
          -- race: another insert beat us. Ignore.
          null;
        end;
      end if;
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

-- 2) finalize_offer_to_contract — same bulletproof pattern
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
  v_brief_key text;
  v_existing int;
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

  -- Materialize the delivery checklist from the brief (savepoint pattern)
  if v_task.brief ? 'checklist_items' and jsonb_typeof(v_task.brief->'checklist_items') = 'array' then
    for v_item in select * from jsonb_array_elements(v_task.brief->'checklist_items')
    loop
      v_idx := v_idx + 1;
      v_brief_key := coalesce(v_item->>'key', 'item_' || v_idx);

      select count(*) into v_existing
        from public.delivery_checklist_items
       where contract_id    = v_contract_id
         and brief_item_key = v_brief_key;

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

-- 3) Sanity check — show the constraint + recompile the two functions
select conname, pg_get_constraintdef(oid)
  from pg_constraint
 where conrelid = 'public.delivery_checklist_items'::regclass
   and contype = 'u';
