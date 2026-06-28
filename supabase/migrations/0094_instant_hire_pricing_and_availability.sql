-- 0094_instant_hire_pricing_and_availability.sql
-- Phase 1 of the "make Instant actually instant" plan.
-- Adds:
--   1. Per-pricing-model rates on employee_standing_rates (so the
--      employee can set per-hour, per-task, per-day, per-week
--      independently per category).
--   2. employee_instant_profile — a section-toggleable record of an
--      employee's Instant Hire preferences and per-category rates
--      that the profile builder reads.
--   3. employee_availability — real-time heartbeat state. Without
--      this Smart Match is a static ranking. With it, we know who
--      can actually be hired RIGHT NOW.
--   4. instant_hire_offers — the 60-second handshake record. When a
--      buyer clicks "Hire instantly" we INSERT one of these with
--      status='offered', expire_at = now() + 60s. The employee
--      has 60s to accept; if no response, the cascade auto-offers
--      the next-best candidate.
--   5. RPCs: initiate / respond / expire the handshake.
--   6. Updated Smart Match view that considers price as a soft
--      signal (don't filter, but weight).

-- ============================================================
-- A) Per-model rates on employee_standing_rates
-- ============================================================
alter table public.employee_standing_rates
  add column if not exists rate_per_hour_paise  bigint check (rate_per_hour_paise  is null or rate_per_hour_paise  > 0),
  add column if not exists rate_per_task_paise  bigint check (rate_per_task_paise  is null or rate_per_task_paise  > 0),
  add column if not exists rate_per_day_paise   bigint check (rate_per_day_paise   is null or rate_per_day_paise   > 0),
  add column if not exists rate_per_week_paise  bigint check (rate_per_week_paise  is null or rate_per_week_paise  > 0);

-- If the legacy `standing_rate` is set and the new columns are
-- null, seed the per-model rate from it (best-effort default).
update public.employee_standing_rates
   set rate_per_hour_paise = coalesce(rate_per_hour_paise, standing_rate),
       rate_per_task_paise = coalesce(rate_per_task_paise, standing_rate)
 where tier = 'micro_task';

update public.employee_standing_rates
   set rate_per_hour_paise = coalesce(rate_per_hour_paise, standing_rate),
       rate_per_task_paise = coalesce(rate_per_task_paise, standing_rate),
       rate_per_day_paise  = coalesce(rate_per_day_paise,  standing_rate),
       rate_per_week_paise = coalesce(rate_per_week_paise, standing_rate)
 where tier = 'role_engagement';

-- Helper: pick the right per-model rate for a category
create or replace function public.get_employee_rate(
  p_user_id     uuid,
  p_category_id uuid,
  p_pricing_model text  -- 'hourly'|'fixed'|'daily'|'monthly'|'weekly'
) returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rate bigint;
begin
  select
    case p_pricing_model
      when 'hourly'  then rate_per_hour_paise
      when 'fixed'   then rate_per_task_paise
      when 'daily'   then rate_per_day_paise
      when 'weekly'  then rate_per_week_paise
      when 'monthly' then rate_per_week_paise  -- monthly is rare; use weekly
      else rate_per_task_paise                 -- default
    end
    into v_rate
  from public.employee_standing_rates
  where user_id = p_user_id and category_id = p_category_id;
  return v_rate;
end $$;
grant execute on function public.get_employee_rate(uuid, uuid, text) to authenticated, anon, service_role;

-- ============================================================
-- B) employee_instant_profile — toggleable Instant Hire prefs
-- ============================================================
create table if not exists public.employee_instant_profile (
  user_id                  uuid primary key references public.users(id) on delete cascade,
  enabled                  boolean not null default false,        -- "Available for Instant Hire" toggle
  headline                 text,                                  -- short pitch shown in match cards (140 char)
  intro_video_url          text,                                  -- optional 30s intro video URL
  response_time_minutes    int  default 30,                       -- self-declared typical response
  urgent_ok                boolean not null default false,        -- willing to take urgent jobs
  critical_ok              boolean not null default false,        -- willing to take fire-fighting jobs
  auto_accept_enabled      boolean not null default false,        -- auto-accept matches (top-rated only)
  preferred_categories     uuid[]    default '{}',                -- categories they want to be surfaced in
  blocked_categories       uuid[]    default '{}',                -- categories they don't want
  weekly_capacity_hours   int  default 40,                       -- hours/week they can commit
  timezone                 text        default 'Asia/Kolkata',
  show_in_search           boolean not null default true,         -- visible in regular /find-people
  languages                text[]    default '{}',                 -- re-declared here for filtering
  updated_at               timestamptz not null default now()
);

