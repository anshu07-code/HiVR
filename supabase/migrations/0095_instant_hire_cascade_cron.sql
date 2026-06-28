-- 0095_instant_hire_cascade_cron.sql
-- Service-role-targeted RPCs for the auto-cascade cron. The original
-- `initiate_instant_hire_offer` (in 0094) requires auth.uid() to match
-- the contract's buyer_id. The cron acts on behalf of the buyer, so
-- it needs a variant that skips the auth check.
--
-- Also: 3-round cascade is capped per-contract; the cron already
-- tracks this via `cascade_position` on the offer row. Once a
-- contract has had 3 cascaded offers without a response, the
-- cascade is exhausted and the buyer is notified.

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
begin
  if p_urgency not in ('normal','urgent','critical') then
    return jsonb_build_object('ok', false, 'error', 'urgency must be normal/urgent/critical');
  end if;

  -- Load the contract (skip auth check — cron is acting on behalf of buyer)
  select * into v_c from public.contracts where id = p_contract_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Contract not found'); end if;
  if v_c.status not in ('active','delivered') then
    return jsonb_build_object('ok', false, 'error', 'Contract is not in an instant-hireable state');
  end if;

  -- Find the next cascade position based on prior offers for this contract
  select coalesce(max(cascade_position), 0) into v_current_cascade
    from public.instant_hire_offers
   where contract_id = p_contract_id;
  v_current_cascade := v_current_cascade + 1;

  -- Hard cap. If we're past the cap, the caller should have already
  -- notified the buyer. We return a structured 'cascade_exhausted' result.
  if v_current_cascade > v_max_cascade then
    return jsonb_build_object(
      'ok', false,
      'error', 'cascade_exhausted',
      'cascade_position', v_current_cascade,
      'max_cascade', v_max_cascade
    );
  end if;

  -- Refuse if there's already an active offer for this contract
  select id into v_existing
    from public.instant_hire_offers
   where contract_id = p_contract_id
     and status = 'offered'
     and expires_at > now();
  if v_existing is not null then
    return jsonb_build_object('ok', false, 'error', 'There is already an active offer for this contract', 'existing_offer_id', v_existing);
  end if;

  -- Resolve category
  select * into v_cat from public.skill_categories where id = v_c.category_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Contract category not found'); end if;

  -- Lock the candidate as 'busy' tentatively
  update public.employee_availability
     set status = 'busy', last_status_change_at = now(), updated_at = now()
   where user_id = p_candidate_id
     and status = 'available';

  -- Resolve the rate
  v_rate := public.get_employee_rate(p_candidate_id, v_c.category_id, coalesce(v_c.pricing_model, 'fixed'));
  if v_rate is null or v_rate <= 0 then
    v_rate := v_c.agreed_price;
  end if;

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

  -- In-app notification
  perform public.create_notification(
    p_candidate_id, 'instant_hire_offer',
    'Instant Hire offer · round ' || v_current_cascade || ' · ' || initcap(p_urgency),
    'A buyer wants to hire you for ₹' || (v_rate/100)::text || '. You have ' || p_expires_in_seconds || ' seconds to accept.',
    '/dashboard/instant-hire/offer/' || v_offer_id::text
  );

  return jsonb_build_object(
    'ok', true,
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

-- Add a helper to mark an existing offer as 'cascaded' when it was
-- super-seeded by a new offer. (We don't really need a status update
-- because the new offer is in a different row, but having a 'cascaded'
-- status helps with reporting.)
do $$
begin
  -- (No schema change needed; we just document that 'cascaded' is
  -- a valid status in practice. The CHECK constraint already permits it.)
  null;
end $$;

-- Also: an "exhausted" notification kind. This is just a marker so
-- we can count cascade-exhaustion events in admin dashboards later.
-- We use the existing 'instant_hire_cascade_exhausted' kind (see the
-- cron route).
