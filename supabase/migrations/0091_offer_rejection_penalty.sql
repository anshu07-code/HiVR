-- 0091_offer_rejection_penalty.sql
-- Originally intended to charge a fixed ₹99 penalty to whichever party
-- declines an offer. **This feature has been disabled by the product
-- team — declining an offer is now free for both parties.**
--
-- The helper function `charge_offer_rejection_penalty` is kept in
-- place because it is reused by the unilateral "withdraw from contract"
-- flow added in 0092 (where the withdrawer pays ₹99 to HiVR).
--
-- The `respond_to_offer` and `respond_to_negotiation_offer` functions
-- below still call `charge_offer_rejection_penalty` on decline — this
-- is intentional, because if either of these is invoked in the future
-- from a path that does want the penalty, the helper is available.
-- However, the application flow does not call decline from these
-- paths anymore; the standard "Decline" button in the UI just sets
-- the offer status to 'declined' without invoking the penalty RPC.
-- The functions are also re-patched to NOT charge the penalty on
-- decline — see sections D and E.

-- ============================================================
-- A) New column
-- ============================================================
alter table public.users
  add column if not exists pending_offer_rejection_penalty_paise bigint not null default 0;

-- ============================================================
-- B) Helper: charge the ₹99 penalty to a user.
--    Tries wallet first; falls back to "pending" balance.
-- ============================================================
create or replace function public.charge_offer_rejection_penalty(
  p_user_id uuid,
  p_reason  text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_penalty_paise  constant bigint := 9900; -- ₹99 = 9900 paise
  v_wallet_id      uuid;
  v_balance        bigint := 0;
  v_after          bigint;
  v_debited        bigint := 0;
  v_added_pending  bigint := 0;
  v_new_pending    bigint;
begin
  if p_user_id is null then
    raise exception 'user_id required';
  end if;

  -- Try to debit the wallet directly. If insufficient balance, fall
  -- back to accumulating into users.pending_offer_rejection_penalty_paise.
  select id, balance_paise
    into v_wallet_id, v_balance
    from public.user_wallets
   where user_id = p_user_id
   for update;

  if v_wallet_id is not null and v_balance >= v_penalty_paise then
    v_after := v_balance - v_penalty_paise;
    update public.user_wallets
       set balance_paise          = v_after,
           lifetime_spent_paise   = lifetime_spent_paise + v_penalty_paise,
           updated_at             = now()
     where user_id = p_user_id;

    insert into public.wallet_transactions(
      user_id, amount_paise, direction, kind, description,
      ref_type, ref_id, balance_after_paise, metadata
    ) values (
      p_user_id, v_penalty_paise, 'debit', 'adjustment',
      'Offer rejection fee — ' || coalesce(p_reason, 'offer declined'),
      'offer_rejection', null, v_after,
      jsonb_build_object('reason', p_reason, 'fixed_fee', true)
    );

    v_debited := v_penalty_paise;
  else
    update public.users
       set pending_offer_rejection_penalty_paise =
             pending_offer_rejection_penalty_paise + v_penalty_paise
     where id = p_user_id
     returning pending_offer_rejection_penalty_paise into v_new_pending;
    v_added_pending := v_penalty_paise;
  end if;

  return jsonb_build_object(
    'ok', true,
    'penalty_paise',     v_penalty_paise,
    'debited_paise',     v_debited,
    'pending_added_paise', v_added_pending
  );
end $$;
grant execute on function public.charge_offer_rejection_penalty(uuid, text) to authenticated, service_role;

-- ============================================================
-- C) Helper: consume pending offer-rejection penalty.
--    Called at contract creation (for employees: deducted from
--    payout) and at workspace funding (for buyers: added to the
--    funding amount). Returns the amount deducted and the remainder.
-- ============================================================
create or replace function public.consume_offer_rejection_penalty(
  p_user_id uuid,
  p_amount_available bigint
) returns table(
  deducted_paise      bigint,
  remaining_paise     bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pending  bigint := 0;
  v_deducted bigint := 0;
  v_remain   bigint := 0;
begin
  if p_user_id is null or p_amount_available is null or p_amount_available <= 0 then
    deducted_paise  := 0;
    remaining_paise := 0;
    return next;
    return;
  end if;

  select pending_offer_rejection_penalty_paise
    into v_pending
    from public.users
   where id = p_user_id
   for update;
  v_pending := coalesce(v_pending, 0);

  if v_pending > 0 then
    v_deducted := least(v_pending, p_amount_available);
    v_remain   := v_pending - v_deducted;
    update public.users
       set pending_offer_rejection_penalty_paise = v_remain
     where id = p_user_id;
  end if;

  deducted_paise  := v_deducted;
  remaining_paise := v_remain;
  return next;
end $$;
grant execute on function public.consume_offer_rejection_penalty(uuid, bigint) to authenticated, service_role;

-- ============================================================
-- D) Patch respond_to_offer (from 0046_fix_contract_inserts.sql)
--    to charge a fixed ₹99 penalty on decline, regardless of which
--    party is declining. Either party (employee OR the buyer via
--    a different code path) can decline — the function is invoked
--    by the employee, so the employee is the one paying.
--    The negotiation flow in section E handles the buyer-decline
--    path with the same fee.
-- ============================================================
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
    -- DECLINED: no penalty. Declining an offer is free. The helper
    -- charge_offer_rejection_penalty exists for the unilateral
    -- "withdraw from contract" flow (see migration 0092).
    update public.task_applications
    set hiring_stage = 'rejected', hiring_stage_updated_at = now()
    where id = v_app_id;
    perform public.create_notification(v_buyer, 'hiring_stage', 'Offer declined', 'The employee declined the offer for "' || v_title || '".', '/dashboard/tasks/' || v_task_id || '/applicants');
    return jsonb_build_object('ok', true, 'status', 'declined');
  end if;
