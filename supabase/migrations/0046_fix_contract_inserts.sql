-- 0046 — Fix contract column names in RPC functions

-- Fix respond_to_offer: use correct column names (task_post_id, agreed_price, no application_id) + add category_id + tier
create or replace function public.respond_to_offer(
  p_offer_id uuid,
  p_response text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee uuid;
  v_app_id uuid;
  v_task_id uuid;
  v_offer_status text;
  v_contract_id uuid;
  v_buyer uuid;
  v_title text;
  v_category_id uuid;
  v_tier category_tier;
begin
  select a.employee_id, a.id, a.task_id, o.status, p.buyer_id, p.title, p.category_id
    into v_employee, v_app_id, v_task_id, v_offer_status, v_buyer, v_title, v_category_id
  from public.application_offers o
  join public.task_applications a on a.id = o.application_id
  join public.task_posts p on p.id = a.task_id
  where o.id = p_offer_id;
  if v_employee is null then return jsonb_build_object('ok', false, 'error', 'Offer not found'); end if;
  if v_employee <> auth.uid() then return jsonb_build_object('ok', false, 'error', 'Not your offer'); end if;
  if v_offer_status <> 'pending' then return jsonb_build_object('ok', false, 'error', 'Offer is not pending'); end if;
  if p_response not in ('accepted', 'declined') then return jsonb_build_object('ok', false, 'error', 'Invalid response'); end if;

  select c.tier into v_tier from public.skill_categories c where c.id = v_category_id;
  if v_tier is null then v_tier := 'micro_task'::category_tier; end if;

  update public.application_offers
  set status = p_response, responded_at = now()
  where id = p_offer_id;

  if p_response = 'accepted' then
    update public.task_applications
    set hiring_stage = 'hired', hiring_stage_updated_at = now()
    where id = v_app_id;
    insert into public.contracts (task_post_id, buyer_id, employee_id, category_id, tier, pricing_model, agreed_price, status)
    select v_task_id, v_buyer, v_employee, v_category_id, v_tier, coalesce(p.pricing_model, 'fixed'), coalesce(o.amount_paise, p.budget_min, 0), 'active'
    from public.application_offers o
    join public.task_applications a on a.id = o.application_id
    join public.task_posts p on p.id = a.task_id
    where o.id = p_offer_id
    returning id into v_contract_id;
    perform public.create_notification(v_buyer, 'hired', 'Offer accepted', v_title || ' — the employee accepted your offer and a contract has been created.', '/dashboard/contracts');
    return jsonb_build_object('ok', true, 'status', 'accepted', 'contract_id', v_contract_id);
  else
    update public.task_applications
    set hiring_stage = 'rejected', hiring_stage_updated_at = now()
    where id = v_app_id;
    perform public.create_notification(v_buyer, 'hiring_stage', 'Offer declined', 'The employee declined the offer for "' || v_title || '".', '/dashboard/tasks/' || v_task_id || '/applicants');
    return jsonb_build_object('ok', true, 'status', 'declined');
  end if;
end;
$$;

-- Fix hire_applicant: remove application_id from insert (column doesn't exist on contracts)
create or replace function public.hire_applicant(
  p_application_id uuid,
  p_buyer_message text default null
) returns table(ok boolean, error_text text, contract_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app record;
  v_task record;
  v_contract_id uuid;
  v_pricing_model text;
  v_estimated_hours numeric;
  v_buyer uuid;
  v_tier category_tier;
begin
  select a.id, a.employee_id, a.task_id, a.bid_paise, a.hiring_stage, a.status
    into v_app
  from public.task_applications a where a.id = p_application_id;
  if not found then return query select false, 'Application not found'::text, null::uuid; return; end if;
  if v_app.hiring_stage = 'hired' or v_app.status = 'hired' then
    return query select false, 'Already hired'::text, null::uuid; return;
  end if;
  select p.title, p.buyer_id, p.status, p.budget_min, p.pricing_model, p.estimated_hours, p.category_id
    into v_task
  from public.task_posts p where p.id = v_app.task_id;
  if not found then return query select false, 'Task not found'::text, null::uuid; return; end if;
  if v_task.status = 'in_contract' then
    return query select false, 'Task already in contract'::text, null::uuid; return; end if;
  v_buyer := v_task.buyer_id;
  if v_buyer <> auth.uid() then
    return query select false, 'Not your task'::text, null::uuid; return; end if;
  v_pricing_model := coalesce(v_task.pricing_model, 'fixed');
  v_estimated_hours := coalesce(v_task.estimated_hours, 1);
  select c.tier into v_tier from public.skill_categories c where c.id = v_task.category_id;
  if v_tier is null then v_tier := 'micro_task'::category_tier; end if;
  update public.task_applications set hiring_stage = 'hired', hiring_stage_updated_at = now() where id = p_application_id;
  insert into public.contracts (task_post_id, buyer_id, employee_id, category_id, tier, pricing_model, agreed_price, status, started_at)
  values (v_app.task_id, v_buyer, v_app.employee_id, v_task.category_id, v_tier, v_pricing_model, coalesce(v_app.bid_paise, v_task.budget_min, 0), 'active', now())
  returning id into v_contract_id;
  begin
    if v_contract_id is not null and v_pricing_model = 'hourly' then
      perform public.create_hourly_checkpoints(v_contract_id, greatest(coalesce(v_estimated_hours, 2), 1) * 60, 30);
    end if;
  exception when others then null;
  end;
  begin
    perform public.create_notification(v_app.employee_id, 'hired', 'You were hired!', coalesce(p_buyer_message, 'The buyer picked you for this task. Open your dashboard to coordinate next steps.'), '/dashboard/contracts');
  exception when others then null;
  end;
  return query select true, null::text, v_contract_id;
end;
$$;
