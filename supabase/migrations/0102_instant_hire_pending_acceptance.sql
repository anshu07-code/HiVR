-- 0102_instant_hire_pending_acceptance.sql
-- Fixes H2: instant-hire contracts no longer count as 'active' against
-- the freelancer's load before the candidate accepts.
--
-- The contract_status enum is widened to include 'pending_acceptance'.
-- New contracts created by /api/instant-hire/instant start in this state.
-- When the candidate accepts (or auto-accepts), the contract flips to
-- 'active'. If the offer expires, the route cancels the contract (status
-- stays 'pending_acceptance' until cancel).
--
-- Existing 'active' contracts are unaffected.

-- =============================================================================
-- A) Widen the contract_status enum
-- =============================================================================
do $$ begin
  alter type public.contract_status add value if not exists 'pending_acceptance';
exception when duplicate_object then null; end $$;

-- =============================================================================
-- B) Update the contracts.status CHECK (implicitly updated by enum widening)
-- =============================================================================
-- No additional CHECK update needed — the column references the enum type
-- and the new value is automatically accepted.

-- =============================================================================
-- C) Helper view: count "really active" contracts (i.e. exclude pending_acceptance)
--    The auto-release cron, dashboard KPIs, employee load counts, etc.
--    should all use this view instead of counting 'active' directly.
-- =============================================================================
create or replace view public.v_really_active_contracts as
  select * from public.contracts where status = 'active';

grant select on public.v_really_active_contracts to authenticated, service_role;

-- =============================================================================
-- C) Patch respond_instant_hire_offer: flip contract 'pending_acceptance' → 'active'
--    when the candidate accepts (or auto-accepts).
-- =============================================================================
create or replace function public.respond_instant_hire_offer(
  p_offer_id   uuid,
  p_response   text,
  p_counter_rate_paise bigint default null,
  p_decline_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_o record;
  v_new_offer_id uuid;
  v_next_candidate uuid;
  v_cascaded_from uuid;
  v_new_cascade_position int;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'error', 'Not signed in'); end if;
  if p_response not in ('accept','decline','counter') then
    return jsonb_build_object('ok', false, 'error', 'response must be accept/decline/counter');
  end if;

  select * into v_o from public.instant_hire_offers where id = p_offer_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'Offer not found'); end if;
  if v_o.candidate_id <> v_user then
    return jsonb_build_object('ok', false, 'error', 'You are not the candidate for this offer');
  end if;
  if v_o.status <> 'offered' then
    return jsonb_build_object('ok', false, 'error', 'Offer is no longer active');
  end if;
  if v_o.expires_at < now() then
    update public.instant_hire_offers
       set status = 'expired', responded_at = now()
     where id = p_offer_id;
    return jsonb_build_object('ok', false, 'error', 'Offer has expired');
  end if;

  if p_response = 'accept' then
    update public.instant_hire_offers
       set status = 'accepted', responded_at = now()
     where id = p_offer_id;
    -- H2 fix: flip the contract from 'pending_acceptance' to 'active'
    -- and stamp the start time. Without this, the contract counts as
    -- active only after the candidate accepts.
    update public.contracts
       set status = 'active',
           started_at = coalesce(started_at, now())
     where id = v_o.contract_id and status = 'pending_acceptance';
    -- Mark the candidate as fully busy (committed)
    update public.employee_availability
       set current_active_contracts = current_active_contracts + 1,
           current_load_hours = current_load_hours + 1,
           status = 'busy',
           last_status_change_at = now(),
           updated_at = now()
     where user_id = v_user;
    return jsonb_build_object('ok', true, 'status', 'accepted', 'offer_id', p_offer_id);
  end if;

  if p_response = 'decline' then
    update public.instant_hire_offers
       set status = 'declined', responded_at = now(), decline_reason = p_decline_reason
     where id = p_offer_id;
    -- H2 fix: cancel the contract on decline (it never started).
    update public.contracts
       set status = 'cancelled'
     where id = v_o.contract_id and status = 'pending_acceptance';
    -- Release the busy lock so the candidate is available again
    update public.employee_availability
       set status = 'available', last_status_change_at = now(), updated_at = now()
     where user_id = v_user and status = 'busy';
    return jsonb_build_object('ok', true, 'status', 'declined');
  end if;

  -- counter: a counter-offer (the candidate proposes a new rate)
  if p_counter_rate_paise is null or p_counter_rate_paise <= 0 then
    return jsonb_build_object('ok', false, 'error', 'counter requires a positive rate');
  end if;
  if v_o.counter_round >= v_o.max_rounds then
    return jsonb_build_object('ok', false, 'error',
      'Maximum negotiation rounds reached (' || v_o.max_rounds || '). Please accept or decline.',
      'rounds_used', v_o.counter_round, 'max_rounds', v_o.max_rounds);
  end if;

  update public.instant_hire_offers
     set status = 'declined', responded_at = now(), decline_reason = 'countered (round ' || counter_round || ')'
   where id = p_offer_id;
  update public.employee_availability
     set status = 'available', last_status_change_at = now(), updated_at = now()
   where user_id = v_user and status = 'busy';

  -- Create a new offer for the buyer with the counter rate
  insert into public.instant_hire_offers (
    contract_id, candidate_id, buyer_id, category_id, urgency, rate_paise,
    status, counter_round, max_rounds, cascade_position, cascade_parent_id, offered_at, expires_at
  ) values (
    v_o.contract_id, v_o.candidate_id, v_o.buyer_id, v_o.category_id, v_o.urgency,
    p_counter_rate_paise, 'offered', v_o.counter_round + 1, v_o.max_rounds,
    v_o.cascade_position, v_o.id, now(), now() + interval '60 seconds'
  )
  returning id into v_new_offer_id;

  perform public.create_notification(
    v_o.buyer_id, 'instant_hire_counter',
    'Counter offer from employee',
    'Employee countered at ₹' || (p_counter_rate_paise/100)::text || ' (round ' || (v_o.counter_round + 1) || ' of ' || v_o.max_rounds || ').',
    '/dashboard/instant-hire/offer/' || v_new_offer_id::text
  );

  return jsonb_build_object(
    'ok', true,
    'status', 'countered',
    'new_offer_id', v_new_offer_id,
    'round', v_o.counter_round + 1,
    'max_rounds', v_o.max_rounds,
    'rate_paise', p_counter_rate_paise
  );