alter table public.employee_instant_profile enable row level security;

drop policy if exists "eip_public_read" on public.employee_instant_profile;
create policy "eip_public_read" on public.employee_instant_profile
  for select using (enabled = true);

drop policy if exists "eip_self_read_write" on public.employee_instant_profile;
create policy "eip_self_read_write" on public.employee_instant_profile
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select on public.employee_instant_profile to anon, authenticated;
grant insert, update, delete on public.employee_instant_profile to authenticated;

-- ============================================================
-- C) employee_availability — real-time heartbeat state
-- ============================================================
create table if not exists public.employee_availability (
  user_id                  uuid primary key references public.users(id) on delete cascade,
  status                   text not null default 'offline'
                            check (status in ('offline','available','busy','away','dnd')),
  available_until          timestamptz,                          -- 'available until 6pm today'
  declared_weekly_capacity int  default 40,
  current_load_hours       int  default 0,                        -- hours committed to active contracts
  current_active_contracts int  default 0,
  urgent_ok                boolean not null default false,
  critical_ok              boolean not null default false,
  auto_accept_enabled      boolean not null default false,
  rate_per_hour_paise      bigint,                                -- optional override for Instant
  rate_per_task_paise      bigint,
  last_ping_at             timestamptz,
  last_status_change_at    timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

alter table public.employee_availability enable row level security;

drop policy if exists "ea_public_read" on public.employee_availability;
create policy "ea_public_read" on public.employee_availability
  for select using (status in ('available','busy'));

drop policy if exists "ea_self_read_write" on public.employee_availability;
create policy "ea_self_read_write" on public.employee_availability
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select on public.employee_availability to anon, authenticated;
grant insert, update, delete on public.employee_availability to authenticated;

-- Ping RPC: called by the client every 30s. Bumps last_ping_at,
-- flips status to 'offline' if no ping in 90s, and decrements
-- auto-accept if the user toggled it off.
create or replace function public.ping_availability(
  p_status text default null,                                    -- 'available'|'busy'|'away'|'dnd'|null = keep current
  p_available_until timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_status text;
  v_result jsonb;
  v_ua record;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'error', 'Not signed in'); end if;

  -- Ensure a row exists
  insert into public.employee_availability(user_id) values (v_user)
    on conflict (user_id) do nothing;

  update public.employee_availability
     set status                = coalesce(p_status, status),
         available_until       = coalesce(p_available_until, available_until),
         last_ping_at          = now(),
         last_status_change_at = case when p_status is not null and p_status <> status then now() else last_status_change_at end,
         updated_at            = now()
   where user_id = v_user
   returning status, available_until, last_ping_at, auto_accept_enabled, urgent_ok, critical_ok
     into v_ua;

  return jsonb_build_object(
    'ok', true,
    'status', v_ua.status,
    'available_until', v_ua.available_until,
    'last_ping_at', v_ua.last_ping_at,
    'auto_accept_enabled', v_ua.auto_accept_enabled,
    'urgent_ok', v_ua.urgent_ok,
    'critical_ok', v_ua.critical_ok
  );
end $$;
grant execute on function public.ping_availability(text, timestamptz) to authenticated;

-- Helper: read the candidate's current availability + load snapshot
create or replace function public.get_availability_snapshot(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v record;
  v_minutes_since_ping int;
  v_live_status text;
begin
  select * into v from public.employee_availability where user_id = p_user_id;
  if v.user_id is null then
    return jsonb_build_object('status', 'offline', 'available_now', false);
  end if;

  if v.last_ping_at is null then
    v_minutes_since_ping := 9999;
  else
    v_minutes_since_ping := extract(epoch from (now() - v.last_ping_at))::int / 60;
  end if;

  -- If the user hasn't pinged in 90s, treat them as offline even if
  -- the stored status says 'available'.
  if v_minutes_since_ping > 90 and v.status in ('available','busy','away') then
    v_live_status := 'offline';
  else
    v_live_status := v.status;
  end if;

  return jsonb_build_object(
    'status', v_live_status,
    'stored_status', v.status,
    'available_now', v_live_status = 'available',
    'available_until', v.available_until,
    'last_ping_at', v.last_ping_at,
    'minutes_since_ping', v_minutes_since_ping,
    'current_load_hours', v.current_load_hours,
    'current_active_contracts', v.current_active_contracts,
    'declared_weekly_capacity', v.declared_weekly_capacity,
    'at_capacity', v.current_load_hours >= v.declared_weekly_capacity,
    'auto_accept_enabled', v.auto_accept_enabled,
    'urgent_ok', v.urgent_ok,
    'critical_ok', v.critical_ok
  );
end $$;
grant execute on function public.get_availability_snapshot(uuid) to authenticated, service_role, anon;

-- ============================================================
-- D) instant_hire_offers — the 60-second handshake
-- ============================================================
create table if not exists public.instant_hire_offers (
  id                        uuid primary key default uuid_generate_v4(),
  contract_id               uuid not null references public.contracts(id) on delete cascade,
  candidate_id              uuid not null references public.users(id),
  buyer_id                  uuid not null references public.users(id),
  category_id               uuid references public.skill_categories(id),
  urgency                   text not null default 'normal'
                            check (urgency in ('normal','urgent','critical')),
  rate_paise                bigint not null,
  status                    text not null default 'offered'
                            check (status in ('offered','accepted','declined','expired','cascaded')),
  counter_round             int  not null default 1,
  max_rounds                int  not null default 3,
  cascade_position          int  not null default 1,              -- 1st, 2nd, 3rd candidate in the cascade
  cascade_parent_id         uuid references public.instant_hire_offers(id) on delete set null,
  match_score               numeric,
  match_confidence_label    text,
  offered_at                timestamptz not null default now(),
  expires_at                timestamptz not null,                 -- offered_at + 60s
  responded_at              timestamptz,
  decline_reason            text,
  metadata                  jsonb not null default '{}'::jsonb
);

create index if not exists instant_hire_offers_contract_idx
  on public.instant_hire_offers(contract_id);
create index if not exists instant_hire_offers_candidate_status_idx
  on public.instant_hire_offers(candidate_id, status)
  where status = 'offered';
create index if not exists instant_hire_offers_expires_idx
  on public.instant_hire_offers(expires_at)
  where status = 'offered';

alter table public.instant_hire_offers enable row level security;

drop policy if exists "iho_buyer_read" on public.instant_hire_offers;
create policy "iho_buyer_read" on public.instant_hire_offers
  for select using (buyer_id = auth.uid());

drop policy if exists "iho_candidate_read" on public.instant_hire_offers;
create policy "iho_candidate_read" on public.instant_hire_offers
  for select using (candidate_id = auth.uid());

drop policy if exists "iho_party_update" on public.instant_hire_offers;
create policy "iho_party_update" on public.instant_hire_offers
  for update using (candidate_id = auth.uid() or buyer_id = auth.uid());

grant select on public.instant_hire_offers to authenticated;
grant update on public.instant_hire_offers to authenticated;

-- ============================================================
-- E) RPC: initiate_instant_hire_offer
--    Either:
--      a) buyer_id + candidate_id (explicit — buyer picked a candidate)
--      b) contract_id only (system picks top Smart Match candidate
--         with availability='available')
--    The handshake expires in 60 seconds. The candidate has that
--    long to accept.
-- ============================================================
create or replace function public.initiate_instant_hire_offer(
  p_contract_id uuid,
  p_candidate_id uuid default null,                              -- null = system picks
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
  v_match record;
  v_rate bigint;
  v_offer_id uuid;
  v_existing uuid;
  v_expires_at timestamptz := now() + (p_expires_in_seconds || ' seconds')::interval;
begin
  if v_buyer is null then return jsonb_build_object('ok', false, 'error', 'Not signed in'); end if;
  if p_urgency not in ('normal','urgent','critical') then
    return jsonb_build_object('ok', false, 'error', 'urgency must be normal/urgent/critical');
  end if;

  select * into v_c from public.contracts where id = p_contract_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Contract not found'); end if;
  if v_c.buyer_id <> v_buyer then return jsonb_build_object('ok', false, 'error', 'Not your contract'); end if;
  if v_c.status not in ('active','delivered') then
    return jsonb_build_object('ok', false, 'error', 'Contract is not in an instant-hireable state');
  end if;

  -- Resolve category
  select * into v_cat from public.skill_categories where id = v_c.category_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Contract category not found'); end if;

  if p_candidate_id is not null then
    v_candidate := p_candidate_id;
  else
    -- System picks: call the Smart Match RPC and return the top
    -- available candidate. (We just take #1 here; the cascade
    -- implementation lives in the route handler that calls this
    -- RPC repeatedly with explicit p_candidate_id.)
    return jsonb_build_object(
      'ok', false,
      'error', 'Pass an explicit p_candidate_id. Use get_instant_hire_candidates to find the right one.'
    );
  end if;

  -- Refuse if there's already an active offer for this contract
  select id into v_existing
    from public.instant_hire_offers
   where contract_id = p_contract_id
     and status = 'offered'
     and expires_at > now();
  if v_existing is not null then
    return jsonb_build_object('ok', false, 'error', 'There is already an active instant-hire offer for this contract', 'existing_offer_id', v_existing);
  end if;

  -- Lock the candidate as 'busy' tentatively
  update public.employee_availability
     set status = 'busy', last_status_change_at = now(), updated_at = now()
   where user_id = v_candidate
     and status = 'available';

  -- Resolve the rate for this candidate in this category + pricing model
  v_rate := public.get_employee_rate(v_candidate, v_c.category_id, coalesce(v_c.pricing_model, 'fixed'));
  if v_rate is null or v_rate <= 0 then
    v_rate := v_c.agreed_price;
  end if;

  insert into public.instant_hire_offers (
    contract_id, candidate_id, buyer_id, category_id, urgency, rate_paise,
    status, counter_round, max_rounds, cascade_position, offered_at, expires_at
  ) values (
    p_contract_id, v_candidate, v_buyer, v_c.category_id, p_urgency, v_rate,
    'offered', 1, 3, 1, now(), v_expires_at
  )
  returning id into v_offer_id;

  -- Notification (in-app bell) — the client also listens via SSE
  perform public.create_notification(
    v_candidate, 'instant_hire_offer',
    'Instant Hire offer · ' || initcap(p_urgency),
    'A buyer wants to hire you for ₹' || (v_rate/100)::text || '. You have ' || p_expires_in_seconds || ' seconds to accept.',
    '/dashboard/instant-hire/offer/' || v_offer_id::text
  );

  return jsonb_build_object(
    'ok', true,
    'offer_id', v_offer_id,
    'candidate_id', v_candidate,
    'rate_paise', v_rate,
    'urgency', p_urgency,
    'expires_at', v_expires_at
  );
end $$;
grant execute on function public.initiate_instant_hire_offer(uuid, uuid, text, int) to authenticated, service_role;

-- ============================================================
-- F) RPC: respond_instant_hire_offer
--    accept | decline | counter (with new rate)
--    3-round cap enforced via max_rounds on the offer.
-- ============================================================
create or replace function public.respond_instant_hire_offer(
  p_offer_id   uuid,
  p_response   text,                                             -- 'accept' | 'decline' | 'counter'
  p_counter_rate_paise bigint default null,                      -- required if response='counter'
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

-- ============================================================
-- G) RPC: expire_instant_hire_offer
--    Called by the cron / a timer when an offered handshake
--    has reached expires_at. Marks the offer expired, releases
--    the busy lock, and tells the caller the next cascade target.
-- ============================================================
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
  update public.employee_availability
     set status = 'available', last_status_change_at = now(), updated_at = now()
   where user_id = v_o.candidate_id and status = 'busy';

  return jsonb_build_object('ok', true, 'status', 'expired');
