-- 0096_instant_hire_auto_accept.sql
-- Auto-accept handshake for top-rated pros who opted in.
--
-- When an offer is created (either directly by the buyer or by the
-- cascade cron), we check the candidate's `auto_accept_enabled` flag
-- plus a few preference filters:
--   1. candidate's overall_trust_tier ∈ {track_record, top_rated}
--   2. employee_instant_profile.auto_accept_enabled = true
--   3. category is in the candidate's preferred_categories
--      (or preferred_categories is empty = open to all)
--   4. rate is within ±20% of the candidate's standing_rate for
--      this category (so they don't accidentally accept a low-ball
--      offer through auto-accept)
--   5. current_active_contracts < declared_weekly_capacity / 13
--      (i.e. less than ~3 active contracts)
--
-- If all checks pass, the offer is inserted with status='accepted'
-- (skipping 'offered' entirely), the candidate is marked busy with
-- current_active_contracts += 1, both parties are notified, and the
-- buyer is taken directly to the contract view.

-- Helper: returns true if the candidate qualifies for auto-accept
-- on a particular offer. Called from both initiate RPCs.
create or replace function public.should_auto_accept_offer(
  p_user_id     uuid,
  p_category_id uuid,
  p_rate_paise  bigint
) returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tier text;
  v_eip record;
  v_standing bigint;
  v_active int;
  v_capacity int;
begin
  -- 1. Tier gate: only track_record and top_rated
  select overall_trust_tier into v_tier
    from public.employee_profiles where user_id = p_user_id;
  v_tier := coalesce(v_tier, 'provisional');
  if v_tier not in ('track_record', 'top_rated') then return false; end if;

  -- 2. Auto-accept opt-in
  select * into v_eip from public.employee_instant_profile
    where user_id = p_user_id;
  if v_eip is null or v_eip.enabled = false or v_eip.auto_accept_enabled = false then
    return false;
  end if;

  -- 3. Preferred category filter
  if v_eip.preferred_categories is not null
     and array_length(v_eip.preferred_categories, 1) > 0
     and not (p_category_id = any(v_eip.preferred_categories)) then
    return false;
  end if;

  -- 4. Rate within ±20% of standing rate
  select standing_rate into v_standing
    from public.employee_standing_rates
   where user_id = p_user_id and category_id = p_category_id;
  if v_standing is null or v_standing <= 0 then
    -- No standing rate set; allow auto-accept (the rate was already
    -- accepted by the employee setting it on their profile)
    null;
  elsif p_rate_paise < (v_standing * 80 / 100) or p_rate_paise > (v_standing * 120 / 100) then
    return false;
  end if;

  -- 5. Capacity check: active contracts < ~3 (capacity / 13)
  select coalesce(current_active_contracts, 0), coalesce(declared_weekly_capacity, 40)
    into v_active, v_capacity
    from public.employee_availability
   where user_id = p_user_id;
  if v_active >= (v_capacity / 13) then return false; end if;

  return true;
end $$;
grant execute on function public.should_auto_accept_offer(uuid, uuid, bigint) to service_role, authenticated;

-- Patch the buyer-facing initiate RPC (from 0094) to honour auto-accept
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
  if v_c.status not in ('active','delivered') then
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
    -- Skip the handshake entirely. Insert with status='accepted',
    -- mark the candidate as busy with current_active_contracts += 1.
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
      'contract_id', p_contract_id
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

