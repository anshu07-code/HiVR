-- 0118: Hire directly & offer bargaining use employee's per-skill rates
-- 1. hire_applicant uses get_employee_skill_rate for contract price
-- 2. create_instant_hire_offer uses get_employee_skill_rate
-- 3. Pushback/counter validation enforces -20% floor

-- ============================================================
-- 1) Helper: compute contract price from employee's per-skill rate
-- ============================================================
create or replace function public.compute_contract_price_from_skill_rate(
  p_employee_id   uuid,
  p_category_id   uuid,
  p_pricing_model text,
  p_estimated_hours int default null
) returns bigint
language plpgsql
stable
as $$
declare
  v_rate  bigint;
  v_price bigint;
begin
  v_rate := public.get_employee_skill_rate(p_employee_id, p_category_id, p_pricing_model);

  if v_rate is null then
    -- Fallback: skill rate not set — return null so caller can use existing logic
    return null;
  end if;

  if p_pricing_model = 'hourly' then
    v_price := v_rate * greatest(coalesce(p_estimated_hours, 1), 1);
  elsif p_pricing_model = 'fixed' then
    v_price := v_rate;
  elsif p_pricing_model = 'daily_rate' then
    v_price := v_rate;
  elsif p_pricing_model = 'fixed_milestone' then
    v_price := v_rate;
  else
    v_price := v_rate;
  end if;

  return v_price;
end;
$$;

-- ============================================================
-- 2) Update hire_applicant to use employee's skill rate
-- ============================================================
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
  v_skill_rate    bigint;
  v_contract_price bigint;
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

  -- 3) Calculate contract price from employee's per-skill rate
  v_skill_rate := public.compute_contract_price_from_skill_rate(
    v_app.employee_id, v_task.category_id, v_pricing_model, v_estimated_hours::int
  );
  v_contract_price := coalesce(v_skill_rate, v_app.bid_paise, v_task.budget_min, 0);

  -- 4) Mark the application as hired + the task as in_contract
  update public.task_applications
     set hiring_stage = 'hired',
         hiring_stage_updated_at = now()
   where id = p_application_id;

  update public.task_posts
     set status = 'in_contract', updated_at = now()
   where id = v_app.task_id
     and status not in ('closed', 'cancelled');

  -- 5) Create the contract
  insert into public.contracts (
    task_post_id, buyer_id, employee_id, category_id, tier,
    pricing_model, agreed_price, status, started_at
  ) values (
    v_app.task_id, v_buyer, v_app.employee_id,
    v_task.category_id, v_tier,
    v_pricing_model,
    v_contract_price,
    'active', now()
  )
  returning id into v_contract_id;

  -- 6) Backfill workspace if the trigger didn't create one
  select id into v_workspace_id
    from public.workspaces
   where contract_id = v_contract_id;
  if v_workspace_id is null then
    insert into public.workspaces(
      contract_id, buyer_id, employee_id, status, escrow_amount_paise
    ) values (
      v_contract_id, v_buyer, v_app.employee_id,
      'awaiting_funding',
      v_contract_price
    )
    returning id into v_workspace_id;
  end if;

  -- 7) Materialize the delivery_checklist_items from the brief
  if v_task.brief ? 'checklist_items'
     and jsonb_typeof(v_task.brief->'checklist_items') = 'array' then
    for v_item in
      select * from jsonb_array_elements(v_task.brief->'checklist_items')
    loop
      v_idx := v_idx + 1;
      insert into public.delivery_checklist_items(
        contract_id, brief_item_key, description, sort_order
      ) values (
        v_contract_id,
        coalesce(v_item->>'key', 'item_' || v_idx),
        v_item->>'text',
        v_idx
      )
      on conflict (contract_id, brief_item_key) do nothing;
    end loop;
  end if;

  -- 8) Create hourly checkpoints if pricing is hourly
  if v_contract_id is not null and v_pricing_model = 'hourly' then
    begin
      perform public.create_hourly_checkpoints(
        v_contract_id,
        greatest(v_estimated_hours, 2) * 60,
        30
      );
    exception when others then null;
    end;
  end if;

  -- 9) Notify the employee
  perform public.create_notification(
    v_app.employee_id, 'hired', 'You were hired!',
    coalesce(p_buyer_message, 'The buyer picked you for this task. Open your dashboard to coordinate next steps.'),
    '/dashboard/contracts'
  );

  return query select true, null::text, v_contract_id;