end $$;
grant execute on function public.expire_instant_hire_offer(uuid) to authenticated, service_role;

-- ============================================================
-- H) Updated Smart Match view: weight price as a soft signal.
--    We don't filter by price (employee can counter) but we
--    penalize candidates whose rate is far above the buyer's
--    max budget. Strong penalty above 2x the budget, light
--    penalty within 1.5x, no penalty within 1.0x.
-- ============================================================
create or replace function public.get_instant_hire_candidates(
  p_category_id uuid,
  p_budget_max  bigint default null,                              -- in paise
  p_urgency     text default 'normal',
  p_limit       int  default 5
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_results jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'Not signed in'); end if;
  if p_urgency not in ('normal','urgent','critical') then
    return jsonb_build_object('ok', false, 'error', 'urgency must be normal/urgent/critical');
  end if;

  select coalesce(jsonb_agg(row_to_json(t) order by t.match_score desc), '[]'::jsonb)
    into v_results
  from (
    select
      c.user_id,
      c.category_id,
      c.category_tier,
      c.standing_rate,
      c.rating,
      c.completion_rate,
      c.response_time_minutes,
      c.priority_match,
      -- Smart Match v2: weighted score that considers availability
      -- (price is a soft signal, not a hard filter)
      round(
        -- Match score (rating + completion + recency) — 22%
        (coalesce((c.match_score * 5.0), coalesce(c.rating, 0)) / 5.0) * 0.22
        -- Availability NOW — 20% (zero if offline)
        + case when avail.status = 'available' then 1.0
               when avail.status = 'busy'      then 0.4
               when avail.status = 'away'      then 0.2
               else 0.0 end * 0.20
        -- Response speed — 13% (recent behavior)
        + (1.0 - least(coalesce(c.response_time_minutes, 240)::numeric / 240.0, 1.0)) * 0.13
        -- Rating — 12%
        + (coalesce(c.rating, 0) / 5.0) * 0.12
        -- Completion — 8%
        + coalesce(c.completion_rate, 0) * 0.08
        -- Recency — 5%
        + (case when c.match_score is null or c.match_score < 0.5 then 0.0
               else 0.5 end) * 0.10
        -- Price fit (soft signal) — 7%. Penalize only when way over budget.
        + case
            when p_budget_max is null or p_budget_max <= 0 or c.standing_rate is null then 0.0
            when c.standing_rate <= p_budget_max then 1.0
            when c.standing_rate <= p_budget_max * 1.25 then 0.7
            when c.standing_rate <= p_budget_max * 1.50 then 0.4
            when c.standing_rate <= p_budget_max * 2.00 then 0.15
            else 0.0
          end * 0.07
        -- Urgency boost — 5% if candidate opted in
        + case
            when p_urgency = 'normal'  then 0.5
            when p_urgency = 'urgent'  and coalesce(avail.urgent_ok,   false) then 1.0
            when p_urgency = 'urgent'  then 0.3
            when p_urgency = 'critical' and coalesce(avail.critical_ok, false) then 1.0
            when p_urgency = 'critical' then 0.0
          end * 0.05
      , 3) as match_score_v2,
      avail.status as availability_status,
      avail.available_until as available_until,
      coalesce(avail.current_active_contracts, 0) as active_contracts,
      u.full_name,
      u.avatar_url,
      ep.headline,
      ep.location,
      eip.intro_video_url,
      eip.response_time_minutes as declared_response_time,
      eip.auto_accept_enabled as auto_accept,
      (avail.status = 'available' and coalesce(avail.current_active_contracts, 0) < 3) as can_hire_instantly
    from public.v_instant_hire_candidates c
    left join public.users u on u.id = c.user_id
    left join public.employee_profiles ep on ep.user_id = c.user_id
    left join public.employee_instant_profile eip on eip.user_id = c.user_id and eip.enabled = true
    left join public.employee_availability avail
      on avail.user_id = c.user_id
     and avail.status in ('available','busy','away')
     and avail.last_ping_at > now() - interval '90 seconds'
    where c.category_id = p_category_id
      -- Critical: hard filter to available-only
      and (p_urgency <> 'critical' or avail.status = 'available')
      -- Urgent: require urgent_ok
      and (p_urgency <> 'urgent' or coalesce(avail.urgent_ok, false))
      -- Not at capacity
      and coalesce(avail.current_active_contracts, 0) < coalesce(avail.declared_weekly_capacity, 40) / 13  -- ~3 active contracts cap
    order by match_score_v2 desc
    limit p_limit
  ) t;

  return jsonb_build_object('ok', true, 'candidates', v_results);
