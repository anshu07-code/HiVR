-- 0079_fix_hire_and_backfill.sql
-- Robust fix for "I got hired but no contract was created".
--
-- The original `respond_instant_hire_offer`, `respond_buyer_pushback`,
-- and `respond_custom_counter` RPCs all had `perform … into …` lines
-- which is invalid PL/pgSQL. The fix in migration 0076 used dynamic
-- SQL (`pg_get_functiondef` + `replace`) which is fragile — the
-- function bodies in the DB may not contain the exact string we're
-- replacing, or the dynamic SQL execution may fail silently.
--
-- This migration hard-codes the corrected versions of all three
-- RPCs as full CREATE OR REPLACE statements, so the fix is
-- guaranteed to apply. It also backfills any hired applications
-- that are missing a contract.

-- =====================================================================
-- 1) respond_instant_hire_offer — full corrected version
-- =====================================================================
create or replace function public.respond_instant_hire_offer(
  p_negotiation_offer_id uuid,
  p_response             text,
  p_comment              text default null,
  p_revised_price_paise  bigint default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp     uuid := auth.uid();
  v_neg     record;
  v_max_rounds int := public.platform_setting('pushback_max_rounds')::int;
  v_contract_id uuid;
begin
  select n.*, t.buyer_id, t.title, t.category_id, t.scope_flag, t.brief
    into v_neg
    from public.negotiation_offers n
    join public.task_posts t on t.id = n.task_post_id
   where n.id = p_negotiation_offer_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Offer not found'); end if;
  if v_neg.employee_id <> v_emp then return jsonb_build_object('ok', false, 'error', 'Not your offer'); end if;
  if v_neg.status <> 'pending' then return jsonb_build_object('ok', false, 'error', 'Offer is no longer pending'); end if;
  if p_response not in ('accept','pushback','decline') then
    return jsonb_build_object('ok', false, 'error', 'Invalid response');
  end if;

  if p_response = 'decline' then
    update public.negotiation_offers
      set status = 'declined', responded_at = now()
      where id = p_negotiation_offer_id;
    update public.application_offers
      set status = 'declined', responded_at = now()
      where status = 'pending' and application_id in (
        select id from public.task_applications
          where task_id = v_neg.task_post_id and employee_id = v_emp
      );
    perform public.create_notification(
      v_neg.buyer_id, 'hiring_stage', 'Offer declined',
      'The employee declined the instant hire offer for "' || v_neg.title || '".',
      '/dashboard/tasks/' || v_neg.task_post_id || '/applicants'
    );
    return jsonb_build_object('ok', true, 'status', 'declined');
  end if;

  if p_response = 'pushback' then
    if p_revised_price_paise is null or p_revised_price_paise <= 0 then
      return jsonb_build_object('ok', false, 'error', 'Revised price required for pushback');
    end if;
    if v_neg.round_number >= v_max_rounds then
      return jsonb_build_object('ok', false, 'error', 'No more pushback rounds left');
    end if;
    update public.negotiation_offers
      set status = 'countered', responded_at = now()
      where id = p_negotiation_offer_id;
    insert into public.negotiation_offers(
      task_post_id, employee_id, buyer_id, offer_type, round_number,
      proposed_price, comment, status, created_by
    ) values (
      v_neg.task_post_id, v_neg.employee_id, v_neg.buyer_id, 'instant_hire_pushback', v_neg.round_number + 1,
      p_revised_price_paise, p_comment, 'pending', v_emp
    );
    perform public.create_notification(
      v_neg.buyer_id, 'instant_hire_offer', 'Pushback received',
      'Employee asked for ₹' || (p_revised_price_paise/100)::text || ' instead (round ' || (v_neg.round_number+1) || ' of ' || v_max_rounds || ').',
      '/dashboard/tasks/' || v_neg.task_post_id || '/applicants'
    );
    return jsonb_build_object('ok', true, 'status', 'pushback', 'round', v_neg.round_number + 1);
  end if;

  -- 'accept' — finalize the offer and start the contract
  update public.negotiation_offers
    set status = 'accepted', responded_at = now()
    where id = p_negotiation_offer_id;

  -- FIX: was `perform ... into` (invalid). Use plain SELECT … INTO.
  select public.finalize_offer_to_contract(
    v_neg.task_post_id, v_neg.employee_id, v_neg.proposed_price,
    'standard'::text, v_neg.buyer_id
  ) into v_contract_id;

  update public.application_offers
    set status = 'accepted', responded_at = now()
    where status = 'pending' and application_id in (
      select id from public.task_applications
        where task_id = v_neg.task_post_id and employee_id = v_emp
    );

  return jsonb_build_object('ok', true, 'status', 'accepted', 'contract_id', v_contract_id);
end;
$$;
grant execute on function public.respond_instant_hire_offer(uuid, text, text, bigint) to authenticated;

-- =====================================================================
-- 2) respond_buyer_pushback — full corrected version
-- =====================================================================
create or replace function public.respond_buyer_pushback(
  p_negotiation_offer_id uuid,
  p_response             text,   -- 'accept' | 'decline' | 'counter'
  p_revised_price_paise  bigint default null,
  p_comment              text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer uuid := auth.uid();
  v_neg  record;
  v_max_rounds int := public.platform_setting('pushback_max_rounds')::int;
  v_min_paise   bigint := public.platform_setting('min_negotiated_offer_paise')::bigint;
  v_max_paise   bigint := public.platform_setting('max_negotiated_offer_paise')::bigint;
  v_contract_id uuid;
  v_emp_standing bigint;
begin
  select n.*, t.buyer_id, t.title, t.category_id
    into v_neg
    from public.negotiation_offers n
    join public.task_posts t on t.id = n.task_post_id
   where n.id = p_negotiation_offer_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Offer not found'); end if;
  if v_neg.buyer_id <> v_buyer then return jsonb_build_object('ok', false, 'error', 'Not your offer'); end if;
  if v_neg.status <> 'pending' then return jsonb_build_object('ok', false, 'error', 'Offer is no longer pending'); end if;
  if p_response not in ('accept','decline','counter') then
    return jsonb_build_object('ok', false, 'error', 'Invalid response');
  end if;

  if p_response = 'decline' then
    update public.negotiation_offers set status = 'declined', responded_at = now() where id = p_negotiation_offer_id;
    perform public.create_notification(
      v_neg.employee_id, 'hiring_stage', 'Pushback declined',
      'The buyer declined your counter offer for "' || v_neg.title || '".',
      '/dashboard/tasks/' || v_neg.task_post_id || '/applicants'
    );
    return jsonb_build_object('ok', true, 'status', 'declined');
  end if;

  if p_response = 'counter' then
    if p_revised_price_paise is null or p_revised_price_paise <= 0 then
      return jsonb_build_object('ok', false, 'error', 'Counter price required');
    end if;
    select esr.standing_rate into v_emp_standing
      from public.employee_standing_rates esr
     where esr.user_id = v_neg.employee_id and esr.category_id = v_neg.category_id;
    if v_emp_standing is not null and (p_revised_price_paise < v_emp_standing * 0.8 or p_revised_price_paise > v_emp_standing * 1.2) then
      return jsonb_build_object('ok', false, 'error', 'Counter outside ±20% of employee standing rate');
    end if;
    if v_neg.round_number >= v_max_rounds then
      return jsonb_build_object('ok', false, 'error', 'No more pushback rounds left');
    end if;
    update public.negotiation_offers
      set status = 'countered', responded_at = now()
      where id = p_negotiation_offer_id;
    insert into public.negotiation_offers(
      task_post_id, employee_id, buyer_id, offer_type, round_number,
      proposed_price, comment, status, created_by
    ) values (
      v_neg.task_post_id, v_neg.employee_id, v_neg.buyer_id, 'buyer_counter', v_neg.round_number + 1,
      p_revised_price_paise, p_comment, 'pending', v_buyer
    );
    perform public.create_notification(
      v_neg.employee_id, 'instant_hire_offer', 'Counter offer received',
      'The buyer countered at ₹' || (p_revised_price_paise/100)::text || ' (round ' || (v_neg.round_number+1) || ' of ' || v_max_rounds || ').',
      '/dashboard/tasks/' || v_neg.task_post_id || '/applicants'
    );
    return jsonb_build_object('ok', true, 'status', 'counter', 'round', v_neg.round_number + 1);
  end if;

  -- 'accept' — finalize the offer and start the contract
  update public.negotiation_offers
    set status = 'accepted', responded_at = now()
    where id = p_negotiation_offer_id;

  -- FIX: was `perform ... into` (invalid). Use plain SELECT … INTO.
  select public.finalize_offer_to_contract(
    v_neg.task_post_id, v_neg.employee_id, v_neg.proposed_price,
    'standard'::text, v_buyer
  ) into v_contract_id;

  return jsonb_build_object('ok', true, 'status', 'accepted', 'contract_id', v_contract_id);
end;
$$;
grant execute on function public.respond_buyer_pushback(uuid, text, bigint, text) to authenticated;

-- =====================================================================
-- 3) Backfill: create contracts + workspaces for any hired
--    application that's missing one. Idempotent.
-- =====================================================================
do $$
declare
  v_app         record;
  v_task        record;
  v_tier        category_tier;
  v_contract_id uuid;
  v_workspace_id uuid;
  v_made        int := 0;
  v_skipped     int := 0;