end;
$$;

grant execute on function public.hire_applicant(uuid, text) to authenticated;

-- ============================================================
-- 3) Update create_instant_hire_offer to use skill rate
-- ============================================================
create or replace function public.create_instant_hire_offer(
  p_task_post_id uuid,
  p_employee_id  uuid,
  p_comment      text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer uuid := auth.uid();
  v_task  record;
  v_emp   record;
  v_rate  bigint;
  v_skill_rate bigint;
  v_offer_id uuid;
  v_neg_id  uuid;
begin
  if v_buyer is null then return jsonb_build_object('ok', false, 'error', 'Not signed in'); end if;

  select * into v_task from public.task_posts where id = p_task_post_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Task not found'); end if;
  if v_task.buyer_id <> v_buyer then return jsonb_build_object('ok', false, 'error', 'Not your task'); end if;
  if v_task.status not in ('open','upcoming') then
    return jsonb_build_object('ok', false, 'error', 'Task not open for hire');
  end if;
  if coalesce((v_task.brief->>'checklist_items')::jsonb, '[]'::jsonb) = '[]'::jsonb then
    return jsonb_build_object('ok', false, 'error', 'Brief checklist is required before hiring');
  end if;

  select u.id, u.is_suspended, ep.application_paused, ep.permanent_ban
    into v_emp
  from public.users u join public.employee_profiles ep on ep.user_id = u.id
  where u.id = p_employee_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Employee not found'); end if;
  if v_emp.is_suspended or v_emp.application_paused or v_emp.permanent_ban then
    return jsonb_build_object('ok', false, 'error', 'Employee is not currently available');
  end if;

  -- Use the employee's explicit per-skill rate for this task's pricing model
  v_skill_rate := public.get_employee_skill_rate(p_employee_id, v_task.category_id, v_task.pricing_model);
  if v_skill_rate is null then
    -- Fall back to computed standing rate
    v_rate := public.recompute_employee_standing_rate(p_employee_id, v_task.category_id);
  else
    v_rate := v_skill_rate;
  end if;

  insert into public.negotiation_offers(
    task_post_id, employee_id, buyer_id, offer_type, round_number,
    proposed_price, comment, status, created_by
  ) values (
    p_task_post_id, p_employee_id, v_buyer, 'instant_hire_pushback', 1,
    v_rate, p_comment, 'pending', v_buyer
  ) returning id into v_neg_id;

  insert into public.application_offers(
    application_id, sent_by, amount_paise, expires_at, message, terms, status
  ) values (
    (select id from public.task_applications
       where task_id = p_task_post_id and employee_id = p_employee_id limit 1),
    v_buyer, v_rate, now() + (public.platform_setting('instant_hire_lock_hours')::text || ' hours')::interval,
    p_comment, 'Instant Hire at employee rate', 'pending'
  ) returning id into v_offer_id;

  perform public.create_notification(
    p_employee_id, 'instant_hire_offer', 'Instant hire offer',
    'A buyer offered to hire you at ₹' || (v_rate/100)::text || ' for "' || v_task.title || '".',
    '/dashboard/applications'
  );

  return jsonb_build_object(
    'ok', true,
    'negotiation_offer_id', v_neg_id,
    'application_offer_id', v_offer_id,
    'standing_rate', v_rate,
    'pushback_rounds_left', (public.platform_setting('pushback_max_rounds')::int)
  );
end;
$$;

grant execute on function public.create_instant_hire_offer(uuid, uuid, text) to authenticated;

-- ============================================================
-- 4) Update respond_instant_hire_offer to enforce -20% floor on pushback
-- ============================================================
create or replace function public.respond_instant_hire_offer(
  p_negotiation_offer_id uuid,
  p_response             text,
  p_counter_price        bigint default null,
  p_comment              text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_neg      record;
  v_task     record;
  v_emp      uuid := auth.uid();
  v_rate     bigint;
  v_min_price bigint;
  v_new_neg_id uuid;
begin
  if v_emp is null then return jsonb_build_object('ok', false, 'error', 'Not signed in'); end if;

  select * into v_neg from public.negotiation_offers where id = p_negotiation_offer_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Offer not found'); end if;
  if v_neg.status <> 'pending' then return jsonb_build_object('ok', false, 'error', 'Offer already responded to'); end if;
  if v_neg.employee_id <> v_emp and v_neg.buyer_id <> v_emp then
    return jsonb_build_object('ok', false, 'error', 'Not your offer');
  end if;

  select * into v_task from public.task_posts where id = v_neg.task_post_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Task not found'); end if;

  -- Get the employee's rate for this skill + pricing model
  v_rate := public.get_employee_skill_rate(v_neg.employee_id, v_task.category_id, v_task.pricing_model);
  if v_rate is null then
    v_rate := public.recompute_employee_standing_rate(v_neg.employee_id, v_task.category_id);
  end if;

  -- Minimum acceptable price: 80% of the employee's rate
  v_min_price := round(v_rate * 0.8);

  if p_response = 'accept' then
    -- Accept at the proposed price
    update public.negotiation_offers set status = 'accepted', responded_at = now() where id = p_negotiation_offer_id;
    perform public.finalize_offer_to_contract(
      v_neg.task_post_id, v_neg.employee_id,
      coalesce(p_counter_price, v_neg.proposed_price),
      'standard', v_neg.buyer_id
    );
    update public.application_offers
      set status = 'accepted', responded_at = now()
      where application_id = (select id from public.task_applications where task_id = v_neg.task_post_id and employee_id = v_neg.employee_id limit 1);
    return jsonb_build_object('ok', true, 'status', 'accepted');
  end if;

  if p_response = 'decline' then
    update public.negotiation_offers set status = 'declined', responded_at = now() where id = p_negotiation_offer_id;
    update public.application_offers
      set status = 'declined', responded_at = now()
      where application_id = (select id from public.task_applications where task_id = v_neg.task_post_id and employee_id = v_neg.employee_id limit 1);
    return jsonb_build_object('ok', true, 'status', 'declined');
  end if;

  if p_response = 'pushback' or p_response = 'counter' then
    if p_counter_price is null then
      return jsonb_build_object('ok', false, 'error', 'Counter price required for pushback');
    end if;
    -- Employee-side pushback: they're offering to work for LESS than their rate
    if v_emp = v_neg.employee_id and p_counter_price > v_rate then
      return jsonb_build_object('ok', false, 'error', 'Employee counter price cannot exceed your set rate');
    end if;
    -- Buyer-side pushback: they can't offer less than 80% of the employee's rate
    if v_emp = v_neg.buyer_id and p_counter_price < v_min_price then
      return jsonb_build_object('ok', false, 'error', 'Offer cannot be less than 80% of employee\'s rate (₹' || (v_min_price/100)::text || ')');
    end if;
    -- Both sides must not go below 80%
    if p_counter_price < v_min_price then
      return jsonb_build_object('ok', false, 'error', 'Price cannot be less than 80% of the employee\'s rate');
    end if;

    if v_neg.round_number >= public.platform_setting('pushback_max_rounds')::int then
      return jsonb_build_object('ok', false, 'error', 'Maximum pushback rounds reached');
    end if;

    update public.negotiation_offers set status = 'countered', responded_at = now() where id = p_negotiation_offer_id;
    insert into public.negotiation_offers(
      task_post_id, employee_id, buyer_id, offer_type, round_number,
      proposed_price, comment, status, created_by
    ) values (
      v_neg.task_post_id, v_neg.employee_id, v_neg.buyer_id, 'instant_hire_pushback', v_neg.round_number + 1,
      p_counter_price, p_comment, 'pending', v_emp
    ) returning id into v_new_neg_id;

    return jsonb_build_object('ok', true, 'status', 'counter', 'round', v_neg.round_number + 1, 'negotiation_offer_id', v_new_neg_id);
  end if;

  return jsonb_build_object('ok', false, 'error', 'Invalid response');
end;
$$;

grant execute on function public.respond_instant_hire_offer(uuid, text, bigint, text) to authenticated;