-- Patch the cron cascade initiate (from 0095) to honour auto-accept
create or replace function public.initiate_instant_hire_cascade(
  p_contract_id uuid,
  p_candidate_id uuid,
  p_urgency     text default 'normal',
  p_expires_in_seconds int default 60
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c record;
  v_cat record;
  v_rate bigint;
  v_existing uuid;
  v_offer_id uuid;
  v_max_cascade int := 3;
  v_current_cascade int := 0;
  v_expires_at timestamptz := now() + (p_expires_in_seconds || ' seconds')::interval;
  v_auto_accept boolean := false;
begin
  if p_urgency not in ('normal','urgent','critical') then
    return jsonb_build_object('ok', false, 'error', 'urgency must be normal/urgent/critical');
  end if;

  select * into v_c from public.contracts where id = p_contract_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Contract not found'); end if;
  if v_c.status not in ('active','delivered') then
    return jsonb_build_object('ok', false, 'error', 'Contract is not in an instant-hireable state');
  end if;

  select coalesce(max(cascade_position), 0) into v_current_cascade
    from public.instant_hire_offers
   where contract_id = p_contract_id;
  v_current_cascade := v_current_cascade + 1;

  if v_current_cascade > v_max_cascade then
    return jsonb_build_object(
      'ok', false,
      'error', 'cascade_exhausted',
      'cascade_position', v_current_cascade,
      'max_cascade', v_max_cascade
    );
  end if;

  select id into v_existing
    from public.instant_hire_offers
   where contract_id = p_contract_id
     and status = 'offered'
     and expires_at > now();
  if v_existing is not null then
    return jsonb_build_object('ok', false, 'error', 'There is already an active offer for this contract', 'existing_offer_id', v_existing);
  end if;

  select * into v_cat from public.skill_categories where id = v_c.category_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Contract category not found'); end if;

  v_rate := public.get_employee_rate(p_candidate_id, v_c.category_id, coalesce(v_c.pricing_model, 'fixed'));
  if v_rate is null or v_rate <= 0 then v_rate := v_c.agreed_price; end if;

  v_auto_accept := public.should_auto_accept_offer(p_candidate_id, v_c.category_id, v_rate);

  if v_auto_accept then
    -- Skip the handshake. The offer goes straight to 'accepted'.
    insert into public.instant_hire_offers (
      contract_id, candidate_id, buyer_id, category_id, urgency, rate_paise,
      status, counter_round, max_rounds, cascade_position, offered_at, expires_at,
      responded_at, metadata
    ) values (
      p_contract_id, p_candidate_id, v_c.buyer_id, v_c.category_id, p_urgency, v_rate,
      'accepted', 1, 3, v_current_cascade, now(), now(), now(),
      jsonb_build_object('auto_accept', true, 'cascade', true, 'parent_round', v_current_cascade - 1)
    )
    returning id into v_offer_id;

    update public.employee_availability
       set status = 'busy',
           current_active_contracts = coalesce(current_active_contracts, 0) + 1,
           current_load_hours = coalesce(current_load_hours, 0) + 1,
           last_status_change_at = now(),
           updated_at = now()
     where user_id = p_candidate_id;

    perform public.create_notification(
      v_c.buyer_id, 'instant_hire_auto_accepted',
      'Auto-accepted · ' || v_c.title,
      'Your Instant Hire offer was auto-accepted. The contract is now live.',
      '/dashboard/contracts/' || p_contract_id
    );
    perform public.create_notification(
      p_candidate_id, 'instant_hire_auto_accepted',
      'You auto-accepted a contract (cascade)',
      'Your auto-accept setting matched this cascaded Instant Hire offer. The contract is now live.',
      '/dashboard/contracts/' || p_contract_id
    );

    return jsonb_build_object(
      'ok', true,
      'auto_accepted', true,
      'offer_id', v_offer_id,
      'candidate_id', p_candidate_id,
      'rate_paise', v_rate,
      'urgency', p_urgency,
      'contract_id', p_contract_id,
      'cascade_position', v_current_cascade,
      'is_cascade', true
    );
  end if;

  -- Normal cascade path: 60s handshake
  update public.employee_availability
     set status = 'busy', last_status_change_at = now(), updated_at = now()
   where user_id = p_candidate_id
     and status = 'available';

  insert into public.instant_hire_offers (
    contract_id, candidate_id, buyer_id, category_id, urgency, rate_paise,
    status, counter_round, max_rounds, cascade_position, offered_at, expires_at,
    metadata
  ) values (
    p_contract_id, p_candidate_id, v_c.buyer_id, v_c.category_id, p_urgency, v_rate,
    'offered', 1, 3, v_current_cascade, now(), v_expires_at,
    jsonb_build_object('cascade', true, 'parent_round', v_current_cascade - 1)
  )
  returning id into v_offer_id;

  perform public.create_notification(
    p_candidate_id, 'instant_hire_offer',
    'Instant Hire offer · round ' || v_current_cascade || ' · ' || initcap(p_urgency),
    'A buyer wants to hire you for ₹' || (v_rate/100)::text || '. You have ' || p_expires_in_seconds || ' seconds to accept.',
    '/dashboard/instant-hire/offer/' || v_offer_id::text
  );

  return jsonb_build_object(
    'ok', true,
    'auto_accepted', false,
    'offer_id', v_offer_id,
    'candidate_id', p_candidate_id,
    'rate_paise', v_rate,
    'urgency', p_urgency,
    'expires_at', v_expires_at,
    'cascade_position', v_current_cascade,
    'is_cascade', true
  );
end $$;
grant execute on function public.initiate_instant_hire_cascade(uuid, uuid, text, int) to service_role;