begin
  for v_app in
    select a.id, a.task_id, a.employee_id, a.bid_paise, a.hiring_stage, a.updated_at
      from public.task_applications a
     where a.hiring_stage = 'hired'
  loop
    select p.title, p.buyer_id, p.status, p.budget_min, p.budget_max,
           p.pricing_model, p.estimated_hours, p.category_id, p.brief
      into v_task
      from public.task_posts p where p.id = v_app.task_id;

    if not found then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    if exists (
      select 1 from public.contracts
       where task_post_id = v_app.task_id
         and employee_id  = v_app.employee_id
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    select c.tier into v_tier
      from public.skill_categories c where c.id = v_task.category_id;
    if v_tier is null then v_tier := 'micro_task'; end if;

    insert into public.contracts (
      task_post_id, buyer_id, employee_id, category_id, tier,
      pricing_model, agreed_price, status, started_at
    ) values (
      v_app.task_id, v_task.buyer_id, v_app.employee_id,
      v_task.category_id, v_tier,
      coalesce(v_task.pricing_model, 'fixed'),
      coalesce(v_app.bid_paise, v_task.budget_min, 0),
      'active', coalesce(v_app.updated_at, now())
    )
    returning id into v_contract_id;

    -- Backfill workspace if the trigger didn't create one
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

    -- Materialize the delivery checklist
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

    -- Mark task as in_contract
    update public.task_posts
       set status = 'in_contract', updated_at = now()
     where id = v_app.task_id
       and status not in ('closed','cancelled');

    -- Notify employee
    perform public.create_notification(
      v_app.employee_id, 'hired', 'You were hired!',
      'A contract for "' || v_task.title || '" has been created. Open the workspace to coordinate.',
      '/dashboard/contracts'
    );

    v_made := v_made + 1;
    raise notice 'backfill: app % → contract % → workspace %', v_app.id, v_contract_id, v_workspace_id;
  end loop;

  raise notice 'backfill: % contract(s) created, % skipped', v_made, v_skipped;
end $$;

-- =====================================================================
-- 4) Final report
-- =====================================================================
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