end $$;
grant execute on function public.respond_instant_hire_offer(uuid, text, bigint, text) to authenticated;

-- =============================================================================
-- D) Patch initiate_instant_hire_offer auto-accept branch: also flip the
--    contract from 'pending_acceptance' to 'active'.
-- =============================================================================
create or replace function public.initiate_instant_hire_offer(
  p_contract_id uuid,
  p_candidate_id uuid default null,
  p_urgency     text default 'normal',
  p_expires_in_seconds int default 60
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer uuid := auth.uid();
  v_c record;
  v_cat record;
  v_candidate uuid;
  v_rate bigint;
  v_offer_id uuid;
  v_existing uuid;
  v_expires_at timestamptz := now() + (p_expires_in_seconds || ' seconds')::interval;
  v_auto_accept boolean := false;
begin
  if v_buyer is null then
    raise exception 'Authentication required';
  end if;
  if p_urgency not in ('normal','urgent','critical') then
    raise exception 'urgency must be normal/urgent/critical';
  end if;

  select * into v_c from public.contracts where id = p_contract_id;
  if not found then raise exception 'Contract not found'; end if;
  if v_c.buyer_id <> v_buyer then raise exception 'Not your contract'; end if;
  if v_c.status not in ('active','delivered','pending_acceptance') then
    raise exception 'Contract is not in an instant-hireable state';
  end if;

  select * into v_cat from public.skill_categories where id = v_c.category_id;
  if not found then raise exception 'Contract category not found'; end if;

  if p_candidate_id is not null then
    v_candidate := p_candidate_id;
  else
    raise exception 'Pass an explicit p_candidate_id. Use get_instant_hire_candidates to find the right one.';
  end if;

  select id into v_existing
    from public.instant_hire_offers
   where contract_id = p_contract_id
     and status = 'offered'
     and expires_at > now();
  if v_existing is not null then
    raise exception 'There is already an active instant-hire offer for this contract';
  end if;

  v_rate := public.get_employee_rate(v_candidate, v_c.category_id, coalesce(v_c.pricing_model, 'fixed'));
  if v_rate is null or v_rate <= 0 then v_rate := v_c.agreed_price; end if;

  v_auto_accept := public.should_auto_accept_offer(v_candidate, v_c.category_id, v_rate);

  if v_auto_accept then
    insert into public.instant_hire_offers (
      contract_id, candidate_id, buyer_id, category_id, urgency, rate_paise,
      status, counter_round, max_rounds, cascade_position, offered_at, expires_at,
      responded_at, metadata
    ) values (
      p_contract_id, v_candidate, v_buyer, v_c.category_id, p_urgency, v_rate,
      'accepted', 1, 3, 1, now(), now(), now(),
      jsonb_build_object('auto_accept', true)
    )
    returning id into v_offer_id;

    -- H2 fix: flip the contract from 'pending_acceptance' to 'active'
    update public.contracts
       set status = 'active',
           started_at = coalesce(started_at, now())
     where id = p_contract_id and status = 'pending_acceptance';

    update public.employee_availability
       set status = 'busy',
           current_active_contracts = coalesce(current_active_contracts, 0) + 1,
           current_load_hours = coalesce(current_load_hours, 0) + 1,
           last_status_change_at = now(),
           updated_at = now()
     where user_id = v_candidate;

    perform public.create_notification(
      v_buyer, 'instant_hire_auto_accepted',
      'Auto-accepted · ' || v_c.title,
      'Your Instant Hire offer was auto-accepted by the employee. The contract is now live.',
      '/dashboard/contracts/' || p_contract_id
    );
    perform public.create_notification(
      v_candidate, 'instant_hire_auto_accepted',
      'You auto-accepted a contract',
      'Your auto-accept setting matched this Instant Hire offer. The contract is now live.',
      '/dashboard/contracts/' || p_contract_id
    );

    return jsonb_build_object(
      'ok', true,
      'auto_accepted', true,
      'offer_id', v_offer_id,
      'candidate_id', v_candidate,
      'rate_paise', v_rate,
      'urgency', p_urgency,
      'expires_at', v_expires_at
    );
  end if;

  -- Normal flow: lock the candidate as 'busy' tentatively
  update public.employee_availability
     set status = 'busy', last_status_change_at = now(), updated_at = now()
   where user_id = v_candidate
    and status = 'available';

  insert into public.instant_hire_offers (
    contract_id, candidate_id, buyer_id, category_id, urgency, rate_paise,
    status, counter_round, max_rounds, cascade_position, offered_at, expires_at
  ) values (
    p_contract_id, v_candidate, v_buyer, v_c.category_id, p_urgency, v_rate,
    'offered', 1, 3, 1, now(), v_expires_at
  )
  returning id into v_offer_id;

  perform public.create_notification(
    v_candidate, 'instant_hire_offer',
    'Instant Hire offer · ' || initcap(p_urgency),
    'A buyer wants to hire you for ₹' || (v_rate/100)::text || '. You have ' || p_expires_in_seconds || ' seconds to accept.',
    '/dashboard/instant-hire/offer/' || v_offer_id::text
  );

  return jsonb_build_object(
    'ok', true,
    'auto_accepted', false,
    'offer_id', v_offer_id,
    'candidate_id', v_candidate,
    'rate_paise', v_rate,
    'urgency', p_urgency,
    'expires_at', v_expires_at
  );
end $$;
grant execute on function public.initiate_instant_hire_offer(uuid, uuid, text, int) to authenticated, service_role;

-- Also patch the cron cascade to handle the new state
create or replace function public.initiate_instant_hire_cascade(
  p_contract_id uuid,
  p_expires_in_seconds int default 60
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_c record;
  v_remaining_candidates uuid[];
  v_first uuid;
  v_offer_id uuid;
  v_expires_at timestamptz := now() + (p_expires_in_seconds || ' seconds')::interval;
  v_auto_accept boolean := false;
  v_cascade_position int;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select * into v_c from public.contracts where id = p_contract_id;
  if not found then raise exception 'Contract not found'; end if;
  if v_c.buyer_id <> v_user then raise exception 'Not your contract'; end if;
  if v_c.status not in ('active','delivered','pending_acceptance') then
    raise exception 'Contract is not in a cascade-able state';
  end if;

  v_cascade_position := coalesce((
    select max(cascade_position) from public.instant_hire_offers where contract_id = p_contract_id
  ), 0) + 1;

  v_remaining_candidates := public.get_instant_hire_candidates(v_c.category_id);
  if v_remaining_candidates is null or array_length(v_remaining_candidates, 1) is null then
    -- No more candidates; cancel the contract so it doesn't sit forever
    update public.contracts
       set status = 'cancelled'
     where id = p_contract_id and status in ('active','pending_acceptance');
    return jsonb_build_object('ok', false, 'error', 'No more candidates to try',
                              'contract_cancelled', true);
  end if;

  v_first := v_remaining_candidates[1];
  v_auto_accept := public.should_auto_accept_offer(v_first, v_c.category_id, v_c.agreed_price);

  if v_auto_accept then
    insert into public.instant_hire_offers (
      contract_id, candidate_id, buyer_id, category_id, urgency, rate_paise,
      status, counter_round, max_rounds, cascade_position, offered_at, expires_at,
      responded_at, metadata
    ) values (
      p_contract_id, v_first, v_user, v_c.category_id, 'normal', v_c.agreed_price,
      'accepted', 1, 3, v_cascade_position, now(), now(), now(),
      jsonb_build_object('auto_accept', true, 'cascade', true)
    )
    returning id into v_offer_id;

    -- H2 fix: flip the contract to active on auto-accept
    update public.contracts
       set status = 'active',
           started_at = coalesce(started_at, now())
     where id = p_contract_id and status = 'pending_acceptance';

    update public.employee_availability
       set status = 'busy',
           current_active_contracts = coalesce(current_active_contracts, 0) + 1,
           current_load_hours = coalesce(current_load_hours, 0) + 1,
           last_status_change_at = now(),
           updated_at = now()
     where user_id = v_first;

    return jsonb_build_object(
      'ok', true,
      'auto_accepted', true,
      'offer_id', v_offer_id,
      'candidate_id', v_first,
      'cascade_position', v_cascade_position
    );
  end if;

  insert into public.instant_hire_offers (
    contract_id, candidate_id, buyer_id, category_id, urgency, rate_paise,
    status, counter_round, max_rounds, cascade_position, offered_at, expires_at
  ) values (
    p_contract_id, v_first, v_user, v_c.category_id, 'normal', v_c.agreed_price,
    'offered', 1, 3, v_cascade_position, now(), v_expires_at
  )
  returning id into v_offer_id;

  update public.employee_availability
     set status = 'busy', last_status_change_at = now(), updated_at = now()
   where user_id = v_first and status = 'available';

  perform public.create_notification(
    v_first, 'instant_hire_offer',
    'Instant Hire offer (cascade #' || v_cascade_position || ')',
    'A buyer wants to hire you for ₹' || (v_c.agreed_price/100)::text || '. You have ' || p_expires_in_seconds || ' seconds to accept.',
    '/dashboard/instant-hire/offer/' || v_offer_id::text
  );

  return jsonb_build_object(
    'ok', true,
    'auto_accepted', false,
    'offer_id', v_offer_id,
    'candidate_id', v_first,
    'cascade_position', v_cascade_position
  );
end $$;
grant execute on function public.initiate_instant_hire_cascade(uuid, int) to authenticated, service_role;

-- =============================================================================
-- E) Patch expire_instant_hire_offer: cancel the contract on expire.
-- =============================================================================
create or replace function public.expire_instant_hire_offer(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_o record;
begin
  select * into v_o from public.instant_hire_offers where id = p_offer_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'Offer not found'); end if;
  if v_o.status <> 'offered' then
    return jsonb_build_object('ok', true, 'already_resolved', true, 'status', v_o.status);
  end if;
  if v_o.expires_at > now() then
    return jsonb_build_object('ok', false, 'error', 'Offer has not expired yet');
  end if;

  update public.instant_hire_offers
     set status = 'expired', responded_at = now()
   where id = p_offer_id;
  -- H2 fix: cancel the contract on expire (it never started)
  update public.contracts
     set status = 'cancelled'
   where id = v_o.contract_id and status = 'pending_acceptance';
  update public.employee_availability
     set status = 'available', last_status_change_at = now(), updated_at = now()
   where user_id = v_o.candidate_id and status = 'busy';

  return jsonb_build_object('ok', true, 'status', 'expired');
end $$;
grant execute on function public.expire_instant_hire_offer(uuid) to authenticated, service_role;