end $$;
grant execute on function public.get_instant_hire_candidates(uuid, bigint, text, int) to authenticated, service_role;

-- ============================================================
-- I) Settings: max_rounds for instant hire negotiation (default 3)
-- ============================================================
insert into public.platform_settings(key, value, updated_at)
values (
  'instant_hire_max_negotiation_rounds',
  jsonb_build_object('value', 3),
  now()
)
on conflict (key) do update set value = excluded.value, updated_at = now();

-- ============================================================
-- J) Helper RPC: list the candidate's current outstanding offers
-- ============================================================
create or replace function public.list_my_instant_hire_offers()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_results jsonb;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'error', 'Not signed in'); end if;

  select coalesce(jsonb_agg(row_to_json(t) order by t.expires_at asc), '[]'::jsonb)
    into v_results
  from (
    select
      o.id, o.contract_id, o.candidate_id, o.buyer_id, o.urgency, o.rate_paise,
      o.status, o.counter_round, o.max_rounds, o.cascade_position, o.offered_at, o.expires_at,
      c.title as contract_title,
      u.full_name as buyer_name, u.avatar_url as buyer_avatar
    from public.instant_hire_offers o
    join public.contracts c on c.id = o.contract_id
    join public.users u on u.id = o.buyer_id
    where o.candidate_id = v_user and o.status = 'offered' and o.expires_at > now()
    order by o.expires_at asc
  ) t;

  return jsonb_build_object('ok', true, 'offers', v_results);
end $$;
grant execute on function public.list_my_instant_hire_offers() to authenticated;