end;
$$;
grant execute on function public.respond_to_offer(uuid, text) to authenticated;

-- ============================================================
-- E) Patch the negotiation_offer respond (in 0047) so a buyer
--    who declines an employee's counter-offer pays the same ₹99
--    penalty. The existing function name in 0047 is
--    `respond_to_negotiation_offer` (line ~770 of 0047).
-- ============================================================
create or replace function public.respond_to_negotiation_offer(
  p_negotiation_offer_id uuid,
  p_response text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_neg record;
  v_user uuid := auth.uid();
  v_contract_id uuid;
  v_employee_id uuid;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'Authentication required');
  end if;
  if p_response not in ('accept','counter','decline') then
    return jsonb_build_object('ok', false, 'error', 'Invalid response');
  end if;

  select * into v_neg from public.negotiation_offers where id = p_negotiation_offer_id;
  if v_neg.id is null then
    return jsonb_build_object('ok', false, 'error', 'Offer not found');
  end if;
  if v_neg.buyer_id <> v_user and v_neg.employee_id <> v_user then
    return jsonb_build_object('ok', false, 'error', 'Not a party to this offer');
  end if;
  if v_neg.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'Offer is not pending');
  end if;
  if v_neg.offer_type <> 'custom_scope_negotiation' then
    return jsonb_build_object('ok', false, 'error', 'Wrong offer type');
  end if;

  v_employee_id := v_neg.employee_id;

  if p_response = 'decline' then
    -- DECLINED: no penalty for declining a counter-offer.
    update public.negotiation_offers set status = 'declined', responded_at = now() where id = p_negotiation_offer_id;
    perform public.create_notification(
      case when v_user = v_neg.buyer_id then v_neg.employee_id else v_neg.buyer_id end,
      'hiring_stage', 'Custom offer declined',
      'The ' || case when v_user = v_neg.buyer_id then 'buyer' else 'employee' end ||
      ' declined the custom-scope offer for "' || v_neg.title || '".',
      '/dashboard/tasks/' || v_neg.task_post_id || '/applicants'
    );
    return jsonb_build_object('ok', true, 'status', 'declined');
  end if;

  if p_response = 'accept' then
    update public.negotiation_offers set status = 'accepted', responded_at = now() where id = p_negotiation_offer_id;
    perform public.finalize_offer_to_contract(
      v_neg.task_post_id, v_neg.employee_id, v_neg.proposed_price,
      'custom'::text, v_neg.buyer_id
    ) into v_contract_id;
    update public.application_offers
      set status = 'accepted', responded_at = now()
      where task_post_id = v_neg.task_post_id and employee_id = v_neg.employee_id and status = 'pending';
    perform public.create_notification(
      v_neg.employee_id, 'hired', 'Offer accepted',
      'The buyer accepted your counter-offer for "' || v_neg.title || '". A contract is now active.',
      '/dashboard/contracts'
    );
    return jsonb_build_object('ok', true, 'status', 'accepted', 'contract_id', v_contract_id);
  end if;

  -- counter
  update public.negotiation_offers set status = 'countered', responded_at = now() where id = p_negotiation_offer_id;
  perform public.create_notification(
    case when v_user = v_neg.buyer_id then v_neg.employee_id else v_neg.buyer_id end,
    'hiring_stage', 'Counter-offer received',
    'You received a counter-offer for "' || v_neg.title || '".',
    '/dashboard/tasks/' || v_neg.task_post_id || '/applicants'
  );
  return jsonb_build_object('ok', true, 'status', 'countered');
end;
$$;
grant execute on function public.respond_to_negotiation_offer(uuid, text) to authenticated;

-- ============================================================
-- F) Patch consume_cancellation_penalty so it ALSO consumes any
-- pending offer-rejection penalty on the employee. The total
-- deduction is applied to their first contract payout.
-- ============================================================
create or replace function public.consume_cancellation_penalty(
  p_employee_id          uuid,
  p_contract_agreed_price bigint
) returns table(
  employee_payout_paise    bigint,
  penalty_deducted_paise   bigint,
  remaining_penalty_paise  bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pending   bigint := 0;
  v_deducted  bigint := 0;
  v_payout    bigint;
  v_remaining bigint := 0;
  v_offer_penalty bigint := 0;
  v_offer_deducted bigint := 0;
  v_offer_remaining bigint := 0;
  v_total_deducted bigint := 0;
begin
  v_payout := coalesce(p_contract_agreed_price, 0);

  if p_employee_id is null then
    employee_payout_paise   := v_payout;
    penalty_deducted_paise  := 0;
    remaining_penalty_paise := 0;
    return next;
    return;
  end if;

  -- 1) Cancellation penalty (from previous contract cancellations)
  select pending_cancellation_penalty_paise
    into v_pending
    from public.employee_profiles
   where user_id = p_employee_id
   for update;
  v_pending := coalesce(v_pending, 0);

  if v_pending > 0 and v_payout > 0 then
    v_deducted  := least(v_pending, v_payout);
    v_payout    := v_payout - v_deducted;
    v_remaining := v_pending - v_deducted;
    update public.employee_profiles
       set pending_cancellation_penalty_paise = v_remaining
     where user_id = p_employee_id;
  end if;

  -- 2) Offer-rejection penalty (from previous offer declines)
  select pending_offer_rejection_penalty_paise
    into v_offer_penalty
    from public.users
   where id = p_employee_id
   for update;
  v_offer_penalty := coalesce(v_offer_penalty, 0);

  if v_offer_penalty > 0 and v_payout > 0 then
    v_offer_deducted  := least(v_offer_penalty, v_payout);
    v_payout           := v_payout - v_offer_deducted;
    v_offer_remaining  := v_offer_penalty - v_offer_deducted;
    update public.users
       set pending_offer_rejection_penalty_paise = v_offer_remaining
     where id = p_employee_id;
  end if;

  v_total_deducted := v_deducted + v_offer_deducted;

  employee_payout_paise   := v_payout;
  penalty_deducted_paise  := v_total_deducted;
  remaining_penalty_paise := v_remaining + v_offer_remaining;
  return next;
end $$;
grant execute on function public.consume_cancellation_penalty(uuid, bigint) to authenticated;
